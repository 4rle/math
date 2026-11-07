import { useState, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { installPwa, pwaSnapshot, subscribePwa } from "./pwa";
export function InstallApp() {
  const { canInstall, installed, updateAvailable } = useSyncExternalStore(
    subscribePwa,
    pwaSnapshot,
  );
  const [instructions, setInstructions] = useState(false);
  return (
    <section className="install-app" aria-label="アプリのインストール">
      <h2>ホーム画面に追加</h2>
      {installed ? (
        <p>ホーム画面に追加済みです。</p>
      ) : (
        <>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              if (!canInstall || !(await installPwa())) setInstructions(true);
            }}
          >
            <Download size={16} />
            アプリをインストール
          </button>
          {instructions && (
            <p role="status">
              AndroidのChromeはメニュー
              →「ホーム画面に追加」→「インストール」。iPhoneは共有
              →「ホーム画面に追加」から追加できます。
            </p>
          )}
          <p>ホーム画面からアプリとして開けます。</p>
        </>
      )}
      {updateAvailable && (
        <p role="status">
          新しいバージョンがあります。このサイトのタブとアプリをすべて閉じ、開き直すと更新されます。
        </p>
      )}
    </section>
  );
}
