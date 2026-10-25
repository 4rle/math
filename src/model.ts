export const BOOKS = { "1A": "Ⅰ＋A", "2B": "Ⅱ＋B", "3C": "Ⅲ＋C" } as const;
export type Book = keyof typeof BOOKS;
export const GRADES = {
  A: ["自力完答", "方針も解説も見ず、最後まで解けた"],
  B: ["方針だけ確認", "方針を一度見て、閉じて解けた"],
  C: ["解説を少し確認", "解説を部分的に確認しながら解けた"],
  D: ["解説を追って理解", "解説を見ながら順を追って解けた"],
  E: ["解説でも不明", "分からない箇所が残っている"],
} as const;
export type Grade = keyof typeof GRADES;
export interface Problem {
  id: string;
  book: Book;
  number: number;
  stars: 3 | 4;
  unit: string;
  memo: string;
  created_at: string;
  latest_grade: Grade | null;
  last_attempt_at: string | null;
  last_self_solved_at: string | null;
  review_available_on: string | null;
}
export interface Attempt {
  id: string;
  problem_id: string;
  at: string;
  grade: Grade;
  memo: string;
}
export interface Exam {
  id: string;
  name: string;
  date: string;
  book: Book;
  stars: number[];
  unit: string;
  ranges: string;
  start_on: string;
}
export interface Settings {
  book: Book;
  stars: number[];
  unit: string;
  mode: "candidates" | "all";
  daily: number;
  intervals: { B: number; C: number; D: number };
  exam_days: number;
  motion: boolean;
}
export interface State {
  version: 1;
  revision: number;
  problems: Problem[];
  attempts: Attempt[];
  exams: Exam[];
  settings: Settings;
}
export const initialState = (): State => ({
  version: 1,
  revision: 0,
  problems: [],
  attempts: [],
  exams: [],
  settings: {
    book: "1A",
    stars: [3, 4],
    unit: "",
    mode: "candidates",
    daily: 3,
    intervals: { B: 14, C: 7, D: 7 },
    exam_days: 14,
    motion: true,
  },
});
export const uid = () => crypto.randomUUID();
export const jstDay = (time: string | Date = new Date()) =>
  new Date(new Date(time).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const addDays = (day: string, days: number) =>
  new Date(Date.parse(day + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const dateTime = (at: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
export const dateOnly = (at: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(at));
export const normalize = (text: string) => text.normalize("NFKC").trim();
const positive = (s: string) =>
  /^\d+$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0;
export function parseNumbers(text: string): {
  numbers: number[];
  errors: string[];
  duplicates: number;
} {
  const tokens = normalize(text)
    .split(/[,、\s]+/)
    .filter(Boolean);
  const errors = tokens
    .filter((t) => !positive(t))
    .map((t) => `「${t}」は正の整数ではありません。`);
  const valid = tokens.filter(positive).map(Number);
  return {
    numbers: [...new Set(valid)].sort((a, b) => a - b),
    errors,
    duplicates: valid.length - new Set(valid).size,
  };
}
export function parseRanges(text: string): [number, number][] {
  if (!text.trim()) return [];
  return normalize(text)
    .split(/[,、\s]+/)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+)(?:[-–〜~](\d+))?$/);
      if (!match || !positive(match[1]) || (match[2] && !positive(match[2])))
        throw new Error(`範囲「${part}」を確認してください。例：125-140, 150`);
      const a = Number(match[1]),
        b = Number(match[2] || match[1]);
      if (a > b) throw new Error("番号範囲は小さい番号から指定してください。");
      return [a, b];
    });
}
export function recompute(state: State): State {
  const byProblem = new Map<string, Attempt[]>();
  for (const a of state.attempts) {
    const items = byProblem.get(a.problem_id) || [];
    items.push(a);
    byProblem.set(a.problem_id, items);
  }
  return {
    ...state,
    problems: state.problems.map((p) => {
      const history = (byProblem.get(p.id) || []).sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      const last = history.at(-1),
        lastA = history.filter((a) => a.grade === "A").at(-1);
      return {
        ...p,
        latest_grade: last?.grade || null,
        last_attempt_at: last?.at || null,
        last_self_solved_at: lastA?.at || null,
        review_available_on:
          last && ["B", "C", "D"].includes(last.grade)
            ? addDays(
                jstDay(last.at),
                state.settings.intervals[last.grade as "B" | "C" | "D"],
              )
            : null,
      };
    }),
  };
}
export const isActiveExam = (exam: Exam, today = jstDay()) =>
  exam.start_on <= today && today <= exam.date;
