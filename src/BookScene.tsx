import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  motion: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  menu: ReactNode;
  children: ReactNode;
};

/** One perspective space: the study surface, spine and page block rotate together. */
export function BookScene({
  open,
  motion,
  disabled,
  onOpenChange,
  menu,
  children,
}: Props) {
  const scene = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const animate = useRef<(target: number, velocity?: number) => void>(() => {});
  const current = useRef({ open, motion, disabled, onOpenChange });
  current.current = { open, motion, disabled, onOpenChange };

  useEffect(() => {
    const root = scene.current!;
    let frame = 0;
    let blockedUntil = 0;
    let gesture: {
      x: number;
      y: number;
      initial: number;
      lastX: number;
      time: number;
      velocity: number;
      active: boolean;
      pointer?: number;
    } | null = null;
    const draw = (p: number) => {
      progress.current = Math.max(0, Math.min(1, p));
      root.style.setProperty("--turn", String(progress.current));
      root.dataset.turn = progress.current.toFixed(3);
    };
    const settle = (target: number, speed = 0) => {
      cancelAnimationFrame(frame);
      root.dataset.turning = "true";
      if (!current.current.motion) {
        draw(target);
        root.dataset.turning = "false";
        return;
      }
      let velocity = speed;
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.032);
        last = now;
        velocity += ((target - progress.current) * 150 - velocity * 25) * dt;
        draw(progress.current + velocity * dt);
        if (
          Math.abs(progress.current - target) < 0.001 &&
          Math.abs(velocity) < 0.015
        ) {
          draw(target);
          root.dataset.turning = "false";
        } else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    animate.current = settle;
    const distance = () =>
      Math.max(220, Math.min(root.clientWidth * 0.72, 650));
    const start = (
      x: number,
      y: number,
      target: EventTarget | null,
      pointer?: number,
    ) => {
      if (current.current.disabled || gesture || !(target instanceof Element))
        return;
      // A fresh contact is intentional; the compatibility click has no new start.
      blockedUntil = 0;
      if (target.closest(".book-tabs, input, textarea, select, a")) return;
      if (pointer !== undefined && target.closest(".problem-card")) return;
      gesture = {
        x,
        y,
        initial: progress.current,
        lastX: x,
        time: performance.now(),
        velocity: 0,
        active: false,
        pointer,
      };
    };
    const move = (x: number, y: number, e: Event) => {
      if (!gesture) return;
      const dx = x - gesture.x,
        dy = y - gesture.y;
      if (!gesture.active) {
        if (root.querySelector('[data-drag-state="dragging"]')) {
          gesture = null;
          return;
        }
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
          gesture = null;
          return;
        }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
        gesture.active = true;
        cancelAnimationFrame(frame);
        root.dataset.turning = "true";
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      gesture.velocity =
        (((x - gesture.lastX) / Math.max(8, now - gesture.time)) * 1000) /
        distance();
      gesture.lastX = x;
      gesture.time = now;
      const next = Math.max(0, Math.min(1, gesture.initial + dx / distance()));
      if (current.current.motion) draw(next);
      else progress.current = next;
    };
    const end = (cancelled = false) => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (!g.active) return;
      blockedUntil = performance.now() + 600;
      const speed =
        performance.now() - g.time > 100
          ? 0
          : Math.max(-3, Math.min(3, g.velocity));
      const target = cancelled
        ? current.current.open
        : progress.current + speed * 0.16 > 0.5;
      current.current.onOpenChange(target);
      settle(target ? 1 : 0, cancelled ? 0 : speed);
    };
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        end(true);
        return;
      }
      start(e.touches[0].clientX, e.touches[0].clientY, e.target);
    };
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        end(true);
        return;
      }
      move(e.touches[0].clientX, e.touches[0].clientY, e);
    };
    const touchEnd = () => end();
    const cancel = () => end(true);
    const pointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !e.isPrimary || e.button !== 0) return;
      start(e.clientX, e.clientY, e.target, e.pointerId);
    };
    const pointerMove = (e: PointerEvent) => {
      if (gesture?.pointer === e.pointerId) move(e.clientX, e.clientY, e);
    };
    const pointerUp = (e: PointerEvent) => {
      if (gesture?.pointer === e.pointerId) end();
    };
    const click = (e: MouseEvent) => {
      if (e.detail && performance.now() < blockedUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    root.addEventListener("touchstart", touchStart, { passive: true });
    root.addEventListener("touchmove", touchMove, { passive: false });
    root.addEventListener("touchend", touchEnd);
    root.addEventListener("touchcancel", cancel);
    root.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    root.addEventListener("click", click, true);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("touchmove", touchMove);
      root.removeEventListener("touchend", touchEnd);
      root.removeEventListener("touchcancel", cancel);
      root.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      root.removeEventListener("click", click, true);
    };
  }, []);

  useEffect(() => {
    animate.current(open ? 1 : 0);
  }, [open, motion]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = menuRef.current!;
    panel
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (current.current.disabled) return;
      if (e.key === "Escape") {
        e.preventDefault();
        current.current.onOpenChange(false);
      }
      if (e.key === "Tab") {
        const controls = [
          ...panel.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ),
        ];
        const returnButton =
          scene.current?.querySelector<HTMLButtonElement>(".book-return");
        if (returnButton) controls.push(returnButton);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div
      ref={scene}
      className={`book-scene ${open ? "menu-open" : ""}`}
      data-turn="0"
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? "メニュー" : undefined}
    >
      <div
        className="flip-menu"
        ref={menuRef}
        inert={!open}
        aria-hidden={!open}
      >
        <div className="flip-menu-top">
          <span>CONTENTS</span>
          <button
            className="icon-button"
            aria-label="閉じる"
            onClick={() => onOpenChange(false)}
          >
            <X size={20} />
          </button>
        </div>
        {menu}
        <p className="flip-hint">左にスワイプして問題へ戻る</p>
      </div>
      <div className="book-volume" aria-hidden={open} inert={open}>
        <div className="book-back" />
        <div className="book-pages book-pages-top" />
        <div className="book-pages book-pages-bottom" />
        <div className="book-spine" aria-hidden="true">
          <span className="spine-rule spine-rule-top" />
          <span className="spine-name">Focusgold Helper</span>
          <span className="spine-rule spine-rule-bottom" />
        </div>
        <div className="book-front">{children}</div>
      </div>
      {open && (
        <button
          className="book-return"
          aria-label="問題一覧に戻る"
          onClick={() => onOpenChange(false)}
        >
          <span>問題へ戻る</span>
        </button>
      )}
    </div>
  );
}
