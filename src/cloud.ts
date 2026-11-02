import { createClient } from "@supabase/supabase-js";
import { validateBackup, type State } from "./model";
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
  /\/$/,
  "",
);
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const cloudClient =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export interface Snapshot {
  version: number;
  state: State;
  updated_at: string;
}
export interface CloudAPI {
  read(): Promise<Snapshot | null>;
  write(state: State, expectedVersion: number): Promise<Snapshot>;
}
export class SyncConflict extends Error {
  constructor() {
    super("別の端末に新しい記録があります。");
  }
}
function snapshot(value: unknown): Snapshot {
  const row = value as Snapshot;
  if (
    !row ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    typeof row.updated_at !== "string"
  )
    throw new Error(
      "同期データの形式を確認できませんでした。端末内の記録は保持しています。",
    );
  return {
    version: row.version,
    state: validateBackup(row.state),
    updated_at: row.updated_at,
  };
}
export function cloudAPI(userID: string): CloudAPI {
  async function request(path: string, body?: unknown) {
    const { data, error } = await cloudClient!.auth.getSession();
    if (error || !data.session || data.session.user.id !== userID)
      throw new Error("ログインし直してから同期してください。");
    // Capture this user's token. Switching accounts cannot redirect an in-flight write.
    const token = data.session.access_token;
    let response: Response;
    try {
      response = await fetch(`${url}/rest/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          apikey: key!,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(
        "通信できませんでした。この端末に記録を残しています。接続後に再同期できます。",
      );
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (result?.message === "SYNC_CONFLICT") throw new SyncConflict();
      if (response.status === 401)
        throw new Error(
          "ログインの有効期限が切れました。ログインし直してください。",
        );
      if (result?.message === "INVALID_STATE")
        throw new Error(
          "同期できるデータ容量・形式を超えています。JSON バックアップを保存してください。",
        );
      throw new Error(
        "同期できませんでした。接続やアカウント設定を確認して再試行してください。端末内の記録は保持しています。",
      );
    }
    return result;
  }
  return {
    async read() {
      const rows = await request(
        `study_states?select=version,state,updated_at&user_id=eq.${encodeURIComponent(userID)}`,
      );
      if (!Array.isArray(rows) || rows.length > 1)
        throw new Error("同期データを確認できませんでした。");
      return rows.length ? snapshot(rows[0]) : null;
    },
    async write(state, expectedVersion) {
      return snapshot(
        await request("rpc/save_study_state", {
          expected_version: expectedVersion,
          payload: state,
        }),
      );
    },
  };
}
