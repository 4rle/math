import { describe, it, expect } from "vitest";
import {
  initialState,
  applyImport,
  parseNumbers,
  parseCSV,
  recompute,
  jstDay,
  dailyCandidates,
  fieldProblems,
  examCandidates,
  candidateReason,
  validateBackup,
  exportCSV,
  parseRanges,
  type State,
  type Grade,
  type Exam,
} from "./model";
function fixture() {
  return applyImport(
    initialState(),
    [125, 128, 132, 140, 151, 152, 153, 154, 155, 156].map((number) => ({
      book: "1A",
      stars: 3,
      number,
      line: 1,
    })),
    false,
  );
}
function record(
  s: State,
  number: number,
  grade: Grade,
  at = "2026-10-25T03:00:00.000Z",
) {
  const id = s.problems.find((p) => p.number === number)!.id;
  return recompute({
    ...s,
    attempts: [
      ...s.attempts,
      { id: crypto.randomUUID(), problem_id: id, grade, at, memo: "" },
    ],
  });
}
const exam = (overrides: Partial<Exam> = {}): Exam => ({
  id: "exam",
  name: "全国模試",
  date: "2026-11-01",
  start_on: "2026-10-18",
  book: "1A",
  stars: [3, 4],
  unit: "",
  ranges: "",
  ...overrides,
});
describe("問題登録", () => {
  it("全角・空白・改行・重複を正規化し、不正値を明示する", () => {
    expect(parseNumbers("１２５，128\n125 132")).toEqual({
      numbers: [125, 128, 132],
      errors: [],
      duplicates: 1,
    });
    expect(parseNumbers(",, \n").numbers).toEqual([]);
    expect(parseNumbers("0 -1 1.5 abc 9007199254740992").errors).toHaveLength(
      5,
    );
  });
  it("参考書と番号で識別し、難度変更後も履歴を保持する", () => {
    let s = record(fixture(), 125, "C");
    const id = s.problems[0].id;
    s = applyImport(
      s,
      [
        { book: "2B", stars: 4, number: 125, line: 1 },
        { book: "1A", stars: 4, number: 125, line: 2 },
      ],
      true,
    );
    expect(s.problems.filter((p) => p.number === 125)).toHaveLength(2);
    expect(s.problems.find((p) => p.id === id)).toMatchObject({
      stars: 4,
      latest_grade: "C",
    });
    expect(s.attempts).toHaveLength(1);
  });
  it("BOM・列の並べ替え・引用符・改行・空行に対応する", () => {
    const result = parseCSV(
      '\uFEFFnumber,unit,stars,book\r\n125,"三角比, 基礎",3,1A\r\n\r\n128,"二行\nの単元",4,2B',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0].unit).toBe("三角比, 基礎");
    expect(result.rows[1].unit).toBe("二行\nの単元");
  });
  it("不正行の物理行番号と、矛盾した重複を報告する", () => {
    const result = parseCSV(
      "book,stars,number\n1A,3,125\n1A,4,125\n9X,3,12\n1A,3,0",
    );
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("3行目");
    expect(result.duplicates).toBe(1);
    expect(parseCSV("book,stars,number\ntoString,3,5").errors).toHaveLength(1);
    expect(
      parseCSV('book,stars,number\n1A,3,"125').errors.length,
    ).toBeGreaterThan(0);
  });
  it("CSV 再取り込みで履歴や、unit 列なしの単元を消さない", () => {
    let s = fixture();
    s.problems[0].unit = "三角比";
    s = record(s, 125, "B");
    const result = applyImport(
      s,
      parseCSV("book,stars,number\n1A,3,125").rows,
      false,
    );
    expect(result.problems[0].unit).toBe("三角比");
    expect(result.attempts).toHaveLength(1);
    const roundTrip = parseCSV(exportCSV(result));
    expect(roundTrip.errors).toEqual([]);
    expect(roundTrip.rows).toHaveLength(10);
  });
});
describe("日本時間・候補・取り消し", () => {
  it("日本時間の午前0時を日付境界にする", () => {
    expect(jstDay("2026-10-25T14:59:59Z")).toBe("2026-10-25");
    expect(jstDay("2026-10-25T15:00:00Z")).toBe("2026-10-26");
  });
  it("翌日の C・D を候補にせず、実学習日から7日後、Bは14日後にする", () => {
    let s = record(record(record(fixture(), 125, "B"), 128, "C"), 132, "D");
    for (const p of s.problems.slice(0, 3))
      expect(candidateReason(s, p, "2026-10-26")).toBeNull();
    expect(candidateReason(s, s.problems[1], "2026-11-01")).toBe("復習候補");
    expect(candidateReason(s, s.problems[0], "2026-11-07")).toBeNull();
    expect(candidateReason(s, s.problems[0], "2026-11-08")).toBe("復習候補");
    s = record(s, 128, "D", "2026-11-03T00:00:00.000Z");
    expect(s.problems[1].review_available_on).toBe("2026-11-10");
  });
  it("Aは経過日数で変わらず、Eは即候補。未着手も先頭に残る", () => {
    const s = record(record(fixture(), 125, "A"), 128, "E");
    expect(candidateReason(s, s.problems[0], "2027-01-01")).toBeNull();
    expect(candidateReason(s, s.problems[1])).toBe("要再学習");
    const cards = fieldProblems(s);
    expect(cards[0].latest_grade).toBeNull();
    expect(cards.slice(0, 8).some((p) => p.latest_grade === "E")).toBe(true);
    expect(s.problems[0].latest_grade).toBe("A");
  });
  it("初回記録だけを新規件数に加え、復習は加えない", () => {
    let s = record(fixture(), 125, "C", "2026-10-24T01:00:00.000Z");
    s = record(s, 125, "A");
    expect(dailyCandidates(s, "2026-10-25").size).toBe(3);
    s = record(s, 128, "E");
    expect(dailyCandidates(s, "2026-10-25").size).toBe(2);
    s = record(s, 128, "C");
    expect(dailyCandidates(s, "2026-10-25").size).toBe(2);
  });
  it("取り消し後に最新評価・候補日・最終自力完答日が戻る", () => {
    let s = record(
      record(fixture(), 125, "C", "2026-10-18T00:00:00.000Z"),
      125,
      "A",
    );
    s = recompute({ ...s, attempts: s.attempts.slice(0, -1) });
    expect(s.problems[0]).toMatchObject({
      latest_grade: "C",
      review_available_on: "2026-10-25",
      last_self_solved_at: null,
    });
    s = recompute({ ...s, attempts: [] });
    expect(s.problems[0].latest_grade).toBeNull();
  });
  it("難度や参考書の表示範囲を守る", () => {
    const s = fixture();
    s.settings.stars = [4];
    expect(fieldProblems(s)).toEqual([]);
    s.settings.stars = [3, 4];
    s.settings.book = "2B";
    expect(fieldProblems(s)).toEqual([]);
  });
});
describe("模試前確認", () => {
  it("範囲内の A を戻し、確認後は同じ模試の候補から外す", () => {
    let s = record(fixture(), 125, "A", "2026-10-01T03:00:00.000Z");
    s.exams = [exam({ ranges: "125-128" })];
    expect(examCandidates(s, s.problems[0], "2026-10-17")).toHaveLength(0);
    expect(examCandidates(s, s.problems[0], "2026-10-25")).toHaveLength(1);
    s = record(s, 125, "A");
    expect(examCandidates(s, s.problems[0], "2026-10-25")).toHaveLength(0);
  });
  it("模試当日を含み、翌日終了。複数の模試を区別する", () => {
    let s = record(fixture(), 125, "A", "2026-10-01T03:00:00.000Z");
    s.exams = [
      exam(),
      exam({ id: "later", start_on: "2026-10-27", date: "2026-11-10" }),
    ];
    expect(examCandidates(s, s.problems[0], "2026-11-01")).toHaveLength(2);
    expect(examCandidates(s, s.problems[0], "2026-11-02")).toHaveLength(1);
    s = record(s, 125, "A");
    expect(
      examCandidates(s, s.problems[0], "2026-10-28").map((e) => e.id),
    ).toEqual(["later"]);
  });
  it("対象参考書・難度・単元・番号範囲をすべて適用する", () => {
    const s = record(fixture(), 125, "A", "2026-10-01T03:00:00.000Z");
    s.exams = [
      exam({ book: "2B" }),
      exam({ id: "x", stars: [4] }),
      exam({ id: "y", ranges: "128-140" }),
      exam({ id: "z", unit: "三角比" }),
    ];
    expect(examCandidates(s, s.problems[0], "2026-10-25")).toEqual([]);
    expect(() => parseRanges("140-125")).toThrow();
    expect(() => parseRanges("0")).toThrow();
  });
});
describe("バックアップの整合性", () => {
  it("履歴・設定・模試を復元し、派生値は履歴から再計算する", () => {
    const s = record(fixture(), 125, "C");
    s.exams = [exam()];
    s.settings.intervals.C = 10;
    s.problems[0].latest_grade = "A";
    const restored = validateBackup(JSON.parse(JSON.stringify(s)));
    expect(restored.problems[0].latest_grade).toBe("C");
    expect(restored.problems[0].review_available_on).toBe("2026-11-04");
    expect(restored.exams).toHaveLength(1);
  });
  it("孤立履歴、重複、無効な設定・日付のファイルを拒否する", () => {
    const s = record(fixture(), 125, "E");
    expect(() => validateBackup({ ...s, problems: [] })).toThrow();
    expect(() =>
      validateBackup({ ...s, problems: [...s.problems, s.problems[0]] }),
    ).toThrow();
    expect(() =>
      validateBackup({ ...s, settings: { ...s.settings, daily: -1 } }),
    ).toThrow();
    expect(() =>
      validateBackup({ ...s, exams: [exam({ date: "2026-02-30" })] }),
    ).toThrow();
  });
});

describe("保存する入力の整合性", () => {
  it("長すぎる単元を CSV で拒否し、再読み込み時の破損を防ぐ", () => {
    expect(
      parseCSV(`book,stars,number,unit\n1A,3,125,${"長".repeat(201)}`)
        .errors[0],
    ).toContain("200文字以内");
  });
  it("バックアップのタイムゾーン付き日時を比較可能な UTC に揃える", () => {
    const s = fixture();
    s.attempts = [
      {
        id: "first",
        problem_id: s.problems[0].id,
        grade: "C",
        at: "2026-10-25T10:00:00+09:00",
        memo: "",
      },
      {
        id: "second",
        problem_id: s.problems[0].id,
        grade: "A",
        at: "2026-10-25T02:00:00Z",
        memo: "",
      },
    ];
    const restored = validateBackup(s);
    expect(restored.problems[0].latest_grade).toBe("A");
    expect(restored.attempts[0].at).toBe("2026-10-25T01:00:00.000Z");
  });
});
