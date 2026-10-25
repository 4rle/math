import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Menu,
  X,
  Plus,
  SlidersHorizontal,
  CalendarDays,
  History,
  ChartNoAxesCombined,
  Database,
  Sparkles,
  ChevronRight,
  Check,
  RotateCcw,
  Orbit,
  BookOpen,
} from "lucide-react";
import {
  BOOKS,
  GRADES,
  candidateReason,
  dailyCandidates,
  dateOnly,
  dateTime,
  fieldProblems,
  initialState,
  jstDay,
  uid,
  type Book,
  type Grade,
  type Problem,
  type State,
} from "./model";
import { loadState, saveState } from "./storage";
import { ErrorMessage, Modal, PanelTop } from "./ui";
import {
  RegisterPanel,
  ManagePanel,
  DisplayPanel,
  LearningPanel,
  ExamsPanel,
  HistoryPanel,
  ProgressPanel,
  DataPanel,
  MotionPanel,
  type PanelProps,
} from "./panels";
const items = [
  ["register", "問題の登録と管理", Plus],
  ["display", "表示する問題", SlidersHorizontal],
  ["learning", "学習の設定", BookOpen],
  ["exams", "模試", CalendarDays],
  ["history", "学習履歴", History],
  ["progress", "進捗", ChartNoAxesCombined],
  ["data", "データ", Database],
  ["motion", "表示と動き", Sparkles],
] as const;
type Page = (typeof items)[number][0] | "menu" | "manage";
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [bootError, setBootError] = useState("");
  const stateRef = useRef<State>(initialState());
  const [page, setPage] = useState<Page | null>(null),
    [selected, setSelected] = useState<Problem | null>(null);
  const [pendingGrade, setPendingGrade] = useState<Grade | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const [toast, setToast] = useState<{ text: string; undoID?: string } | null>(
    null,
  );
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [today, setToday] = useState(jstDay());
  useEffect(() => {
    loadState()
      .then((s) => {
        stateRef.current = s;
        setState(s);
      })
      .catch((e) => setBootError(String(e.message || e)));
    const interval = setInterval(() => setToday(jstDay()), 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function commit(change: (state: State) => State) {
    if (lock.current)
      throw new Error("保存中です。少し待ってから再試行してください。");
    lock.current = true;
    setBusy(true);
    try {
      const next = await saveState(change(stateRef.current));
      stateRef.current = next;
      setState(next);
      return next;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const notify = (text: string) => setToast({ text });
  async function grade(grade: Grade) {
    if (!selected || busy) return;
    setError("");
    setPendingGrade(grade);
    const attempt = {
      id: uid(),
      problem_id: selected.id,
      at: new Date().toISOString(),
      grade,
      memo: "",
    };
    try {
      await commit((s) => ({ ...s, attempts: [...s.attempts, attempt] }));
      setSelected(null);
      setToast({
        text: `No. ${selected.number} · ${grade} を記録しました`,
        undoID: attempt.id,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function undo() {
    if (!toast?.undoID) return;
    try {
      const id = toast.undoID;
      await commit((s) => ({
        ...s,
        attempts: s.attempts.filter((a) => a.id !== id),
      }));
      notify("直前の記録を取り消しました");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const close = () => {
    if (!busy) {
      setPage(null);
      setSelected(null);
      setError("");
    }
  };
  if (!state)
    return (
      <main className="boot">
        <Orbit size={30} />
        <p>{bootError ? "データを開けませんでした" : "記録を読み込み中"}</p>
        <ErrorMessage message={bootError} />
        {bootError && (
          <button className="primary" onClick={() => location.reload()}>
            再読み込み
          </button>
        )}
      </main>
    );
  const cards = fieldProblems(state, today),
    daily = dailyCandidates(state, today);
  const bookProblems = state.problems.filter(
    (p) => p.book === state.settings.book,
  );
  const panels: Record<string, React.ComponentType<PanelProps>> = {
    register: RegisterPanel,
    manage: ManagePanel,
    display: DisplayPanel,
    learning: LearningPanel,
    exams: ExamsPanel,
    history: HistoryPanel,
    progress: ProgressPanel,
    data: DataPanel,
    motion: MotionPanel,
  };
  const CurrentPanel = page ? panels[page] : null;
  const title =
    page === "manage"
      ? "登録一覧の編集"
      : items.find((i) => i[0] === page)?.[1] || "メニュー";
  const selectedHistory = selected
    ? state.attempts
        .filter((a) => a.problem_id === selected.id)
        .sort((a, b) => b.at.localeCompare(a.at))
    : [];
  return (
    <main className={`universe ${state.settings.motion ? "" : "still"}`}>
      <button
        id="menu-trigger"
        className="menu-trigger icon-button"
        aria-label="メニューを開く"
        onClick={() => setPage("menu")}
      >
        <Menu size={22} strokeWidth={1.5} />
      </button>
      <div
        className="book-tabs"
        role="tablist"
        aria-label="参考書"
        onKeyDown={(e) => {
          if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const books = Object.keys(BOOKS) as Book[],
            index = books.indexOf(state.settings.book);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? 2
                : (index + (e.key === "ArrowRight" ? 1 : 2)) % 3;
          document.getElementById(`tab-${books[next]}`)?.focus();
          if (!busy)
            commit((s) => ({
              ...s,
              settings: { ...s.settings, book: books[next], unit: "" },
            })).catch((e) => notify(e.message));
        }}
      >
        {(Object.entries(BOOKS) as [Book, string][]).map(([book, name]) => (
          <button
            id={`tab-${book}`}
            key={book}
            role="tab"
            aria-controls="card-field"
            tabIndex={state.settings.book === book ? 0 : -1}
            aria-selected={state.settings.book === book}
            disabled={busy}
            onClick={() =>
              commit((s) => ({
                ...s,
                settings: { ...s.settings, book, unit: "" },
              })).catch((e) => notify(e.message))
            }
          >
            {name}
          </button>
        ))}
      </div>
      <section
        id="card-field"
        className="card-field"
        role="tabpanel"
        aria-labelledby={`tab-${state.settings.book}`}
        key={state.settings.book}
      >
        {cards.length ? (
          <div className="card-grid">
            {cards.map((p, index) => {
              const reason = candidateReason(state, p, today),
                highlighted = daily.has(p.id);
              return (
                <button
                  key={p.id}
                  className={`problem-card grade-${p.latest_grade || "new"} ${highlighted ? "suggested" : ""}`}
                  style={
                    {
                      "--offset": `${[0, 8, -3, 5, -5, 3][index % 6]}px`,
                      "--tilt": `${[0, -0.5, 0.4, -0.3, 0.5][index % 5]}deg`,
                      "--delay": `${Math.min(index, 20) * 18}ms`,
                    } as CSSProperties
                  }
                  aria-label={`問題 ${p.number}、☆${p.stars}、${p.latest_grade ? `${p.latest_grade} ${GRADES[p.latest_grade][0]}` : "未着手"}${highlighted ? "、今日の新規候補" : ""}`}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setOrigin({
                      x: rect.x + rect.width / 2 - innerWidth / 2,
                      y: rect.y + rect.height / 2 - innerHeight / 2,
                    });
                    setSelected(p);
                    setError("");
                    setPendingGrade(null);
                  }}
                >
                  <span className="card-top">
                    <span>☆{p.stars}</span>
                    {highlighted ? (
                      <span className="candidate-mark" title="今日の新規候補">
                        <Sparkles size={13} />
                      </span>
                    ) : reason === "模試前の確認" ? (
                      <CalendarDays size={13} />
                    ) : null}
                  </span>
                  <span className="problem-number">{p.number}</span>
                  <span className="card-state">
                    <i />
                    {p.latest_grade || "未着手"}
                    {p.latest_grade === "E" && <span>要再学習</span>}
                    {reason === "復習候補" && <span>復習候補</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-field">
            <div className="empty-orbit">
              <Orbit size={34} strokeWidth={1} />
            </div>
            <h1>
              {!bookProblems.length
                ? "最初の問題を、ここに。"
                : state.settings.mode === "all"
                  ? "表示対象の問題はありません"
                  : "今の候補はすべて記録済み"}
            </h1>
            <p>
              {!bookProblems.length
                ? "左上のメニューから、問題番号を登録できます。"
                : "表示範囲や全登録問題は、メニューから確認できます。"}
            </p>
          </div>
        )}
      </section>
      {page && (
        <Modal
          title={title}
          onClose={close}
          className={`settings-dialog ${page === "menu" ? "menu-dialog" : ""}`}
        >
          <PanelTop
            title={title}
            onBack={page !== "menu" ? () => setPage("menu") : undefined}
            onClose={close}
          />
          <div className="panel-body">
            {page === "menu" ? (
              <>
                <div className="menu-identity">
                  <span className="eyebrow">FOCUS GOLD</span>
                  <span>自分のペースで、次の一問へ。</span>
                </div>
                <div className="menu-items">
                  {items.map(([key, label, Icon], i) => (
                    <button key={key} onClick={() => setPage(key)}>
                      <Icon size={19} strokeWidth={1.5} />
                      <span>{label}</span>
                      <span className="menu-index" aria-hidden="true">
                        0{i + 1}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
                <div className="menu-foot">
                  <span>この端末に保存</span>
                  <span>{state.problems.length} 問登録済み</span>
                </div>
              </>
            ) : (
              CurrentPanel && (
                <CurrentPanel
                  state={state}
                  commit={commit}
                  busy={busy}
                  notify={notify}
                  navigate={(p) => setPage(p as Page)}
                />
              )
            )}
            {toast && (
              <p className="panel-notice" role="status">
                <Check size={15} />
                {toast.text}
              </p>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal
          title={`問題 ${selected.number} の記録`}
          onClose={close}
          className="grade-dialog"
          style={
            {
              "--from-x": `${origin.x * 0.25}px`,
              "--from-y": `${origin.y * 0.25}px`,
            } as CSSProperties
          }
        >
          <button
            className="close-grade icon-button"
            aria-label="記録せず閉じる"
            onClick={close}
            disabled={busy}
          >
            <X size={20} />
          </button>
          <div className="selected-problem">
            <span className="eyebrow">
              {BOOKS[selected.book]}
              <span className="selected-stars">☆{selected.stars}</span>
            </span>
            <span className="selected-number">{selected.number}</span>
            <span
              className={`current-grade grade-${selected.latest_grade || "new"}`}
            >
              {selected.latest_grade
                ? `${selected.latest_grade} · ${GRADES[selected.latest_grade][0]}`
                : "未着手"}
              {selected.unit ? ` / ${selected.unit}` : ""}
            </span>
          </div>
          <div className="grade-options" aria-label="理解度を記録">
            {(
              Object.entries(GRADES) as [Grade, readonly [string, string]][]
            ).map(([key, [label, detail]]) => (
              <button
                key={key}
                disabled={busy}
                aria-pressed={pendingGrade === key}
                className={`grade-option grade-${key} ${pendingGrade === key ? "pending-grade" : ""}`}
                onClick={() => grade(key)}
              >
                <span className="grade-letter">{key}</span>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <Check className="grade-check" size={17} />
              </button>
            ))}
          </div>
          <ErrorMessage message={error} />
          {toast && (
            <p className="panel-notice" role="status">
              {toast.text}
            </p>
          )}
          {busy && (
            <p className="saving" role="status">
              記録を保存しています…
            </p>
          )}
          <details className="problem-details">
            <summary>
              メモ・学習履歴
              {selectedHistory.length ? ` (${selectedHistory.length})` : ""}
            </summary>
            <div className="detail-body">
              <MemoEditor
                key={selected.id}
                problem={selected}
                busy={busy}
                onSave={async (memo) => {
                  await commit((s) => ({
                    ...s,
                    problems: s.problems.map((p) =>
                      p.id === selected.id ? { ...p, memo } : p,
                    ),
                  }));
                  setSelected((p) => (p ? { ...p, memo } : p));
                  notify("メモを保存しました");
                }}
              />
              {selected.last_attempt_at && (
                <p>最終学習：{dateOnly(selected.last_attempt_at)}</p>
              )}
              {selected.last_self_solved_at && (
                <p>最終自力完答：{dateOnly(selected.last_self_solved_at)}</p>
              )}
              {selected.review_available_on && (
                <p>復習候補に加わる日：{selected.review_available_on}</p>
              )}
              {selectedHistory.slice(0, 20).map((a) => (
                <div className="mini-history" key={a.id}>
                  <span className={`grade-badge grade-${a.grade}`}>
                    {a.grade}
                  </span>
                  <time>{dateTime(a.at)}</time>
                  <span>{a.memo}</span>
                </div>
              ))}
              {selectedHistory.length > 20 && (
                <p>すべての記録はメニューの学習履歴で確認できます。</p>
              )}
            </div>
          </details>
        </Modal>
      )}
      {toast && !page && !selected && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast.text}</span>
          {toast.undoID && (
            <button disabled={busy} onClick={undo}>
              <RotateCcw size={14} />
              取り消す
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="通知を閉じる"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {cards.length} 問を表示中
      </span>
    </main>
  );
}
function MemoEditor({
  problem,
  onSave,
  busy,
}: {
  problem: Problem;
  onSave: (memo: string) => Promise<void>;
  busy: boolean;
}) {
  const [memo, setMemo] = useState(problem.memo),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave(memo);
          setError("");
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label>
        問題メモ
        <textarea
          maxLength={10000}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="分からない式変形や、次に確認すること"
          rows={3}
        />
      </label>
      <button
        className="secondary small"
        disabled={busy || memo === problem.memo}
      >
        メモを保存
      </button>
      <ErrorMessage message={error} />
    </form>
  );
}
