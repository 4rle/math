import { describe, it, expect } from "vitest";
import rows from "./data/focusgold.json";
import { installBundledCatalog } from "./catalog";
import {
  canonicalNumber,
  compareNumbers,
  inNumberRange,
} from "./problem-number";
import {
  initialState,
  applyImport,
  recompute,
  validateBackup,
  parseNumbers,
  parseCSV,
  exportCSV,
  parseRanges,
  examCandidates,
} from "./model";

describe("同梱した2冊のカタログ", () => {
  it("全714問を元の難度・タイトル・ページのまま一意に登録する", () => {
    const state = installBundledCatalog(initialState());
    expect(state.problems).toHaveLength(714);
    expect(state.problems.filter((p) => p.book === "1A")).toHaveLength(303);
    expect(state.problems.filter((p) => p.book === "2B")).toHaveLength(411);
    expect(state.problems.filter((p) => p.book === "3C")).toHaveLength(0);
    expect(new Set(state.problems.map((p) => p.id)).size).toBe(714);
    for (const row of rows) {
      const p = state.problems.find(
        (p) => p.book === row.book && p.number === row.number,
      );
      expect(p).toMatchObject({ ...row, latest_grade: null });
    }
    expect(state.problems.filter((p) => p.stars === 1)).toHaveLength(69);
    expect(state.problems.filter((p) => p.stars === 2)).toHaveLength(309);
    expect(state.problems.filter((p) => p.stars === 3)).toHaveLength(269);
    expect(state.problems.filter((p) => p.stars === 4)).toHaveLength(67);
    expect(validateBackup(state).problems).toHaveLength(714);
  });
  it("既存のID・履歴・難度・メモ・単元・設定と独自問題を保持して不足分だけ追加する", () => {
    let legacy = applyImport(
      initialState(),
      [
        { book: "1A", number: 1, stars: 4, unit: "自分の単元", line: 1 },
        { book: "3C", number: 900, stars: 3, line: 1 },
      ],
      false,
    );
    const original = legacy.problems[0];
    original.memo = "残すメモ";
    legacy.settings.stars = [3, 4];
    legacy.attempts.push({
      id: "old-attempt",
      problem_id: original.id,
      grade: "D",
      at: "2026-10-25T00:00:00Z",
      memo: "履歴",
    });
    legacy = recompute(legacy);
    const merged = installBundledCatalog(legacy);
    expect(merged.problems).toHaveLength(715);
    expect(merged.problems[0]).toMatchObject({
      id: original.id,
      latest_grade: "D",
      stars: 4,
      memo: "残すメモ",
      unit: "自分の単元",
      title: "多項式の加法・減法",
      page: "27",
    });
    expect(merged.attempts).toEqual(legacy.attempts);
    expect(merged.settings).toEqual(legacy.settings);
    expect(installBundledCatalog(merged)).toBe(merged);
    const removed = {
      ...merged,
      problems: merged.problems.filter((p) => p.number !== 2),
    };
    expect(installBundledCatalog(removed).problems).not.toContainEqual(
      expect.objectContaining({ number: 2 }),
    );
  });
  it("バックアップとCSVで接頭辞・難度1〜4・タイトル・ページが復元できる", () => {
    const state = installBundledCatalog(initialState());
    const backup = validateBackup(JSON.parse(JSON.stringify(state)));
    expect(backup.problems.find((p) => p.number === "C1.79")).toMatchObject({
      book: "2B",
      title: "球面と平面の交線",
      stars: 4,
      page: "C1-150",
    });
    const imported = parseCSV(exportCSV(state));
    expect(imported.errors).toEqual([]);
    const restored = applyImport(initialState(), imported.rows, false);
    expect(
      restored.problems.map(({ book, number, stars, title, page }) => ({
        book,
        number,
        stars,
        title,
        page,
      })),
    ).toEqual(
      [...state.problems]
        .sort(
          (a, b) =>
            a.book.localeCompare(b.book) || compareNumbers(a.number, b.number),
        )
        .map(({ book, number, stars, title, page }) => ({
          book,
          number,
          stars,
          title,
          page,
        })),
    );
    expect(parseCSV("book,stars,number\n2BC,1,B1.1").rows[0]).toMatchObject({
      book: "2B",
      stars: 1,
      number: "B1.1",
    });
  });
});
describe("数学B・Cの例題番号", () => {
  it("番号を正規化して自然順に並べ、数値の小数とは混同しない", () => {
    expect(parseNumbers("Ｃ１．７９ B1.10 B1.2 ２ B1.02").numbers).toEqual([
      2,
      "B1.2",
      "B1.10",
      "C1.79",
    ]);
    expect(parseNumbers("1.5 0 -1 C1.0 C1.1.2").errors).toHaveLength(5);
    expect(canonicalNumber("b2.１９")).toBe("B2.19");
    expect(canonicalNumber(9007199254740992)).toBeNull();
  });
  it("模試の範囲を接頭辞ごとに判定する", () => {
    const range = parseRanges("B1.1-B1.10, C1.79");
    expect(inNumberRange("B1.9", range[0])).toBe(true);
    expect(inNumberRange("B2.9", range[0])).toBe(false);
    expect(inNumberRange(9, range[0])).toBe(false);
    expect(() => parseRanges("B1.1-C1.10")).toThrow();
    let state = installBundledCatalog(initialState());
    const problem = state.problems.find((p) => p.number === "C1.79")!;
    state.attempts.push({
      id: "old-a",
      problem_id: problem.id,
      grade: "A",
      at: "2026-10-01T00:00:00Z",
      memo: "",
    });
    state.exams.push({
      id: "exam",
      name: "模試",
      book: "2B",
      stars: [4],
      unit: "",
      ranges: "C1.75-C1.81",
      start_on: "2026-10-20",
      date: "2026-11-05",
    });
    state = recompute(state);
    expect(
      examCandidates(
        state,
        state.problems.find((p) => p.id === problem.id)!,
        "2026-11-01",
      ),
    ).toHaveLength(1);
  });
});
