import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Menu } from "lucide-react";
import "./flip-scene.css";

// Both edges of the study face meet near 80% of the viewport when open.
// Aligning the camera with that shared edge lets the face become edge-on.
const MENU_SHARE = 0.8;
const OPEN_ANGLE = (89.5 * Math.PI) / 180;
const PERSPECTIVE = 4; // camera distance in viewport widths
const MENU_DEPTH =
  MENU_SHARE /
  (Math.sin(OPEN_ANGLE) - (MENU_SHARE * Math.cos(OPEN_ANGLE)) / PERSPECTIVE);

type Props = {
  open: boolean;
  expanded?: boolean;
  motion: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  menu: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
};
type Gesture = {
  x: number;
  y: number;
  initial: number;
  span: number;
  lastX: number;
  time: number;
  velocity: number;
  active: boolean;
  pointer?: number;
};

/** Two perpendicular, live HTML faces of one solid. No duplicate card snapshot. */
export function FlipScene({
  open,
  expanded = false,
  motion,
  disabled,
  onOpenChange,
  menu,
  tabs,
  children,
}: Props) {
  const scene = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const progress = useRef(0);
  const animate = useRef<(target: number, speed?: number) => void>(() => {});
  const current = useRef({ open, motion, disabled, onOpenChange });
  current.current = { open, motion, disabled, onOpenChange };

  useLayoutEffect(() => {
    const root = scene.current!;
    let width = root.clientWidth;
    let frame = 0;
    let goal = 0;
    let gesture: Gesture | null = null;
    let blockedUntil = 0;
    const paint = (value: number) => {
      const p = Math.max(0, Math.min(1, value));
      progress.current = p;
      const angle = p * OPEN_ANGLE;
      root.style.setProperty("--turn", String(p));
      root.style.setProperty("--flip-angle", `${angle}rad`);
      // The hinge reaches 80%, while the far edge folds toward that hinge.
      root.style.setProperty(
        "--flip-shift",
        `${(width * MENU_SHARE * (1 - Math.cos(angle))) / (1 - Math.cos(OPEN_ANGLE))}px`,
      );
      // A separate screen-facing layer slides away with a slight initial delay.
      const tabs = Math.max(0, Math.min(1, (p - 0.06) / 0.94));
      root.style.setProperty(
        "--tabs-exit",
        String(tabs * tabs * (3 - 2 * tabs)),
      );
      root.style.setProperty("--button-lift", String(Math.sin(p * Math.PI)));
      root.dataset.turn = p.toFixed(3);
    };
    const settle = (target: number, speed?: number) => {
      if (
        current.current.motion &&
        frame &&
        goal === target &&
        speed === undefined
      )
        return;
      cancelAnimationFrame(frame);
      frame = 0;
      goal = target;
      if (!current.current.motion) {
        paint(target);
        root.dataset.turning = "false";
        return;
      }
      root.dataset.turning = "true";
      let velocity = speed || 0;
      let previous = performance.now();
      const tick = (now: number) => {
        const dt = Math.min((now - previous) / 1000, 0.032);
        previous = now;
        velocity += ((goal - progress.current) * 150 - velocity * 25) * dt;
        paint(progress.current + velocity * dt);
        if (
          Math.abs(progress.current - goal) < 0.001 &&
          Math.abs(velocity) < 0.015
        ) {
          paint(goal);
          root.dataset.turning = "false";
          frame = 0;
        } else frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    animate.current = settle;
    const cancel = () => {
      if (!gesture) return;
      const active = gesture.active;
      gesture = null;
      if (active) {
        blockedUntil = performance.now() + 600;
        settle(current.current.open ? 1 : 0, 0);
      }
    };
    const resize = new ResizeObserver(() => {
      const next = root.clientWidth;
      if (next !== width) cancel();
      width = next;
      root.style.setProperty("--camera-distance", `${width * PERSPECTIVE}px`);
      root.style.setProperty("--camera-origin", `${MENU_SHARE * 100}%`);
      root.style.setProperty("--menu-depth", `${width * MENU_DEPTH}px`);
      paint(progress.current);
    });
    resize.observe(root);
    const start = (
      x: number,
      y: number,
      target: EventTarget | null,
      pointer?: number,
    ) => {
      if (current.current.disabled || gesture || !(target instanceof Element))
        return;
      if (target.closest(".book-tabs, input, textarea, select, a")) return;
      if (pointer !== undefined && target.closest(".problem-card")) return;
      blockedUntil = 0;
      gesture = {
        x,
        y,
        initial: progress.current,
        span: current.current.open
          ? Math.max(180, Math.min(width * 0.55, 650))
          : Math.max(220, Math.min(width * 0.72, 650)),
        lastX: x,
        time: performance.now(),
        velocity: 0,
        active: false,
        pointer,
      };
    };
    const move = (x: number, y: number, event: Event) => {
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
        frame = 0;
        root.dataset.turning = "true";
      }
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      gesture.velocity =
        (((x - gesture.lastX) / Math.max(8, now - gesture.time)) * 1000) /
        gesture.span;
      gesture.lastX = x;
      gesture.time = now;
      const next = Math.max(
        0,
        Math.min(1, gesture.initial + dx / gesture.span),
      );
      if (current.current.motion) paint(next);
      else progress.current = next;
    };
    const finish = () => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (!g.active) return;
      blockedUntil = performance.now() + 600;
      const speed =
        performance.now() - g.time > 120
          ? 0
          : Math.max(-3, Math.min(3, g.velocity));
      const target = progress.current + speed * 0.16 > 0.5;
      settle(target ? 1 : 0, speed);
      current.current.onOpenChange(target);
    };
    const touchStart = (e: TouchEvent) => {
      root.dataset.keyboard = "false";
      if (e.touches.length !== 1) {
        cancel();
        return;
      }
      start(e.touches[0].clientX, e.touches[0].clientY, e.target);
    };
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        cancel();
        return;
      }
      move(e.touches[0].clientX, e.touches[0].clientY, e);
    };
    const pointerDown = (e: PointerEvent) => {
      root.dataset.keyboard = "false";
      if (e.pointerType !== "touch" && e.isPrimary && e.button === 0)
        start(e.clientX, e.clientY, e.target, e.pointerId);
    };
    const pointerMove = (e: PointerEvent) => {
      if (gesture?.pointer === e.pointerId) move(e.clientX, e.clientY, e);
    };
    const pointerUp = (e: PointerEvent) => {
      if (gesture?.pointer === e.pointerId) finish();
    };
    const click = (e: MouseEvent) => {
      if (e.detail && performance.now() < blockedUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const keyboard = (e: KeyboardEvent) => {
      if (["Tab", "Enter", " "].includes(e.key)) root.dataset.keyboard = "true";
    };
    document.addEventListener("keydown", keyboard);
    root.addEventListener("touchstart", touchStart, { passive: true });
    root.addEventListener("touchmove", touchMove, { passive: false });
    root.addEventListener("touchend", finish);
    root.addEventListener("touchcancel", cancel);
    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("click", click, true);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      document.removeEventListener("keydown", keyboard);
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("touchmove", touchMove);
      root.removeEventListener("touchend", finish);
      root.removeEventListener("touchcancel", cancel);
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("click", click, true);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  useLayoutEffect(() => {
    animate.current(open ? 1 : 0);
  }, [open, motion]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    trigger.current?.focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (current.current.disabled) return;
      if (e.key === "Escape") {
        e.preventDefault();
        current.current.onOpenChange(false);
      }
      if (e.key !== "Tab") return;
      const controls = [
        trigger.current!,
        ...menuRef.current!.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ),
        scene.current!.querySelector<HTMLButtonElement>(".flip-return")!,
      ];
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!expanded && open)
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
  }, [expanded]);

  return (
    <div
      ref={scene}
      className={`flip-scene ${open ? "menu-open" : ""}`}
      data-turn="0"
      inert={expanded}
      aria-hidden={expanded}
      role={open && !expanded ? "dialog" : undefined}
      aria-modal={open && !expanded ? true : undefined}
      aria-label={open && !expanded ? "メニュー" : undefined}
    >
      <button
        ref={trigger}
        id="menu-trigger"
        className="menu-trigger icon-button"
        aria-label={open ? "閉じる" : "メニューを開く"}
        aria-expanded={open}
        aria-controls="flip-menu"
        onClick={() => onOpenChange(!open)}
      >
        <Menu size={22} strokeWidth={1.5} />
      </button>
      <div className="flip-solid">
        <div
          className="flip-face flip-face--menu"
          aria-hidden={!open}
          inert={!open}
        >
          <div id="flip-menu" className="flip-menu" ref={menuRef}>
            {menu}
          </div>
        </div>
        <div className="flip-face flip-face--study">
          <div className="study-face-content" aria-hidden={open} inert={open}>
            {children}
          </div>
        </div>
      </div>
      <div className="floating-tabs" aria-hidden={open} inert={open}>
        {tabs}
      </div>
      {open && (
        <button
          className="flip-return"
          aria-label="問題一覧に戻る"
          onClick={() => onOpenChange(false)}
        />
      )}
    </div>
  );
}
