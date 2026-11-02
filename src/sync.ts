import { installBundledCatalog } from "./catalog";
import {
  initialState,
  recompute,
  uid,
  validateBackup,
  type State,
} from "./model";
import { database } from "./storage";
import { SyncConflict, type CloudAPI, type Snapshot } from "./cloud";
export interface Cache {
  state: State;
  version: number;
  dirty: boolean;
}
export type SyncStatus =
  "loading" | "syncing" | "saved" | "pending" | "error" | "conflict";
export interface SyncView {
  status: SyncStatus;
  error: string;
  conflict: Snapshot | null | undefined;
}
export async function readCache(user: string): Promise<Cache | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state");
    const r = tx.objectStore("state").get(`account:${user}`);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function updateCache(
  user: string,
  change: (cache: Cache | undefined) => Cache,
): Promise<Cache> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite"),
      store = tx.objectStore("state");
    const r = store.get(`account:${user}`);
    let result: Cache;
    let failure: unknown;
    r.onsuccess = () => {
      try {
        result = change(r.result);
        store.put(result, `account:${user}`);
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        failure ||
          new Error(
            "この端末への保存に失敗しました。空き容量を確認してください。",
          ),
      );
    tx.onerror = () => reject(failure || tx.error);
  });
}
/** Add the guest's records; cloud settings and matching record IDs take precedence. */
export function mergeGuest(cloud: State, guest: State): State {
  const problems = [...cloud.problems],
    indices = new Map(problems.map((p, i) => [`${p.book}:${p.number}`, i]));
  const ids = new Set(problems.map((p) => p.id)),
    remap = new Map<string, string>();
  for (const p of guest.problems) {
    const index = indices.get(`${p.book}:${p.number}`);
    if (index === undefined) {
      const id = ids.has(p.id) ? uid() : p.id;
      remap.set(p.id, id);
      ids.add(id);
      indices.set(`${p.book}:${p.number}`, problems.length);
      problems.push({ ...p, id });
    } else {
      const old = problems[index];
      remap.set(p.id, old.id);
      let memo = old.memo;
      if (p.memo && !memo.includes(p.memo))
        memo = memo ? `${memo}\n\n【この端末のメモ】\n${p.memo}` : p.memo;
      if (memo.length > 10000)
        throw new Error(
          "結合後のメモが長すぎます。先にメモを整理してから取り込んでください。",
        );
      problems[index] = {
        ...old,
        memo,
        title: old.title || p.title,
        page: old.page || p.page,
        unit: old.unit || p.unit,
      };
    }
  }
  const attemptIDs = new Set(cloud.attempts.map((a) => a.id)),
    examIDs = new Set(cloud.exams.map((e) => e.id));
  return recompute({
    ...cloud,
    problems,
    attempts: [
      ...cloud.attempts,
      ...guest.attempts
        .filter((a) => !attemptIDs.has(a.id))
        .map((a) => ({ ...a, problem_id: remap.get(a.problem_id)! })),
    ],
    exams: [...cloud.exams, ...guest.exams.filter((e) => !examIDs.has(e.id))],
  });
}
export class SyncEngine {
  private running = false;
  private readPaused = false;
  setReadPaused(paused: boolean) {
    this.readPaused = paused;
    if (!paused) void this.sync();
  }
  private stopped = false;
  private view: SyncView = {
    status: "loading",
    error: "",
    conflict: undefined,
  };
  constructor(
    private user: string,
    private api: CloudAPI,
    private onChange: (cache: Cache, view: SyncView) => void,
  ) {}
  stop() {
    this.stopped = true;
  }
  private publish(
    cache: Cache,
    status: SyncStatus,
    error = "",
    conflict?: Snapshot | null,
  ) {
    this.view = { status, error, conflict };
    if (!this.stopped) this.onChange(cache, this.view);
  }
  async initialize() {
    let cache = await readCache(this.user);
    if (cache) {
      cache = {
        ...cache,
        state: {
          ...validateBackup(cache.state),
          revision: cache.state.revision,
        },
      };
      this.publish(cache, cache.dirty ? "pending" : "saved");
    } else {
      let remote: Snapshot | null = null,
        error = "";
      try {
        remote = await this.api.read();
      } catch (e) {
        error = (e as Error).message;
      }
      if (this.stopped) return;
      cache = await updateCache(
        this.user,
        (existing) =>
          existing || {
            state: {
              ...(remote?.state || installBundledCatalog(initialState())),
              revision: 1,
            },
            version: remote?.version || 0,
            dirty: !remote,
          },
      );
      this.publish(
        cache,
        error ? "error" : cache.dirty ? "pending" : "saved",
        error,
      );
      if (error) return;
    }
    await this.sync();
  }
  async save(state: State) {
    const clean = validateBackup(state);
    const cache = await updateCache(this.user, (old) => {
      if (!old || old.state.revision !== state.revision)
        throw new Error(
          "別のタブで記録が更新されました。画面を再読み込みしてください。",
        );
      return {
        ...old,
        state: { ...clean, revision: state.revision + 1 },
        dirty: true,
      };
    });
    this.publish(
      cache,
      this.view.status === "conflict" ? "conflict" : "pending",
      this.view.error,
      this.view.conflict,
    );
    void this.sync();
    return cache.state;
  }
  async sync() {
    if (this.running || this.stopped || this.view.status === "conflict") return;
    this.running = true;
    try {
      for (let turn = 0; turn < 4 && !this.stopped; turn++) {
        const cache = (await readCache(this.user))!;
        if (this.readPaused && !cache.dirty) {
          this.publish(cache, "saved");
          break;
        }
        this.publish(cache, "syncing");
        if (cache.dirty) {
          const saved = await this.api.write(cache.state, cache.version);
          const next = await updateCache(this.user, (old) => ({
            ...old!,
            version: saved.version,
            dirty: old!.state.revision !== cache.state.revision,
          }));
          this.publish(next, next.dirty ? "pending" : "saved");
          if (!next.dirty) break;
        } else {
          const remote = await this.api.read();
          if (this.readPaused) {
            const latest = (await readCache(this.user))!;
            this.publish(latest, latest.dirty ? "pending" : "saved");
            if (latest.dirty) continue;
            break;
          }
          // A local edit may have completed during the network request.
          if (!remote && cache.version > 0) {
            this.publish(
              cache,
              "conflict",
              "クラウドの記録が見つかりません。",
              null,
            );
            break;
          }
          if (remote && remote.version !== cache.version) {
            const next = await updateCache(this.user, (old) => {
              if (old!.dirty || old!.state.revision !== cache.state.revision)
                return old!;
              return {
                state: { ...remote.state, revision: old!.state.revision + 1 },
                version: remote.version,
                dirty: false,
              };
            });
            this.publish(next, next.dirty ? "pending" : "saved");
            if (next.dirty) continue;
          } else {
            const latest = (await readCache(this.user))!;
            this.publish(latest, latest.dirty ? "pending" : "saved");
            if (latest.dirty) continue;
          }
          break;
        }
      }
    } catch (e) {
      const cache = (await readCache(this.user))!;
      if (e instanceof SyncConflict) {
        try {
          const remote = await this.api.read();
          this.publish(
            cache,
            "conflict",
            "別の端末の変更と競合しています。両方の記録を確認してください。",
            remote,
          );
        } catch (err) {
          this.publish(cache, "error", (err as Error).message);
        }
      } else this.publish(cache, "error", (e as Error).message);
    } finally {
      this.running = false;
    }
  }
  async resolve(choice: "local" | "remote") {
    if (this.running || this.view.status !== "conflict") return;
    const remote = this.view.conflict;
    const cache = await updateCache(this.user, (old) => {
      if (choice === "remote")
        return {
          state: {
            ...(remote?.state || installBundledCatalog(initialState())),
            revision: old!.state.revision + 1,
          },
          version: remote?.version || 0,
          dirty: !remote,
        };
      return { ...old!, version: remote?.version || 0, dirty: true };
    });
    this.publish(cache, cache.dirty ? "pending" : "saved");
    await this.sync();
  }
}
