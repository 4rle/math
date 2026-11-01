import rows from "./data/focusgold.json";
import { uid, type State, type Book, type Stars, type Problem } from "./model";

/** One-time additive installation. Existing IDs, grades, difficulty and notes win. */
export function installBundledCatalog(state: State): State {
  if (state.catalog_version === 1) return state;
  const problems = [...state.problems];
  const indices = new Map(problems.map((p, i) => [`${p.book}:${p.number}`, i]));
  const ids = new Set(problems.map((p) => p.id));
  const now = new Date().toISOString();
  for (const row of rows) {
    const key = `${row.book}:${row.number}`,
      index = indices.get(key);
    if (index !== undefined) {
      const old = problems[index];
      problems[index] = {
        ...old,
        title: old.title || row.title,
        page: old.page || row.page,
      };
      continue;
    }
    const candidate = `catalog-v1:${key}`;
    const problem: Problem = {
      id: ids.has(candidate) ? uid() : candidate,
      book: row.book as Book,
      number: row.number,
      stars: row.stars as Stars,
      title: row.title,
      page: row.page,
      unit: "",
      memo: "",
      created_at: now,
      latest_grade: null,
      last_attempt_at: null,
      last_self_solved_at: null,
      review_available_on: null,
    };
    indices.set(key, problems.length);
    ids.add(problem.id);
    problems.push(problem);
  }
  return { ...state, problems, catalog_version: 1 };
}
