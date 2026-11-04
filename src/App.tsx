import { LiquidSurface } from "./LiquidSurface";
import { useEffect, useState, type CSSProperties } from "react";
import {
  X,
  Plus,
  SlidersHorizontal,
  CalendarDays,
  History,
  ChartNoAxesCombined,
  Database,
  Diamond as CandidateMark,
  ChevronRight,
  Check,
  RotateCcw,
  Bookmark,
  Diamond,
  BookOpen,
  UserRound,
} from "lucide-react";
import {
  BOOKS,
  GRADES,
  candidateReason,
  dailyCandidates,
  dateOnly,
  dateTime,
  fieldProblems,
  jstDay,
  uid,
  type Book,
  type Grade,
  type Problem,
  type State,
} from "./model";
import { FloatingCard, useReducedMotion } from "./FloatingCard";
import { useStudyData } from "./useStudyData";
import { AccountPanel, syncLabels } from "./AccountPanel";
import { BookScene } from "./BookScene";
import { CardReveal } from "./CardReveal";
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
const menuEnglish: Record<string, string> = {
  account: "Account & sync",
  register: "Library",
  display: "Display",
  learning: "Study settings",
  exams: "Exams",
  history: "History",
  progress: "Progress",
  data: "Data",
  motion: "Motion",
};
const items = [
  ["account", "アカウントと同期", UserRound],
  ["register", "問題の登録と管理", Plus],
  ["display", "表示する問題", SlidersHorizontal],
  ["learning", "学習の設定", BookOpen],
  ["exams", "模試", CalendarDays],
  ["history", "学習履歴", History],
  ["progress", "進捗", ChartNoAxesCombined],
  ["data", "データ", Database],
  ["motion", "表示と動き", Diamond],
] as const;
type Page = (typeof items)[number][0] | "menu" | "manage";
export default function App() {
  const reducedMotion = useReducedMotion();
  const { state, bootError, busy, commit, account, remoteEpoch, setEditing } =
    useStudyData();
  const [page, setPage] = useState<Page | null>(null),
    [selected, setSelected] = useState<Problem | null>(null);
  const [pendingGrade, setPendingGrade] = useState<Grade | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ text: string; undoID?: string } | null>(
    null,
  );
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [today, setToday] = useState(jstDay());
  useEffect(() => {
    const interval = setInterval(() => setToday(jstDay()), 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setSelected(null);
    setPendingGrade(null);
    setError("");
    setToast(null);
  }, [account.user?.id, remoteEpoch]);
  useEffect(() => {
    if (account.recovery) setPage("account");
  }, [account.recovery]);
  useEffect(() => {
    setEditing(!!selected || (page !== null && page !== "account"));
  }, [selected, page, setEditing]);
  useEffect(() => {
    setPage((p) => (p === "account" ? p : null));
  }, [account.user?.id]);
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
        <Bookmark size={30} />
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
    <main
      className={`study-desk ${state.settings.motion && !reducedMotion ? "" : "still"}`}
    >
      <BookScene
        open={page === "menu"}
        motion={state.settings.motion && !reducedMotion}
        disabled={!!selected || (!!page && page !== "menu")}
        onOpenChange={(open) => setPage(open ? "menu" : null)}
        tabs={
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
            <LiquidSurface kind="tabs" />
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
        }
        menu={
          <>
            <div className="menu-items">
              {items.map(([key, label, Icon], i) => (
                <button
                  key={key}
                  aria-label={label}
                  onClick={() => setPage(key)}
                >
                  <Icon size={19} strokeWidth={1.5} />
                  <span className="menu-label">
                    <span lang="en">{menuEnglish[key]}</span>
                    <small>{label}</small>
                  </span>
                  <span className="menu-index" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
            <div className="menu-foot">
              <span>
                {account.user
                  ? syncLabels[account.sync.status]
                  : "この端末に保存"}
              </span>
              <span>{state.problems.length} 問登録済み</span>
            </div>
          </>
        }
      >
        <span id="card-gesture-help" className="sr-only">
          タップで記録。横スワイプでメニューを開きます。カードを長押しすると上下左右へ動かせます。離すと元の場所に戻ります。
        </span>
        <section
          id="card-field"
          className="card-field"
          role="tabpanel"
          aria-labelledby={`tab-${state.settings.book}`}
          key={state.settings.book}
        >
          {cards.length ? (
            <CardReveal
              enabled={state.settings.motion && !reducedMotion}
              book={state.settings.book}
            >
              {cards.map((p, index) => {
                const reason = candidateReason(state, p, today),
                  highlighted = daily.has(p.id);
                return (
                  <FloatingCard
                    motion={state.settings.motion && !reducedMotion}
                    key={p.id}
                    className={`problem-card grade-${p.latest_grade || "new"} ${highlighted ? "suggested" : ""}`}
                    style={
                      {
                        "--offset": `${[0, 18, 5, 25, 8, 20][index % 6]}px`,
                        "--exit": `var(--tile-exit-${index % 4}, 0)`,
                      } as CSSProperties
                    }
                    aria-label={`問題 ${p.number}、☆${p.stars}、${p.latest_grade ? `${p.latest_grade} ${GRADES[p.latest_grade][0]}` : "未着手"}${highlighted ? "、今日の新規候補" : ""}${p.title ? `、${p.title}` : ""}`}
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
                      <span className="card-difficulty" lang="en">
                        LEVEL 0{p.stars}
                      </span>
                      {highlighted ? (
                        <span className="candidate-mark" title="今日の新規候補">
                          <CandidateMark
                            size={10}
                            fill="currentColor"
                            strokeWidth={1}
                          />
                        </span>
                      ) : reason === "模試前の確認" ? (
                        <CalendarDays size={13} />
                      ) : null}
                    </span>
                    <span
                      className={`problem-number ${typeof p.number === "string" && p.number.length > 4 ? "prefixed-number" : ""}`}
                    >
                      {p.number}
                    </span>
                    {p.title && <span className="card-title">{p.title}</span>}
                    <span className="card-state">
                      <i />
                      <span className="state-label" lang="en">
                        {p.latest_grade || "Not studied"}
                      </span>
                      {p.latest_grade === "E" && <span lang="en">Relearn</span>}
                      {reason === "復習候補" && <span lang="en">Review</span>}
                    </span>
                  </FloatingCard>
                );
              })}
            </CardReveal>
          ) : (
            <div className="empty-field">
              <div className="empty-emblem">
                <Bookmark size={30} strokeWidth={1.2} />
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
      </BookScene>
      {page && page !== "menu" && (
        <Modal title={title} onClose={close} className="settings-dialog">
          <PanelTop
            title={title}
            onBack={() => setPage("menu")}
            onClose={close}
          />
          <div className="panel-body">
            {page === "account" ? (
              <AccountPanel
                key={account.user?.id || "guest"}
                account={account}
                state={state}
                busy={busy}
              />
            ) : (
              CurrentPanel && (
                <CurrentPanel
                  state={state}
                  accountActive={!!account.user}
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
              "--from-x": `${origin.x}px`,
              "--from-y": `${origin.y}px`,
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
            <span
              className={`selected-number ${typeof selected.number === "string" && selected.number.length > 4 ? "prefixed-number" : ""}`}
            >
              {selected.number}
            </span>
            {selected.title && (
              <p className="selected-title">{selected.title}</p>
            )}
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
                <LiquidSurface kind="button" />
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
              問題情報・メモ・学習履歴
              {selectedHistory.length ? ` (${selectedHistory.length})` : ""}
            </summary>
            <div className="detail-body">
              {selected.page && (
                <div className="source-details">
                  <p>掲載ページ：{selected.page}</p>
                </div>
              )}
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
