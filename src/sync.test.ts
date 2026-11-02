import { describe, it, expect } from "vitest";
import { applyImport, initialState, recompute, validateBackup } from "./model";
import { mergeGuest } from "./sync";
describe("ログイン前の記録の取り込み", () => {
  it("同じ問題のIDを照合し、履歴を追加。設定・難度はアカウントを優先し再取り込みで重複しない", () => {
    const cloud = applyImport(
      initialState(),
      [{ book: "1A", number: 125, stars: 4, line: 1 }],
      false,
    );
    const guest = applyImport(
      initialState(),
      [
        { book: "1A", number: 125, stars: 3, line: 1 },
        { book: "2B", number: "C1.79", stars: 4, line: 1 },
      ],
      false,
    );
    cloud.problems[0].memo = "クラウドメモ";
    guest.problems[0].memo = "端末メモ";
    cloud.settings.daily = 9;
    guest.attempts.push({
      id: "guest-a",
      problem_id: guest.problems[0].id,
      grade: "C",
      at: "2026-10-01T00:00:00Z",
      memo: "確認",
    });
    guest.exams.push({
      id: "guest-exam",
      name: "模試",
      date: "2026-11-10",
      start_on: "2026-10-27",
      book: "2B",
      stars: [4],
      ranges: "C1.79",
      unit: "",
    });
    const merged = mergeGuest(cloud, guest);
    expect(merged.problems).toHaveLength(2);
    expect(merged.problems[0]).toMatchObject({
      id: cloud.problems[0].id,
      stars: 4,
      latest_grade: "C",
    });
    expect(merged.attempts[0].problem_id).toBe(cloud.problems[0].id);
    expect(merged.settings.daily).toBe(9);
    expect(merged.problems[0].memo).toContain("端末メモ");
    expect(mergeGuest(merged, guest)).toEqual(merged);
    expect(validateBackup(merged).exams).toHaveLength(1);
  });
  it("アカウント側で修正済みの同じIDの履歴を古いゲスト記録で戻さない", () => {
    let cloud = applyImport(
      initialState(),
      [{ book: "1A", number: 125, stars: 4, line: 1 }],
      false,
    );
    cloud.attempts.push({
      id: "same",
      problem_id: cloud.problems[0].id,
      grade: "A",
      at: "2026-10-01T00:00:00Z",
      memo: "修正済み",
    });
    cloud = recompute(cloud);
    const guest = structuredClone(cloud);
    guest.attempts[0].grade = "D";
    expect(mergeGuest(cloud, guest).attempts).toEqual(cloud.attempts);
  });
});
