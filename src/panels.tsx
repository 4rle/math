import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Trash2,
  Check,
  CalendarDays,
  Database,
} from "lucide-react";
import {
  BOOKS,
  GRADES,
  addDays,
  applyImport,
  dateTime,
  exportCSV,
  importSummary,
  isActiveExam,
  jstDay,
  parseCSV,
  parseNumbers,
  parseRanges,
  uid,
  validateBackup,
  type Attempt,
  type Book,
  type Exam,
  type Grade,
  type ImportResult,
  type Problem,
  type State,
} from "./model";
import { download } from "./storage";
import { ErrorMessage, Hint } from "./ui";
export interface PanelProps {
  state: State;
  commit: (change: (s: State) => State) => Promise<State>;
  busy: boolean;
  notify: (text: string) => void;
  navigate: (page: string) => void;
}
function useAction() {
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  return { error, setError, run };
}
function BookSelect({
  value,
  onChange,
  label = "参考書",
}: {
  value: Book;
  onChange: (book: Book) => void;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as Book)}
      >
        {Object.entries(BOOKS).map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function StarChecks({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  return (
    <fieldset className="inline-fieldset">
      <legend>難度</legend>
      {[3, 4].map((n) => (
        <label className="choice" key={n}>
          <input
            type="checkbox"
            checked={value.includes(n)}
            onChange={(e) => {
              const next = e.target.checked
                ? [...value, n]
                : value.filter((x) => x !== n);
              if (next.length) onChange(next);
            }}
          />
          ☆{n}
        </label>
      ))}
    </fieldset>
  );
}
function FormFooter({
  busy,
  label = "設定を保存",
}: {
  busy: boolean;
  label?: string;
}) {
  return (
    <button className="primary" type="submit" disabled={busy}>
      <Check size={16} />
      {busy ? "保存中…" : label}
    </button>
  );
}

export function RegisterPanel({
  state,
  commit,
  busy,
  notify,
  navigate,
}: PanelProps) {
  const [mode, setMode] = useState("manual"),
    [book, setBook] = useState(state.settings.book),
    [stars, setStars] = useState<3 | 4>(3),
    [unit, setUnit] = useState(""),
    [text, setText] = useState(""),
    [csv, setCSV] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null),
    [updateStars, setUpdateStars] = useState(false);
  const action = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const summary = preview ? importSummary(state, preview.rows) : null;
  function check(e: FormEvent) {
    e.preventDefault();
    action.setError("");
    setUpdateStars(false);
    if (mode === "manual") {
      const result = parseNumbers(text);
      setPreview({
        rows: result.numbers.map((number) => ({
          book,
          stars,
          number,
          unit,
          line: 1,
        })),
        errors: result.errors,
        duplicates: result.duplicates,
      });
    } else setPreview(parseCSV(csv));
  }
  return (
    <div className="stack">
      <div className="segmented">
        <button
          className={mode === "manual" ? "active" : ""}
          onClick={() => {
            setMode("manual");
            setPreview(null);
          }}
        >
          番号で登録
        </button>
        <button
          className={mode === "csv" ? "active" : ""}
          onClick={() => {
            setMode("csv");
            setPreview(null);
          }}
        >
          CSV を取り込む
        </button>
      </div>
      <form
        onSubmit={check}
        className="stack"
        onChange={() => setPreview(null)}
      >
        {mode === "manual" ? (
          <>
            <div className="form-row">
              <BookSelect value={book} onChange={setBook} />
              <label>
                難度
                <select
                  aria-label="難度"
                  value={stars}
                  onChange={(e) => setStars(Number(e.target.value) as 3 | 4)}
                >
                  <option value={3}>☆3</option>
                  <option value={4}>☆4</option>
                </select>
              </label>
            </div>
            <label>
              単元 <span className="optional">任意</span>
              <input
                maxLength={200}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="例：三角比"
              />
            </label>
            <label>
              問題番号
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "125, 128, 132, 140\n改行・空白・全角数字も使えます"
                }
                rows={5}
              />
            </label>
          </>
        ) : (
          <>
            <Hint>
              book・stars・number 列が必須です。unit 列は任意。UTF-8（BOM
              付き可）に対応しています。
            </Hint>
            <input
              ref={fileRef}
              className="file-input"
              type="file"
              accept=".csv,text/csv"
              aria-label="問題 CSV ファイル"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 20 * 1024 * 1024) {
                    action.setError("20 MB 以下のファイルを選んでください。");
                    return;
                  }
                  file
                    .text()
                    .then(setCSV)
                    .catch(() =>
                      action.setError("ファイルを読み込めませんでした。"),
                    );
                  setPreview(null);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => fileRef.current?.click()}
            >
              <ArrowUpFromLine size={16} />
              CSV ファイルを選ぶ
            </button>
            <label>
              CSV を貼り付け
              <textarea
                value={csv}
                onChange={(e) => setCSV(e.target.value)}
                rows={7}
                placeholder={
                  "book,stars,number,unit\n1A,3,125,三角比\n1A,4,128,三角比"
                }
                spellCheck={false}
              />
            </label>
          </>
        )}
        <button className="secondary" disabled={busy}>
          読み取った番号を確認
          <ChevronRight size={16} />
        </button>
      </form>
      {preview && (
        <section className="import-preview" aria-label="取り込み確認">
          <h2>取り込み確認</h2>
          {summary &&
            Object.entries(summary.groups).map(([key, counts]) => (
              <div className="summary-row" key={key}>
                <span>{key}</span>
                <span>
                  新規 {counts.added} / 既存 {counts.existing}
                </span>
              </div>
            ))}
          <p className="hint">
            入力内の重複 {preview.duplicates}{" "}
            件をまとめました。既存の履歴は保持されます。
            {mode === "csv" && "unit 列がある場合、既存の単元も更新します。"}
          </p>
          <div className="number-preview">
            {preview.rows.slice(0, 60).map((row) => (
              <span key={`${row.book}:${row.number}`}>
                {mode === "csv" ? `${BOOKS[row.book]} / ` : ""}
                {row.number}
              </span>
            ))}
            {preview.rows.length > 60 && (
              <span>ほか {preview.rows.length - 60} 問</span>
            )}
          </div>
          {summary && summary.conflicts > 0 && (
            <label className="check-line warning">
              <input
                type="checkbox"
                checked={updateStars}
                onChange={(e) => setUpdateStars(e.target.checked)}
              />
              難度が異なる既存 {summary.conflicts} 問の ☆
              を更新する（履歴は維持）
            </label>
          )}
          {preview.errors.length > 0 && (
            <div className="error-message" role="alert">
              <strong>入力を修正してください</strong>
              {preview.errors.map((x, i) => (
                <p key={i}>{x}</p>
              ))}
            </div>
          )}
          {!preview.rows.length && !preview.errors.length && (
            <Hint>問題番号が入力されていません。</Hint>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !preview.rows.length ||
              !!preview.errors.length ||
              (!!summary?.conflicts && !updateStars)
            }
            onClick={() =>
              action.run(async () => {
                await commit((s) => applyImport(s, preview.rows, updateStars));
                notify(`${preview.rows.length} 問の登録内容を保存しました`);
                setPreview(null);
                setText("");
                setCSV("");
              })
            }
          >
            <Plus size={16} />
            {busy ? "保存中…" : "この内容で登録"}
          </button>
        </section>
      )}
      <ErrorMessage message={action.error} />
      <button className="link-row" onClick={() => navigate("manage")}>
        <FileText size={17} />
        登録一覧の編集<span>{state.problems.length} 問</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function ManagePanel({ state, commit, busy, notify }: PanelProps) {
  const [book, setBook] = useState(state.settings.book),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [limit, setLimit] = useState(60);
  const problems = state.problems
    .filter((p) => p.book === book && `${p.number} ${p.unit}`.includes(search))
    .sort((a, b) => a.number - b.number);
  return (
    <div className="stack">
      <BookSelect
        value={book}
        onChange={(b) => {
          setBook(b);
          setLimit(60);
          setEditing(null);
        }}
      />
      <label className="search-input">
        <Search size={16} />
        <input
          aria-label="問題番号・単元で検索"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(60);
          }}
          placeholder="問題番号・単元で検索"
        />
      </label>
      <p className="hint">
        {problems.length} 問。難度や単元を変更しても履歴は保持されます。
      </p>
      <div className="list">
        {problems.slice(0, limit).map((p) => (
          <div className="list-item" key={p.id}>
            {editing === p.id ? (
              <ProblemEditor
                problem={p}
                commit={commit}
                busy={busy}
                onDone={() => {
                  setEditing(null);
                  notify("登録内容を更新しました");
                }}
              />
            ) : (
              <button className="problem-row" onClick={() => setEditing(p.id)}>
                <span
                  className={`grade-badge grade-${p.latest_grade || "new"}`}
                >
                  {p.latest_grade || "—"}
                </span>
                <strong>{p.number}</strong>
                <span>☆{p.stars}</span>
                <small>{p.unit || "単元なし"}</small>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!problems.length && <Hint>該当する登録問題はありません。</Hint>}
      {problems.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + 60)}>
          続きを表示
        </button>
      )}
    </div>
  );
}
function ProblemEditor({
  problem,
  commit,
  busy,
  onDone,
}: {
  problem: Problem;
  commit: PanelProps["commit"];
  busy: boolean;
  onDone: () => void;
}) {
  const [number, setNumber] = useState(String(problem.number)),
    [stars, setStars] = useState(problem.stars),
    [unit, setUnit] = useState(problem.unit),
    [remove, setRemove] = useState(false);
  const action = useAction();
  return (
    <form
      className="stack editor"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          const parsed = parseNumbers(number);
          if (parsed.errors.length || parsed.numbers.length !== 1)
            throw new Error("正の整数をひとつ入力してください。");
          await commit((s) => {
            if (
              s.problems.some(
                (p) =>
                  p.id !== problem.id &&
                  p.book === problem.book &&
                  p.number === parsed.numbers[0],
              )
            )
              throw new Error("同じ参考書に、その番号は登録済みです。");
            return {
              ...s,
              problems: s.problems.map((p) =>
                p.id === problem.id
                  ? { ...p, number: parsed.numbers[0], stars, unit }
                  : p,
              ),
            };
          });
          onDone();
        });
      }}
    >
      <div className="form-row">
        <label>
          問題番号
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="numeric"
            required
          />
        </label>
        <label>
          難度
          <select
            aria-label="難度"
            value={stars}
            onChange={(e) => setStars(Number(e.target.value) as 3 | 4)}
          >
            <option value={3}>☆3</option>
            <option value={4}>☆4</option>
          </select>
        </label>
      </div>
      <label>
        単元
        <input
          value={unit}
          maxLength={200}
          onChange={(e) => setUnit(e.target.value)}
        />
      </label>
      <FormFooter busy={busy} label="変更を保存" />
      <button
        type="button"
        className="danger-link"
        onClick={() => setRemove(!remove)}
      >
        <Trash2 size={14} />
        この問題を削除
      </button>
      {remove && (
        <div className="danger-box">
          <p>問題 {problem.number} と、そのすべての学習履歴を削除します。</p>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() =>
              action.run(async () => {
                await commit((s) => ({
                  ...s,
                  problems: s.problems.filter((p) => p.id !== problem.id),
                  attempts: s.attempts.filter(
                    (a) => a.problem_id !== problem.id,
                  ),
                }));
                onDone();
              })
            }
          >
            問題と履歴を削除する
          </button>
        </div>
      )}
      <ErrorMessage message={action.error} />
    </form>
  );
}

