import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { initialState } from "./model";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
async function asUser(id: string | null, role = "authenticated") {
  await db.exec(`reset role;set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id || "",
  ]);
}
async function write(version: number, payload: unknown = initialState()) {
  return (
    await db.query<{ saved: { version: number } }>(
      "select public.save_study_state($1,$2::jsonb) as saved",
      [version, JSON.stringify(payload)],
    )
  ).rows[0].saved;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth,public to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${alice}'),('${bob}');`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_study_sync.sql", import.meta.url),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("実際のPostgreSQLで認証・ユーザー分離・同期競合を検証", () => {
  it("未ログインの読み書きを拒否し、ログインユーザーだけ初回作成できる", async () => {
    await asUser(null, "anon");
    await expect(write(0)).rejects.toThrow("permission denied");
    await asUser(null);
    await expect(write(0)).rejects.toThrow("AUTH_REQUIRED");
    await asUser(alice);
    expect((await write(0)).version).toBe(1);
  });
  it("他人のデータを読めず、別ユーザーとして独立した保存先を持つ", async () => {
    await asUser(bob);
    expect(
      (await db.query("select * from public.study_states")).rows,
    ).toHaveLength(0);
    expect((await write(0)).version).toBe(1);
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.study_states",
        )
      ).rows.map((r) => r.user_id),
    ).toEqual([bob]);
    await expect(
      db.query("update public.study_states set version=100"),
    ).rejects.toThrow("permission denied");
  });
  it("古いバージョンの端末は新しい記録を上書きできない", async () => {
    await asUser(alice);
    expect((await write(1)).version).toBe(2);
    await expect(write(1)).rejects.toThrow("SYNC_CONFLICT");
    await expect(write(0)).rejects.toThrow("SYNC_CONFLICT");
    expect(
      (
        await db.query<{ version: number }>(
          "select version from public.study_states",
        )
      ).rows[0].version,
    ).toBe(2);
  });
  it("無効なペイロードは保存せず、再適用しても権限を維持する", async () => {
    await expect(write(2, {})).rejects.toThrow("INVALID_STATE");
    await db.exec("reset role");
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_study_sync.sql", import.meta.url),
        "utf8",
      ),
    );
    await asUser(alice);
    expect(
      (await db.query("select * from public.study_states")).rows,
    ).toHaveLength(1);
  });
});