export function examMatches(exam: Exam, p: Problem) {
  const ranges = parseRanges(exam.ranges);
  return (
    exam.book === p.book &&
    exam.stars.includes(p.stars) &&
    (!exam.unit || exam.unit === p.unit) &&
    (!ranges.length || ranges.some(([a, b]) => a <= p.number && p.number <= b))
  );
}
export function examCandidates(state: State, p: Problem, today = jstDay()) {
  if (p.latest_grade !== "A") return [];
  return state.exams.filter(
    (exam) =>
      isActiveExam(exam, today) &&
      examMatches(exam, p) &&
      !state.attempts.some(
        (a) =>
          a.problem_id === p.id &&
          a.grade === "A" &&
          jstDay(a.at) >= exam.start_on &&
          jstDay(a.at) <= exam.date &&
          jstDay(a.at) <= today,
      ),
  );
}
export function candidateReason(
  state: State,
  p: Problem,
  today = jstDay(),
): string | null {
  if (!p.latest_grade) return "未着手";
  if (p.latest_grade === "E") return "要再学習";
  if (p.latest_grade === "A")
    return examCandidates(state, p, today).length ? "模試前の確認" : null;
  return p.review_available_on && p.review_available_on <= today
    ? "復習候補"
    : null;
}
export const inScope = (state: State, p: Problem) =>
  p.book === state.settings.book &&
  state.settings.stars.includes(p.stars) &&
  (!state.settings.unit || state.settings.unit === p.unit);
