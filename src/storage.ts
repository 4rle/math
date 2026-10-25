import { initialState, recompute, validateBackup, type State } from "./model";
const DATABASE = "focusgold-orbit";
let dbPromise: Promise<IDBDatabase> | undefined;
export function database() {
  return (dbPromise ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("state");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error);
    };
    request.onblocked = () => {
      dbPromise = undefined;
      reject(new Error("他のタブを閉じて再試行してください。"));
    };
  }));
}
export async function loadState(): Promise<State> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readonly");
    const request = tx.objectStore("state").get("current");
    request.onsuccess = () => {
      try {
        const stored = request.result;
        resolve(
          stored
            ? { ...validateBackup(stored), revision: stored.revision || 0 }
            : initialState(),
        );
      } catch (err) {
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
export async function saveState(state: State): Promise<State> {
  const db = await database();
  const next = { ...validateBackup(state), revision: state.revision + 1 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    let conflict = false;
    const check = store.get("current");
    check.onsuccess = () => {
      if ((check.result?.revision || 0) !== state.revision) {
        conflict = true;
        tx.abort();
        return;
      }
      try {
        store.put(next, "current");
      } catch {
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error || new Error("保存に失敗しました。"));
    tx.onabort = () =>
      reject(
        new Error(
          conflict
            ? "別のタブでデータが更新されました。この画面を再読み込みしてください。"
            : "保存に失敗しました。空き容量・ブラウザーの保存設定を確認して再試行してください。",
        ),
      );
  });
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