export function DisplayPanel({ state, commit, busy, notify }: PanelProps) {
  const [stars, setStars] = useState(state.settings.stars),
    [unit, setUnit] = useState(state.settings.unit),
    [mode, setMode] = useState(state.settings.mode);
  const action = useAction();
  const units = [
    ...new Set(
      state.problems
        .filter((p) => p.book === state.settings.book)
        .map((p) => p.unit)
        .filter(Boolean),
    ),
  ].sort();
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          await commit((s) => ({
            ...s,
            settings: { ...s.settings, stars, unit, mode },
          }));
          notify("表示範囲を保存しました");
        });
      }}
    >
      <p className="section-caption">{BOOKS[state.settings.book]} の表示範囲</p>
      <StarChecks value={stars} onChange={setStars} />
      <label>
        単元
        <select
          aria-label="単元"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          <option value="">すべての単元</option>
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <fieldset className="radio-stack">
        <legend>カードフィールド</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === "candidates"}
            onChange={() => setMode("candidates")}
          />
          <span>
            候補を表示<small>すべての未着手・復習候補・模試前の確認</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />
          <span>
            全登録問題を表示<small>A や、復習候補日より前の問題も確認</small>
          </span>
        </label>
      </fieldset>
      <Hint>
        今日の新規候補には、小さな星の印が付きます。ほかの問題も自由に選べます。
      </Hint>
      <FormFooter busy={busy} />
      <ErrorMessage message={action.error} />
    </form>
  );
}
export function LearningPanel({ state, commit, busy, notify }: PanelProps) {
  const [daily, setDaily] = useState(state.settings.daily),
    [intervals, setIntervals] = useState(state.settings.intervals),
    [examDays, setExamDays] = useState(state.settings.exam_days);
  const action = useAction();
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          await commit((s) => ({
            ...s,
            settings: { ...s.settings, daily, intervals, exam_days: examDays },
          }));
          notify("学習の設定を保存しました");
        });
      }}
    >
      <label>
        1 日の新規候補数
        <div className="number-input">
          <input
            type="number"
            min={1}
            max={100}
            required
            value={daily || ""}
            onChange={(e) => setDaily(Number(e.target.value))}
          />
          <span>問</span>
        </div>
      </label>
      <Hint>
        初めて A〜E
        を記録した問題を、日本時間で数えます。ノルマや上限ではありません。
      </Hint>
      <h2>復習候補に加わる間隔</h2>
      {(["B", "C", "D"] as const).map((g) => (
        <label className="interval-row" key={g}>
          <span>
            <b className={`grade-badge grade-${g}`}>{g}</b>
            {GRADES[g][0]}
          </span>
          <div className="number-input">
            <input
              aria-label={`${g} の復習間隔`}
              type="number"
              min={1}
              max={365}
              required
              value={intervals[g] || ""}
              onChange={(e) =>
                setIntervals({ ...intervals, [g]: Number(e.target.value) })
              }
            />
            <span>日後</span>
          </div>
        </label>
      ))}
      <Hint>
        実際に解いた日から計算します。A は模試前まで保留、E
        はすぐに要再学習の候補になります。日数は自由に調整できます。
      </Hint>
      <label>
        新しく登録する模試の確認開始
        <div className="number-input">
          <input
            type="number"
            min={1}
            max={365}
            required
            value={examDays || ""}
            onChange={(e) => setExamDays(Number(e.target.value))}
          />
          <span>日前</span>
        </div>
      </label>
      <FormFooter busy={busy} />
      <ErrorMessage message={action.error} />
    </form>
  );
}