export function fieldProblems(state: State, today = jstDay()) {
  const scope = state.problems.filter((p) => inScope(state, p));
  if (state.settings.mode === "all")
    return scope.sort((a, b) => a.number - b.number);
  const fresh = scope
    .filter((p) => !p.latest_grade)
    .sort((a, b) => a.number - b.number);
  const reviews = scope
    .filter((p) => p.latest_grade && candidateReason(state, p, today))
    .sort((a, b) => {
      const rank = (p: Problem) =>
        p.latest_grade === "E" ? 0 : p.latest_grade === "A" ? 2 : 1;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.latest_grade === "A" && b.latest_grade === "A") {
        const old = (a.last_self_solved_at || "").localeCompare(
          b.last_self_solved_at || "",
        );
        if (old) return old;
        const hadDifficult = (p: Problem) =>
          state.attempts.some(
            (h) => h.problem_id === p.id && ["C", "D", "E"].includes(h.grade),
          );
        return (
          Number(hadDifficult(b)) - Number(hadDifficult(a)) ||
          a.number - b.number
        );
      }
      return (
        (a.last_attempt_at || "").localeCompare(b.last_attempt_at || "") ||
        a.number - b.number
      );
    });
  // 未着手を先頭にしつつ、E や復習候補も最初の画面で見失わない。
  const result: Problem[] = [];
  for (
    let f = 0, r = 0;
    f < fresh.length || r < reviews.length;
    f += 6, r += 2
  ) {
    result.push(...fresh.slice(f, f + 6), ...reviews.slice(r, r + 2));
  }
  return result;
}
export function dailyCandidates(state: State, today = jstDay()) {
  const first = new Map<string, string>();
  for (const a of state.attempts)
    if (!first.has(a.problem_id) || a.at < first.get(a.problem_id)!)
      first.set(a.problem_id, a.at);
  const done = state.problems.filter(
    (p) =>
      inScope(state, p) &&
      first.has(p.id) &&
      jstDay(first.get(p.id)!) === today,
  ).length;
  return new Set(
    state.problems
      .filter((p) => inScope(state, p) && !p.latest_grade)
      .sort((a, b) => a.number - b.number)
      .slice(0, Math.max(0, state.settings.daily - done))
      .map((p) => p.id),
  );
}
export interface ImportRow {
  book: Book;
  stars: 3 | 4;
  number: number;
  unit?: string;
  line: number;
}
export interface ImportResult {
  rows: ImportRow[];
  errors: string[];
  duplicates: number;
}
// RFC 4180 の引用符・カンマ・改行に対応。エラーは元の物理行番号で返す。
export function parseCSV(text: string): ImportResult {
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    afterQuote = false,
    line = 1,
    start = 1;
  const errors: string[] = [];
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i <= text.length; i++) {
    const c = i === text.length ? "\n" : text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += c;
        if (c === "\n") line++;
      }
    } else if (c === '"') {
      if (cell.trim() || afterQuote)
        errors.push(`${line}行目：引用符の位置が不正です。`);
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      cells.push(cell.trim());
      cell = "";
      afterQuote = false;
      if (c !== ",") {
        if (cells.some(Boolean)) records.push({ cells, line: start });
        cells = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
        line++;
        start = line;
      }
    } else {
      if (afterQuote && c.trim())
        errors.push(`${line}行目：引用符の後に不正な文字があります。`);
      cell += c;
    }
  }
  if (quoted) errors.push(`${start}行目：引用符が閉じられていません。`);
  const header = records.shift()?.cells.map((c) => c.trim());
  if (!header || !["book", "stars", "number"].every((h) => header.includes(h)))
    return {
      rows: [],
      errors: ["ヘッダーに book,stars,number が必要です。"],
      duplicates: 0,
    };
  if (new Set(header).size !== header.length)
    errors.push("ヘッダーの列名が重複しています。");
  const rows: ImportRow[] = [],
    seen = new Map<string, ImportRow>();
  let duplicates = 0;
  for (const record of records) {
    const get = (key: string) => record.cells[header.indexOf(key)] || "";
    const book = get("book"),
      stars = normalize(get("stars")),
      number = normalize(get("number"));
    const issues = [];
    if (!Object.hasOwn(BOOKS, book)) issues.push("book は 1A / 2B / 3C");
    if (!["3", "4"].includes(stars)) issues.push("stars は 3 / 4");
    if (!positive(number)) issues.push("number は正の整数");
    if (get("unit").length > 200) issues.push("unit は200文字以内");
    if (record.cells.length !== header.length)
      issues.push("列数がヘッダーと一致しません");
    if (issues.length) {
      errors.push(`${record.line}行目：${issues.join("、")}`);
      continue;
    }
    const row: ImportRow = {
      book: book as Book,
      stars: Number(stars) as 3 | 4,
      number: Number(number),
      ...(header.includes("unit") ? { unit: get("unit") } : {}),
      line: record.line,
    };
    const key = `${book}:${row.number}`,
      previous = seen.get(key);
    if (previous) {
      duplicates++;
      if (previous.stars !== row.stars || previous.unit !== row.unit)
        errors.push(
          `${record.line}行目：${previous.line}行目と同じ問題で難度・単元が異なります。`,
        );
    } else {
      seen.set(key, row);
      rows.push(row);
    }
  }
  return { rows, errors: [...new Set(errors)], duplicates };
}
export function importSummary(state: State, rows: ImportRow[]) {
  const groups: Record<string, { added: number; existing: number }> = {};
  let conflicts = 0;
  for (const row of rows) {
    const key = `${BOOKS[row.book]} · ☆${row.stars}`;
    groups[key] ||= { added: 0, existing: 0 };
    const old = state.problems.find(
      (p) => p.book === row.book && p.number === row.number,
    );
    groups[key][old ? "existing" : "added"]++;
    if (old && old.stars !== row.stars) conflicts++;
  }
  return { groups, conflicts };
}
export function applyImport(
  state: State,
  rows: ImportRow[],
  updateStars: boolean,
): State {
  const problems = [...state.problems];
  for (const row of rows) {
    const index = problems.findIndex(
      (p) => p.book === row.book && p.number === row.number,
    );
    if (index >= 0)
      problems[index] = {
        ...problems[index],
        ...(updateStars ? { stars: row.stars } : {}),
        ...(row.unit !== undefined ? { unit: row.unit } : {}),
      };
    else
      problems.push({
        id: uid(),
        book: row.book,
        stars: row.stars,
        number: row.number,
        unit: row.unit || "",
        memo: "",
        created_at: new Date().toISOString(),
        latest_grade: null,
        last_attempt_at: null,
        last_self_solved_at: null,
        review_available_on: null,
      });
  }
  return { ...state, problems };
}
const csvCell = (v: string | number) =>
  '"' + String(v).replaceAll('"', '""') + '"';
