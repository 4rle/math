import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

type Gesture = {
  id: number;
  type: "touch" | "pointer";
  x: number;
  y: number;
  active: boolean;
};

/** A drag is temporary: no saved position, sorting, or learning state changes. */
export function FloatingCard({
  motion,
  onClick,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { motion: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const blockClickUntil = useRef(0);

  useEffect(() => {
    const card = ref.current!;
    card.dataset.dragState = "idle";
    if (!motion) return;

    let gesture: Gesture | null = null;
    let holdTimer = 0;
    let frame = 0;
    let pose = { x: 0, y: 0, angle: 0, lift: 0 };
    let target = { ...pose };

    const draw = () => {
      card.style.setProperty("--drag-x", `${pose.x.toFixed(3)}px`);
      card.style.setProperty("--drag-y", `${pose.y.toFixed(3)}px`);
      card.style.setProperty("--drag-angle", `${pose.angle.toFixed(3)}deg`);
      card.style.setProperty("--drag-scale", `${1 + pose.lift * 0.045}`);
    };
    const activate = () => {
      if (!gesture) return;
      gesture.active = true;
      card.dataset.dragState = "dragging";
      pose.lift = 1;
      target = { ...pose };
      draw();
    };
    const start = (id: number, type: Gesture["type"], x: number, y: number) => {
      if (gesture) return;
      cancelAnimationFrame(frame);
      clearTimeout(holdTimer);
      blockClickUntil.current = 0;
      target = { ...pose };
      gesture = { id, type, x, y, active: false };
      if (type === "touch") holdTimer = window.setTimeout(activate, 200);
    };
    const move = (x: number, y: number) => {
      if (!gesture?.active) return;
      // Soft resistance keeps the card close enough to its original field.
      const limitX = Math.min(innerWidth * 0.55, 260);
      const limitY = Math.min(innerHeight * 0.45, 200);
      const dx = limitX * Math.tanh((x - gesture.x) / limitX);
      const dy = limitY * Math.tanh((y - gesture.y) / limitY);
      target = {
        x: dx,
        y: dy,
        angle: Math.max(-7, Math.min(7, dx * 0.035)),
        lift: 1,
      };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        pose = target;
        draw();
      });
    };
    const finish = () => {
      clearTimeout(holdTimer);
      const active = gesture?.active;
      gesture = null;
      if (!active && Object.values(pose).every((v) => Math.abs(v) < 0.001)) {
        card.dataset.dragState = "idle";
        return;
      }
      // Also suppress compatibility clicks following touchend/pointerup.
      if (active) blockClickUntil.current = performance.now() + 500;
      cancelAnimationFrame(frame);
      pose = target.lift ? target : pose;
      card.dataset.dragState = "returning";
      let velocity = { x: 0, y: 0, angle: 0, lift: 0 };
      let previous = performance.now();
      const spring = (now: number) => {
        const dt = Math.min((now - previous) / 1000, 0.032);
        previous = now;
        // Damped spring: one small settling motion, no endless bouncing.
        for (const key of ["x", "y", "angle", "lift"] as const) {
          velocity[key] += (-220 * pose[key] - 25 * velocity[key]) * dt;
          pose[key] += velocity[key] * dt;
        }
        draw();
        if (
          Object.values(pose).every((v) => Math.abs(v) < 0.015) &&
          Object.values(velocity).every((v) => Math.abs(v) < 0.15)
        ) {
          pose = { x: 0, y: 0, angle: 0, lift: 0 };
          target = { ...pose };
          draw();
          card.dataset.dragState = "idle";
        } else frame = requestAnimationFrame(spring);
      };
      frame = requestAnimationFrame(spring);
    };

    const pointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !e.isPrimary || e.button !== 0) return;
      start(e.pointerId, "pointer", e.clientX, e.clientY);
      card.setPointerCapture(e.pointerId);
    };
    const pointerMove = (e: PointerEvent) => {
      if (!gesture || gesture.type !== "pointer" || gesture.id !== e.pointerId)
        return;
      if (
        !gesture.active &&
        Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) >= 7
      )
        activate();
      move(e.clientX, e.clientY);
    };
    const pointerEnd = (e: PointerEvent) => {
      if (!gesture || gesture.type !== "pointer" || gesture.id !== e.pointerId)
        return;
      finish();
      if (card.hasPointerCapture(e.pointerId))
        card.releasePointerCapture(e.pointerId);
    };
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        finish();
        return;
      }
      const t = e.changedTouches[0];
      start(t.identifier, "touch", t.clientX, t.clientY);
    };
    const touchMove = (e: TouchEvent) => {
      if (!gesture || gesture.type !== "touch") return;
      if (e.touches.length !== 1) {
        finish();
        return;
      }
      const t = Array.from(e.touches).find((t) => t.identifier === gesture!.id);
      if (!t) return;
      const dx = t.clientX - gesture.x,
        dy = t.clientY - gesture.y;
      if (!gesture.active) {
        if (Math.abs(dy) >= 8 && Math.abs(dy) >= Math.abs(dx)) {
          // An ordinary vertical swipe always belongs to native scrolling.
          finish();
          return;
        }
        if (Math.abs(dx) >= 8) activate();
      }
      if (gesture.active && e.cancelable) {
        e.preventDefault();
        move(t.clientX, t.clientY);
      }
    };
    const touchEnd = (e: TouchEvent) => {
      if (!gesture || gesture.type !== "touch") return;
      if (
        !Array.from(e.changedTouches).some((t) => t.identifier === gesture!.id)
      )
        return;
      if (gesture.active && e.cancelable) e.preventDefault();
      finish();
    };
    const cancel = () => {
      if (gesture) blockClickUntil.current = performance.now() + 500;
      finish();
    };
    const contextMenu = (e: Event) => {
      if (gesture?.active) {
        e.preventDefault();
      }
    };
    const blur = () => cancel();
    card.addEventListener("pointerdown", pointerDown);
    card.addEventListener("pointermove", pointerMove);
    card.addEventListener("pointerup", pointerEnd);
    card.addEventListener("pointercancel", cancel);
    card.addEventListener("lostpointercapture", pointerEnd);
    card.addEventListener("touchstart", touchStart, { passive: true });
    // Only this card's active drag cancels native scrolling. Pinch zoom is retained.
    card.addEventListener("touchmove", touchMove, { passive: false });
    card.addEventListener("touchend", touchEnd, { passive: false });
    card.addEventListener("touchcancel", cancel);
    card.addEventListener("contextmenu", contextMenu);
    window.addEventListener("blur", blur);
    return () => {
      if (gesture?.active) blockClickUntil.current = performance.now() + 500;
      clearTimeout(holdTimer);
      cancelAnimationFrame(frame);
      card.removeEventListener("pointerdown", pointerDown);
      card.removeEventListener("pointermove", pointerMove);
      card.removeEventListener("pointerup", pointerEnd);
      card.removeEventListener("pointercancel", cancel);
      card.removeEventListener("lostpointercapture", pointerEnd);
      card.removeEventListener("touchstart", touchStart);
      card.removeEventListener("touchmove", touchMove);
      card.removeEventListener("touchend", touchEnd);
      card.removeEventListener("touchcancel", cancel);
      card.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("blur", blur);
      for (const name of [
        "--drag-x",
        "--drag-y",
        "--drag-angle",
        "--drag-scale",
      ])
        card.style.removeProperty(name);
      card.dataset.dragState = "idle";
    };
  }, [motion]);

  return (
    <button
      {...props}
      ref={ref}
      draggable={false}
      aria-describedby={motion ? "card-gesture-help" : undefined}
      onClick={(e) => {
        if (e.detail !== 0 && performance.now() < blockClickUntil.current) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