export function ExamsPanel({ state, commit, busy, notify }: PanelProps) {
  const [editing, setEditing] = useState<Exam | null>(null),
    [creating, setCreating] = useState(false),
    [removeID, setRemoveID] = useState("");
  const action = useAction();
  const exams = [...state.exams].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack">
      {!creating && !editing && (
        <>
          <Hint>
            確認期間に入ると、範囲内の A も候補に戻ります。実施日まで有効です。
          </Hint>
          <button className="secondary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            模試を登録
          </button>
          {!exams.length && (
            <p className="empty-list">模試はまだ登録されていません。</p>
          )}
          {exams.map((exam) => (
            <article className="exam-item" key={exam.id}>
              <div className="exam-heading">
                <CalendarDays size={18} />
                <strong>{exam.name}</strong>
                <span
                  className={`pill ${isActiveExam(exam) ? "active-pill" : ""}`}
                >
                  {isActiveExam(exam)
                    ? "確認期間中"
                    : exam.date < jstDay()
                      ? "終了"
                      : "予定"}
                </span>
              </div>
              <p>
                {exam.date} · {BOOKS[exam.book]} ·{" "}
                {exam.stars.map((n) => `☆${n}`).join(" / ")}
              </p>
              <small>
                確認開始 {exam.start_on}
                {exam.unit && ` · ${exam.unit}`}
                {exam.ranges && ` · ${exam.ranges}`}
              </small>
              <div className="button-row">
                <button
                  className="secondary small"
                  onClick={() => setEditing(exam)}
                >
                  編集
                </button>
                <button
                  className="danger-link"
                  aria-label={`${exam.name} を削除`}
                  onClick={() => setRemoveID(exam.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {removeID === exam.id && (
                <div className="danger-box">
                  <p>この模試を削除します。学習履歴は残ります。</p>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() =>
                      action.run(async () => {
                        await commit((s) => ({
                          ...s,
                          exams: s.exams.filter((e) => e.id !== exam.id),
                        }));
                        setRemoveID("");
                        notify("模試を削除しました");
                      })
                    }
                  >
                    模試を削除
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setRemoveID("")}
                  >
                    戻る
                  </button>
                </div>
              )}
            </article>
          ))}
        </>
      )}
      {(creating || editing) && (
        <ExamEditor
          key={editing?.id || "new"}
          state={state}
          exam={editing}
          busy={busy}
          onSave={async (exam) => {
            await commit((s) => ({
              ...s,
              exams: editing
                ? s.exams.map((e) => (e.id === exam.id ? exam : e))
                : [...s.exams, exam],
            }));
            setCreating(false);
            setEditing(null);
            notify("模試を保存しました");
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      <ErrorMessage message={action.error} />
    </div>
  );
}
function ExamEditor({
  state,
  exam,
  onSave,
  onCancel,
  busy,
}: {
  state: State;
  exam: Exam | null;
  onSave: (exam: Exam) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(exam?.name || ""),
    [date, setDate] = useState(exam?.date || ""),
    [book, setBook] = useState<Book>(exam?.book || state.settings.book),
    [stars, setStars] = useState(exam?.stars || [3, 4]),
    [unit, setUnit] = useState(exam?.unit || ""),
    [ranges, setRanges] = useState(exam?.ranges || ""),
    [start, setStart] = useState(exam?.start_on || "");
  const action = useAction();
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          parseRanges(ranges);
          if (!name.trim()) throw new Error("模試名を入力してください。");
          if (start > date)
            throw new Error("確認開始日は実施日以前にしてください。");
          await onSave({
            id: exam?.id || uid(),
            name: name.trim(),
            date,
            book,
            stars,
            unit,
            ranges,
            start_on: start,
          });
        });
      }}
    >
      <label>
        模試名
        <input
          maxLength={200}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：11月の全国模試"
        />
      </label>
      <label>
        実施日
        <input
          type="date"
          min="2000-01-01"
          max="9999-12-31"
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (e.target.value)
              setStart(addDays(e.target.value, -state.settings.exam_days));
          }}
        />
      </label>
      <BookSelect value={book} onChange={setBook} />
      <StarChecks value={stars} onChange={setStars} />
      <label>
        対象単元 <span className="optional">空欄ですべて</span>
        <input
          maxLength={200}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          list="exam-units"
        />
        <datalist id="exam-units">
          {[
            ...new Set(
              state.problems
                .filter((p) => p.book === book)
                .map((p) => p.unit)
                .filter(Boolean),
            ),
          ].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </label>
      <label>
        問題番号範囲 <span className="optional">空欄ですべて</span>
        <input
          maxLength={2000}
          value={ranges}
          onChange={(e) => setRanges(e.target.value)}
          placeholder="125-140, 150, 161-170"
        />
      </label>
      <Hint>
        単元と番号範囲を両方指定した場合は、両方に一致する問題が対象です。
      </Hint>
      <label>
        確認開始日
        <input
          type="date"
          min="1900-01-01"
          max={date || "9999-12-31"}
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <FormFooter busy={busy} label="模試を保存" />
      <button type="button" className="text-button" onClick={onCancel}>
        キャンセル
      </button>
      <ErrorMessage message={action.error} />
    </form>
  );
}