export const exportCSV = (state: State) =>
  "\uFEFFbook,stars,number,unit\r\n" +
  [...state.problems]
    .sort((a, b) => a.book.localeCompare(b.book) || a.number - b.number)
    .map((p) => [p.book, p.stars, p.number, p.unit].map(csvCell).join(","))
    .join("\r\n");
const validDate = (s: unknown) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const validTime = (s: unknown) =>
  typeof s === "string" &&
  /^\d{4}-\d\d-\d\dT/.test(s) &&
  Number.isFinite(Date.parse(s));
const shortText = (s: unknown, max = 10000) =>
  typeof s === "string" && s.length <= max;
const integer = (n: unknown, max: number) =>
  typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max;
export function validateBackup(input: unknown): State {
  const fail = (): never => {
    throw new Error(
      "バックアップの形式または内容が不正です。Focus Gold の JSON ファイルを選んでください。",
    );
  };
  if (!input || typeof input !== "object") return fail();
  const s = input as State;
  if (
    s.version !== 1 ||
    !Array.isArray(s.problems) ||
    !Array.isArray(s.attempts) ||
    !Array.isArray(s.exams) ||
    !s.settings ||
    s.problems.length > 100000 ||
    s.attempts.length > 1000000
  )
    return fail();
  const ids = new Set<string>(),
    keys = new Set<string>();
  for (const p of s.problems) {
    if (
      !p ||
      !shortText(p.id, 100) ||
      !p.id ||
      ids.has(p.id) ||
      !Object.hasOwn(BOOKS, p.book) ||
      !integer(p.number, Number.MAX_SAFE_INTEGER) ||
      ![3, 4].includes(p.stars) ||
      !shortText(p.unit, 200) ||
      !shortText(p.memo) ||
      !validTime(p.created_at) ||
      keys.has(`${p.book}:${p.number}`)
    )
      return fail();
    ids.add(p.id);
    keys.add(`${p.book}:${p.number}`);
  }
  const attemptIDs = new Set<string>();
  for (const a of s.attempts) {
    if (
      !a ||
      !shortText(a.id, 100) ||
      !a.id ||
      attemptIDs.has(a.id) ||
      !ids.has(a.problem_id) ||
      !Object.hasOwn(GRADES, a.grade) ||
      !validTime(a.at) ||
      !shortText(a.memo)
    )
      return fail();
    attemptIDs.add(a.id);
  }
  const examIDs = new Set<string>();
  for (const e of s.exams) {
    if (
      !e ||
      !shortText(e.id, 100) ||
      !e.id ||
      examIDs.has(e.id) ||
      !shortText(e.name, 200) ||
      !e.name.trim() ||
      !validDate(e.date) ||
      !validDate(e.start_on) ||
      e.start_on > e.date ||
      !Object.hasOwn(BOOKS, e.book) ||
      !Array.isArray(e.stars) ||
      !e.stars.length ||
      e.stars.some((v) => ![3, 4].includes(v)) ||
      !shortText(e.unit, 200) ||
      !shortText(e.ranges, 2000)
    )
      return fail();
    try {
      parseRanges(e.ranges);
    } catch {
      return fail();
    }
    examIDs.add(e.id);
  }
  const x = s.settings;
  if (
    !Object.hasOwn(BOOKS, x.book) ||
    !Array.isArray(x.stars) ||
    !x.stars.length ||
    x.stars.some((v) => ![3, 4].includes(v)) ||
    !shortText(x.unit, 200) ||
    !["candidates", "all"].includes(x.mode) ||
    !integer(x.daily, 100) ||
    !integer(x.exam_days, 365) ||
    typeof x.motion !== "boolean" ||
    !x.intervals ||
    !["B", "C", "D"].every((g) => integer(x.intervals[g as "B"], 365))
  )
    return fail();
  // 派生値を信用せず履歴から再構築する。
  return recompute({
    ...s,
    revision: 0,
    problems: s.problems.map((p) => ({
      ...p,
      created_at: new Date(p.created_at).toISOString(),
    })),
    attempts: s.attempts.map((a) => ({
      ...a,
      at: new Date(a.at).toISOString(),
    })),
  });
}
