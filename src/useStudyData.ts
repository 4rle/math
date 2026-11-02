import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { cloudClient, cloudAPI } from "./cloud";
import { initialState, type State } from "./model";
import { loadState, saveState } from "./storage";
import { mergeGuest, SyncEngine, type SyncView, type Cache } from "./sync";
export function useStudyData() {
  const [state, setState] = useState<State | null>(null),
    [bootError, setBootError] = useState(""),
    [busy, setBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [sync, setSync] = useState<SyncView>({
      status: "loading",
      error: "",
      conflict: undefined,
    });
  const [recovery, setRecovery] = useState(false),
    [remoteEpoch, setRemoteEpoch] = useState(0);
  const current = useRef(initialState()),
    engine = useRef<SyncEngine | null>(null),
    active = useRef<string | null | undefined>(undefined),
    writing = useRef(false);
  useEffect(() => {
    let disposed = false,
      generation = 0;
    const activate = async (session: Session | null) => {
      const id = session?.user.id || null;
      if (disposed) return;
      if (active.current === id) {
        if (session) setUser(session.user);
        return;
      }
      const turn = ++generation;
      active.current = id;
      engine.current?.stop();
      engine.current = null;
      setUser(session?.user || null);
      setState(null);
      setBootError("");
      try {
        if (!id) {
          const guest = await loadState();
          if (disposed || turn !== generation) return;
          current.current = guest;
          setState(guest);
          setSync({ status: "saved", error: "", conflict: undefined });
        } else {
          const actor = new SyncEngine(
            id,
            cloudAPI(id),
            (cache: Cache, view: SyncView) => {
              if (disposed || engine.current !== actor) return;
              if (
                current.current.revision !== cache.state.revision &&
                !writing.current
              )
                setRemoteEpoch((x) => x + 1);
              current.current = cache.state;
              setState(cache.state);
              setSync(view);
            },
          );
          engine.current = actor;
          await actor.initialize();
        }
      } catch (e) {
        if (!disposed && turn === generation)
          setBootError((e as Error).message);
      }
    };
    const subscription = cloudClient?.auth.onAuthStateChange(
      (event, session) => {
        if (disposed) return;
        if (event === "SIGNED_OUT") setRecovery(false);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        // Do not await another Supabase operation inside its auth lock.
        setTimeout(() => void activate(session), 0);
      },
    );
    if (cloudClient)
      cloudClient.auth
        .getSession()
        .then(({ data }) => activate(data.session))
        .catch(() => activate(null));
    else void activate(null);
    const refresh = () => {
      if (document.visibilityState === "visible") void engine.current?.sync();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      active.current = undefined;
      engine.current?.stop();
      engine.current = null;
      subscription?.data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const commit = useCallback(async (change: (s: State) => State) => {
    if (writing.current)
      throw new Error("保存中です。少し待ってから再試行してください。");
    writing.current = true;
    setBusy(true);
    const identity = active.current;
    try {
      const next = engine.current
        ? await engine.current.save(change(current.current))
        : await saveState(change(current.current));
      if (identity !== active.current)
        throw new Error(
          "アカウントが切り替わりました。記録は元の保存先に残しています。",
        );
      current.current = next;
      setState(next);
      return next;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }, []);
  return {
    state,
    bootError,
    busy,
    commit,
    remoteEpoch,
    setEditing: useCallback(
      (editing: boolean) => engine.current?.setReadPaused(editing),
      [],
    ),
    account: {
      user,
      configured: !!cloudClient,
      sync,
      recovery,
      finishRecovery: () => setRecovery(false),
      syncNow: async () => {
        await engine.current?.sync();
      },
      resolve: async (choice: "local" | "remote") => {
        await engine.current?.resolve(choice);
      },
      importGuest: async () => {
        const guest = await loadState();
        return commit((s) => mergeGuest(s, guest));
      },
    },
  };
}
export type Account = ReturnType<typeof useStudyData>["account"];
