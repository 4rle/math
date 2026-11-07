import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Check } from "lucide-react";
import { GRADES, type Grade } from "./model";
import { LiquidSurface } from "./LiquidSurface";

export const SLIDER_GRADES = ["E", "D", "C", "B", "A"] as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Only user input calls this. Unsupported/denied vibration never blocks grading. */
function tick(steps = 1) {
  try {
    if (typeof navigator.vibrate !== "function") return;
    const pulses = Array.from({ length: Math.min(steps, 4) * 2 - 1 }, (_, i) =>
      i % 2 ? 16 : 7,
    );
    navigator.vibrate(pulses);
  } catch {
    /* Optional hardware feedback. */
  }
}

type Gesture = {
  id: number;
  startX: number;
  distance: number;
  before: number;
  touched: boolean;
  index: number;
};
export function GradeSlider({
  disabled,
  error,
  onCommit,
}: {
  disabled: boolean;
  error: boolean;
  onCommit: (grade: Grade) => Promise<void>;
}) {
  const id = useId();
  const path = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const locked = useRef(false);
  const [index, setIndex] = useState(0),
    [position, setPosition] = useState(0);
  const [touched, setTouched] = useState(false),
    [dragging, setDragging] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const grade = SLIDER_GRADES[index];
  const choose = (next: number, haptic = true) => {
    const value = Math.max(0, Math.min(4, next));
    if (haptic && (!touched || value !== index)) tick();
    setIndex(value);
    setPosition(value / 4);
    setTouched(true);
    setUncertain(false);
  };
  const save = (value: number) => {
    if (disabled || locked.current) return;
    locked.current = true;
    void onCommit(SLIDER_GRADES[value]).finally(() => {
      locked.current = false;
    });
  };
  const fraction = (x: number) => {
    const r = path.current!.getBoundingClientRect();
    return clamp((x - r.left) / r.width);
  };
  const cancel = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setDragging(false);
    setIndex(g.before);
    setPosition(g.before / 4);
    setTouched(g.touched);
    setUncertain(false);
  };
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <section className="rating" aria-label="理解度を記録">
      <div className="rating-summary" aria-live="polite" aria-atomic="true">
        <span className="rating-value">{touched ? grade : "—"}</span>
        <div>
          <strong>{touched ? GRADES[grade][0] : "どこまで解けましたか"}</strong>
          <p>
            {touched ? GRADES[grade][1] : "右へスライドして、自力完答 A へ"}
          </p>
        </div>
      </div>
      <div
        className="rating-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="理解度"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={index}
        aria-valuetext={
          touched ? `${grade} ${GRADES[grade][0]}` : "未選択。EからAの5段階"
        }
        aria-orientation="horizontal"
        aria-disabled={disabled}
        aria-describedby={`${id}-help`}
        data-dragging={dragging}
        style={{ "--rating-position": position } as CSSProperties}
        onPointerDown={(e) => {
          if (disabled || locked.current || !e.isPrimary || e.button !== 0)
            return;
          const value = fraction(e.clientX),
            next = Math.round(value * 4);
          gesture.current = {
            id: e.pointerId,
            startX: e.clientX,
            distance: 0,
            before: index,
            touched,
            index: next,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          choose(next);
          setDragging(true);
          setPosition(value);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          const value = fraction(e.clientX),
            scaled = value * 4;
          g.distance = Math.max(g.distance, Math.abs(e.clientX - g.startX));
          // A dead band at each midpoint prevents chatter between two detents.
          const next =
            Math.abs(scaled - g.index) > 0.58 ? Math.round(scaled) : g.index;
          if (next !== g.index) {
            tick(Math.abs(next - g.index));
            g.index = next;
            setIndex(next);
          }
          setPosition(value);
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          const r = e.currentTarget.getBoundingClientRect(),
            value = fraction(e.clientX);
          const endIndex =
            Math.abs(value * 4 - g.index) > 0.58
              ? Math.round(value * 4)
              : g.index;
          if (endIndex !== g.index) tick(Math.abs(endIndex - g.index));
          const distance = Math.max(g.distance, Math.abs(e.clientX - g.startX));
          gesture.current = null;
          setDragging(false);
          setIndex(endIndex);
          setPosition(endIndex / 4);
          e.currentTarget.releasePointerCapture(e.pointerId);
          const aligned = Math.abs(value - endIndex / 4) <= 0.095;
          const inside = e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24;
          if (distance >= 12 && aligned && inside) save(endIndex);
          else if (distance >= 12) setUncertain(true);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onBlur={cancel}
        onKeyDown={(e) => {
          if (disabled || locked.current) return;
          const keys = [
            "ArrowRight",
            "ArrowUp",
            "ArrowLeft",
            "ArrowDown",
            "Home",
            "End",
            "PageUp",
            "PageDown",
          ];
          if (keys.includes(e.key)) {
            e.preventDefault();
            choose(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 4
                  : index +
                    (["ArrowRight", "ArrowUp", "PageUp"].includes(e.key)
                      ? 1
                      : -1),
            );
          } else if ((e.key === "Enter" || e.key === " ") && touched) {
            e.preventDefault();
            save(index);
          }
        }}
      >
        <LiquidSurface kind="rail" />
        <div className="rating-path" ref={path}>
          <div className="rating-fill" />
          {SLIDER_GRADES.map((g, i) => (
            <span
              key={g}
              className="rating-stop"
              data-selected={touched && index === i}
              style={{ left: `${i * 25}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="rating-thumb" aria-hidden="true">
            <LiquidSurface kind="thumb" />
            <span>{touched ? grade : <ArrowRight size={22} />}</span>
          </div>
        </div>
      </div>
      <div className="rating-labels" aria-hidden="true">
        {SLIDER_GRADES.map((g) => (
          <span key={g} data-selected={touched && grade === g}>
            {g}
          </span>
        ))}
      </div>
      <p id={`${id}-help`} className="rating-hint">
        {uncertain
          ? "段階の間で離したため、まだ保存していません"
          : "スライドして離すと記録 · タップは選択のみ"}
      </p>
      <button
        type="button"
        className="rating-confirm"
        disabled={disabled || !touched}
        onClick={() => save(index)}
      >
        {touched ? (
          <>
            <Check size={16} />
            {error ? "もう一度 " : ""}
            {grade} を記録
          </>
        ) : (
          "評価を選んでください"
        )}
      </button>
    </section>
  );
}
