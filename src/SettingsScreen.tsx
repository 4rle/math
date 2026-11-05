import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

/** A full page grown from the open menu. There is no modal or backdrop. */
export function SettingsScreen({
  title,
  english,
  parent,
  onBack,
  onMenu,
  children,
}: {
  title: string;
  english: string;
  parent: string;
  onBack: () => void;
  onMenu: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    const scroll = ref.current?.querySelector<HTMLElement>(".settings-scroll");
    if (scroll) scroll.scrollTop = 0;
    ref.current
      ?.querySelector<HTMLElement>("h1")
      ?.focus({ preventScroll: true });
  }, [title]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        latest.current();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  return (
    <section ref={ref} className="settings-screen" aria-label={title}>
      <header className="settings-top">
        <button className="settings-back" aria-label={parent} onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1 tabIndex={-1}>{english}</h1>
        <button className="icon-button" aria-label="閉じる" onClick={onMenu}>
          <X size={22} />
        </button>
      </header>
      <div className="settings-scroll">
        <div className="settings-content">{children}</div>
      </div>
    </section>
  );
}
