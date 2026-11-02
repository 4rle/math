import { useState } from "react";
import { LogIn, RefreshCw, Download, Cloud, LogOut } from "lucide-react";
import { cloudClient } from "./cloud";
import { download } from "./storage";
import { jstDay, type State } from "./model";
import type { Account } from "./useStudyData";
import { ErrorMessage, Hint } from "./ui";
export const syncLabels = {
  loading: "記録を読み込み中",
  syncing: "同期中",
  saved: "同期済み",
  pending: "この端末に保存・同期待ち",
  error: "この端末に保存・同期を再試行できます",
  conflict: "別の端末の記録を確認してください",
};
function authError(error: { message: string; status?: number; code?: string }) {
  if (error.code === "invalid_credentials")
    return "メールアドレスまたはパスワードを確認してください。";
  if (error.code === "email_not_confirmed")
    return "確認メールのリンクを開いてからログインしてください。";
  if (error.status === 429)
    return "操作が続いています。少し時間をおいて再試行してください。";
  return "手続きを完了できませんでした。入力内容と接続を確認して再試行してください。";
}
export function AccountPanel({
  account,
  state,
  busy,
}: {
  account: Account;
  state: State;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [working, setWorking] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false),
    [confirmResolve, setConfirmResolve] = useState(false),
    [backedUp, setBackedUp] = useState<number | null>(null),
    [confirmLogout, setConfirmLogout] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const backup = () => {
    download(
      `focusgold-local-${jstDay()}.json`,
      JSON.stringify(state, null, 2),
      "application/json",
    );
    setBackedUp(state.revision);
  };
  if (!account.configured)
    return (
      <div className="stack">
        <div className="account-emblem">
          <Cloud size={26} />
        </div>
        <h2>アカウントの準備中</h2>
        <Hint>
          現在はこの端末に保存しています。ログインと端末間同期を利用するには、サイト管理者が接続設定を行う必要があります。設定前の記録も、設定後にアカウントへ引き継げます。
        </Hint>
        <p className="hint">
          設定が完了するまで、端末内保存と JSON バックアップを利用できます。
        </p>
      </div>
    );
  if (account.user && account.recovery)
    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const { error } = await cloudClient!.auth.updateUser({ password });
            if (error) throw new Error(authError(error));
            setPassword("");
            setMessage("パスワードを更新しました。");
            account.finishRecovery();
          });
        }}
      >
        <h2>新しいパスワード</h2>
        <label>
          新しいパスワード
          <input
            type="password"
            aria-label={account.recovery ? "新しいパスワード" : "パスワード"}
            minLength={12}
            maxLength={128}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Hint>12文字以上で設定してください。</Hint>
        <button className="primary" disabled={working}>
          パスワードを更新
        </button>
        <ErrorMessage message={error} />
      </form>
    );
  if (!account.user)
    return (
      <div className="stack">
        <div className="account-emblem">
          <LogIn size={25} />
        </div>
        <p className="account-intro">いつもの記録を、どの端末でも。</p>
        <div className="segmented">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
              setMessage("");
            }}
          >
            ログイン
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError("");
              setMessage("");
            }}
          >
            新規登録
          </button>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const redirectTo = location.origin + "/";
              if (mode === "reset") {
                const { error } = await cloudClient!.auth.resetPasswordForEmail(
                  email,
                  { redirectTo },
                );
                if (error) throw new Error(authError(error));
                setMessage(
                  "登録されている場合、パスワード再設定メールを送信しました。",
                );
                return;
              }
              const response =
                mode === "signup"
                  ? await cloudClient!.auth.signUp({
                      email,
                      password,
                      options: { emailRedirectTo: redirectTo },
                    })
                  : await cloudClient!.auth.signInWithPassword({
                      email,
                      password,
                    });
              if (response.error) throw new Error(authError(response.error));
              setPassword("");
              if (mode === "signup" && !response.data.session)
                setMessage(
                  "確認メールを送信しました。リンクを開いて登録を完了してください。",
                );
            });
          }}
        >
          <label>
            メールアドレス
            <input
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== "reset" && (
            <label>
              パスワード
              <input
                type="password"
                aria-label={
                  account.recovery ? "新しいパスワード" : "パスワード"
                }
                required
                minLength={mode === "signup" ? 12 : 1}
                maxLength={128}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && (
                <small className="hint">
                  12文字以上。確認メールで本人確認を行います。
                </small>
              )}
            </label>
          )}
          <button className="primary" disabled={working}>
            {working
              ? "処理中…"
              : mode === "signup"
                ? "アカウントを作成"
                : mode === "reset"
                  ? "再設定メールを送る"
                  : "ログインする"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setMode(mode === "reset" ? "login" : "reset");
            setError("");
            setMessage("");
          }}
        >
          {mode === "reset" ? "ログインに戻る" : "パスワードを忘れた場合"}
        </button>
        <Hint>
          ログイン前の記録はこの端末に残ります。ログイン後に「この端末の記録を追加する」で引き継げます。
        </Hint>
        <ErrorMessage message={error} />
        {message && (
          <p className="panel-notice" role="status">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <div className="stack">
      <div className="account-summary">
        <Cloud size={23} />
        <div>
          <strong>{account.user.email}</strong>
          <span role="status">{syncLabels[account.sync.status]}</span>
        </div>
      </div>
      <Hint>
        同じアカウントでログインすると、問題・学習履歴・模試・設定を共有します。変更は端末へ先に保存し、接続でき次第同期します。別の端末の記録は約15秒ごと、または画面を開き直したときに確認します。
      </Hint>
      <button
        className="secondary"
        disabled={
          working ||
          busy ||
          account.sync.status === "syncing" ||
          account.sync.status === "conflict"
        }
        onClick={() => void run(account.syncNow)}
      >
        <RefreshCw size={16} />
        今すぐ同期
      </button>
      <ErrorMessage message={account.sync.error} />
      {account.sync.status === "conflict" && (
        <section className="restore-preview">
          <h2>両方の記録を確認</h2>
          <Hint>
            自動では上書きしません。この端末の記録 {state.attempts.length}{" "}
            件／クラウドの記録{" "}
            {account.sync.conflict?.state.attempts.length || 0}{" "}
            件。まず端末のバックアップを保存してください。
          </Hint>
          <button className="secondary" onClick={backup}>
            <Download size={16} />
            この端末のバックアップを保存
          </button>
          <label className="check-line">
            <input
              type="checkbox"
              checked={confirmResolve}
              onChange={(e) => setConfirmResolve(e.target.checked)}
            />
            選ばなかった側の内容が置き換わることを確認しました
          </label>
          <button
            className="secondary"
            disabled={
              backedUp !== state.revision || !confirmResolve || working || busy
            }
            onClick={() =>
              void run(async () => {
                await account.resolve("remote");
                setConfirmResolve(false);
                setBackedUp(null);
              })
            }
          >
            クラウドの記録を使う
          </button>
          <button
            className="danger"
            disabled={
              backedUp !== state.revision || !confirmResolve || working || busy
            }
            onClick={() =>
              void run(async () => {
                await account.resolve("local");
                setConfirmResolve(false);
                setBackedUp(null);
              })
            }
          >
            この端末の記録でクラウドを置き換える
          </button>
        </section>
      )}
      <hr />
      <h2>ログイン前の記録を引き継ぐ</h2>
      <Hint>
        このブラウザーでログインせずに使っていた記録を追加します。問題番号を照合して履歴を追加し、同じIDの履歴と設定・難度はアカウント側を優先します。元の端末内データも残ります。
      </Hint>
      <label className="check-line">
        <input
          type="checkbox"
          checked={confirmImport}
          onChange={(e) => setConfirmImport(e.target.checked)}
        />
        この端末の記録を、このアカウントに追加する
      </label>
      <button
        className="secondary"
        disabled={!confirmImport || busy || working}
        onClick={() =>
          void run(async () => {
            await account.importGuest();
            setConfirmImport(false);
            setMessage("記録を追加しました。同期状態を確認してください。");
          })
        }
      >
        この端末の記録を追加する
      </button>
      <hr />
      {(account.sync.status !== "saved" || confirmLogout) && (
        <div className="info-note">
          <p>
            同期前の記録はこのブラウザーに残ります。ログアウト後も同じアカウントでログインすると再同期できます。共有端末ではブラウザーのデータも管理してください。
          </p>
        </div>
      )}
      <button
        className="secondary"
        disabled={working || busy}
        onClick={() => {
          if (account.sync.status !== "saved" && !confirmLogout) {
            setConfirmLogout(true);
            return;
          }
          void run(async () => {
            const { error } = await cloudClient!.auth.signOut({
              scope: "local",
            });
            if (error) throw new Error(authError(error));
            account.finishRecovery();
          });
        }}
      >
        <LogOut size={16} />
        {confirmLogout
          ? "未同期の記録をこの端末に残してログアウト"
          : "この端末でログアウト"}
      </button>
      <ErrorMessage message={error} />
      {message && (
        <p className="panel-notice" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