export function HistoryPanel({ state, commit, busy, notify }: PanelProps) {
  const [book, setBook] = useState<Book>(state.settings.book),
    [filter, setFilter] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [limit, setLimit] = useState(40);
  const problems = useMemo(
    () => new Map(state.problems.map((p) => [p.id, p])),
    [state.problems],
  );
  const records = state.attempts
    .filter((a) => {
      const p = problems.get(a.problem_id);
      return p?.book === book && (!filter || String(p.number).includes(filter));
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="stack">
      <BookSelect
        value={book}
        onChange={(b) => {
          setBook(b);
          setLimit(40);
        }}
      />
      <label className="search-input">
        <Search size={16} />
        <input
          aria-label="履歴を問題番号で検索"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(40);
          }}
          placeholder="問題番号で検索"
        />
      </label>
      <Hint>評価の修正・削除後は、最新状態と復習候補日も計算し直します。</Hint>
      <div className="list">
        {records.slice(0, limit).map((a) => (
          <div className="history-item" key={a.id}>
            {editing === a.id ? (
              <AttemptEditor
                attempt={a}
                busy={busy}
                onSave={async (grade, memo) => {
                  await commit((s) => ({
                    ...s,
                    attempts: s.attempts.map((h) =>
                      h.id === a.id ? { ...h, grade, memo } : h,
                    ),
                  }));
                  setEditing(null);
                  notify("履歴を修正しました");
                }}
                onDelete={async () => {
                  await commit((s) => ({
                    ...s,
                    attempts: s.attempts.filter((h) => h.id !== a.id),
                  }));
                  setEditing(null);
                  notify("記録を削除しました");
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <button className="history-row" onClick={() => setEditing(a.id)}>
                <span className={`grade-badge grade-${a.grade}`}>
                  {a.grade}
                </span>
                <span>
                  <strong>No. {problems.get(a.problem_id)?.number}</strong>
                  <time>{dateTime(a.at)}</time>
                  {a.memo && <small>{a.memo}</small>}
                </span>
                <span className="history-label">{GRADES[a.grade][0]}</span>
                <ChevronRight size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!records.length && (
        <p className="empty-list">まだ学習記録がありません。</p>
      )}
      {records.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + 40)}>
          続きを表示
        </button>
      )}
    </div>
  );
}
function AttemptEditor({
  attempt,
  busy,
  onSave,
  onDelete,
  onCancel,
}: {
  attempt: Attempt;
  busy: boolean;
  onSave: (grade: Grade, memo: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const [grade, setGrade] = useState(attempt.grade),
    [memo, setMemo] = useState(attempt.memo),
    [remove, setRemove] = useState(false);
  const action = useAction();
  return (
    <form
      className="stack editor"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(() => onSave(grade, memo));
      }}
    >
      <p className="hint">{dateTime(attempt.at)} の記録</p>
      <label>
        評価
        <select
          aria-label="評価"
          value={grade}
          onChange={(e) => setGrade(e.target.value as Grade)}
        >
          {Object.entries(GRADES).map(([g, labels]) => (
            <option value={g} key={g}>
              {g} · {labels[0]}
            </option>
          ))}
        </select>
      </label>
      <label>
        この回のメモ
        <textarea
          maxLength={10000}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
        />
      </label>
      <FormFooter busy={busy} label="履歴を修正" />
      <div className="button-row">
        <button type="button" className="text-button" onClick={onCancel}>
          キャンセル
        </button>
        <button
          type="button"
          className="danger-link"
          onClick={() => setRemove(!remove)}
        >
          この記録を削除
        </button>
      </div>
      {remove && (
        <div className="danger-box">
          <p>この 1 回の記録を削除します。</p>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => action.run(onDelete)}
          >
            記録を削除する
          </button>
        </div>
      )}
      <ErrorMessage message={action.error} />
    </form>
  );
}

export function ProgressPanel({ state }: PanelProps) {
  const [book, setBook] = useState(state.settings.book),
    [stars, setStars] = useState([3, 4]);
  const problems = state.problems.filter(
    (p) => p.book === book && stars.includes(p.stars),
  );
  const counts = Object.fromEntries(
    ["new", "A", "B", "C", "D", "E"].map((g) => [
      g,
      problems.filter((p) => (p.latest_grade || "new") === g).length,
    ]),
  );
  const tried = problems.length - counts.new;
  return (
    <div className="stack">
      <BookSelect value={book} onChange={setBook} />
      <StarChecks value={stars} onChange={setStars} />
      <Hint>
        登録済みの対象問題だけを集計しています。取り組み済みには E
        の問題も含みます。
      </Hint>
      <div className="progress-total">
        <span>未着手</span>
        <strong>
          {counts.new}
          <small> / {problems.length} 問</small>
        </strong>
        <div className="progress-track">
          <div
            style={{
              width: `${problems.length ? (tried / problems.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="progress-pair">
        <div>
          <span>取り組み済み</span>
          <strong>
            {tried}
            <small>問</small>
          </strong>
        </div>
        <div>
          <span>現在、自力完答 A</span>
          <strong>
            {counts.A}
            <small>問</small>
          </strong>
        </div>
      </div>
      <div className="grade-breakdown">
        {Object.entries(GRADES).map(([g, labels]) => (
          <div className="summary-row" key={g}>
            <span>
              <b className={`grade-badge grade-${g}`}>{g}</b>
              {labels[0]}
            </span>
            <strong>
              {counts[g]}
              <small> 問</small>
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
export function DataPanel({ state, commit, busy, notify }: PanelProps) {
  const [restoring, setRestoring] = useState<State | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const action = useAction();
  return (
    <div className="stack">
      <div className="info-note">
        <Database size={19} />
        <p>
          データはこのブラウザーの中に保存されます。端末間の自動同期はありません。ブラウザーのデータを消す前や端末を移すときは、バックアップを保存してください。
        </p>
      </div>
      <h2>完全バックアップ</h2>
      <Hint>問題・学習履歴・模試・設定をまとめた JSON ファイルです。</Hint>
      <button
        className="primary"
        onClick={() => {
          download(
            `focusgold-backup-${jstDay()}.json`,
            JSON.stringify(state, null, 2),
            "application/json",
          );
          notify("バックアップを書き出しました");
        }}
      >
        <ArrowDownToLine size={17} />
        バックアップを書き出す
      </button>
      <input
        className="file-input"
        ref={file}
        type="file"
        accept=".json,application/json"
        aria-label="バックアップファイル"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          setRestoring(null);
          setConfirmed(false);
          if (selected)
            action.run(async () => {
              if (selected.size > 50 * 1024 * 1024)
                throw new Error("50 MB 以下のバックアップを選んでください。");
              setRestoring(validateBackup(JSON.parse(await selected.text())));
            });
          e.target.value = "";
        }}
      />
      <button className="secondary" onClick={() => file.current?.click()}>
        <ArrowUpFromLine size={17} />
        バックアップから復元
      </button>
      {restoring && (
        <div className="restore-preview">
          <h2>復元内容の確認</h2>
          <div className="summary-row">
            <span>問題</span>
            <span>{restoring.problems.length} 問</span>
          </div>
          <div className="summary-row">
            <span>履歴</span>
            <span>{restoring.attempts.length} 件</span>
          </div>
          <div className="summary-row">
            <span>模試</span>
            <span>{restoring.exams.length} 件</span>
          </div>
          <p className="warning">
            現在の問題・履歴・模試・設定をすべて置き換えます。元に戻せるよう、先に現在のバックアップを書き出してください。
          </p>
          <label className="check-line">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            現在のデータを置き換えることを確認しました
          </label>
          <button
            className="danger"
            disabled={busy || !confirmed}
            onClick={() =>
              action.run(async () => {
                await commit((s) => ({ ...restoring, revision: s.revision }));
                setRestoring(null);
                notify("バックアップを復元しました");
              })
            }
          >
            この内容で置き換える
          </button>
          <button className="text-button" onClick={() => setRestoring(null)}>
            キャンセル
          </button>
        </div>
      )}
      <hr />
      <h2>登録一覧の CSV</h2>
      <Hint>問題登録用の CSV です。学習履歴は含まれません。</Hint>
      <button
        className="secondary"
        onClick={() => {
          download(
            `focusgold-problems-${jstDay()}.csv`,
            exportCSV(state),
            "text/csv;charset=utf-8",
          );
          notify("登録一覧を書き出しました");
        }}
      >
        <FileText size={17} />
        登録一覧を CSV 出力
      </button>
      <ErrorMessage message={action.error} />
    </div>
  );
}
export function MotionPanel({ state, commit, busy, notify }: PanelProps) {
  const [motion, setMotion] = useState(state.settings.motion);
  const action = useAction();
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => {
          await commit((s) => ({ ...s, settings: { ...s.settings, motion } }));
          notify("表示と動きの設定を保存しました");
        });
      }}
    >
      <label className="check-line">
        <input
          type="checkbox"
          checked={motion}
          onChange={(e) => setMotion(e.target.checked)}
        />
        カード選択時の短いアニメーション
      </label>
      <Hint>
        オフにすると、カードは動かずに開きます。OS
        の「動きを減らす」が有効な場合も、自動的に動きを抑えます。カードが常に動く演出は使っていません。
      </Hint>
      <FormFooter busy={busy} />
      <ErrorMessage message={action.error} />
    </form>
  );
}
