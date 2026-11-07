export type VibrationResult =
  "requested" | "unsupported" | "inactive" | "hidden" | "rejected";

// Short pulses can be imperceptible on a phone. Leave a quiet interval so the
// next detent does not replace a pulse that the motor has only just started.
const PULSE_MS = 25;
const GAP_MS = 30;
let pending = 0;
let nextStart = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

function availability():
  Exclude<VibrationResult, "requested" | "rejected"> | undefined {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  )
    return "unsupported";
  if (typeof document !== "undefined" && document.hidden) return "hidden";
  // Chrome requires sticky activation, not transient activation: a touch move
  // isn't itself an activating event. The preceding card tap supplies activation.
  if (navigator.userActivation?.hasBeenActive === false) return "inactive";
}
function request(pattern: VibratePattern): VibrationResult {
  const unavailable = availability();
  if (unavailable) return unavailable;
  try {
    return navigator.vibrate(pattern) ? "requested" : "rejected";
  } catch {
    return "rejected";
  }
}
function flush() {
  timer = undefined;
  if (!pending) return;
  if (availability()) {
    pending = 0;
    return;
  }
  const wait = nextStart - performance.now();
  if (wait > 0) {
    timer = setTimeout(flush, wait);
    return;
  }
  pending--;
  if (request(PULSE_MS) !== "requested") {
    pending = 0;
    return;
  }
  nextStart = performance.now() + PULSE_MS + GAP_MS;
  if (pending) timer = setTimeout(flush, PULSE_MS + GAP_MS);
}
export function stopHaptics() {
  clearTimeout(timer);
  timer = undefined;
  pending = 0;
  if (performance.now() < nextStart) {
    try {
      navigator.vibrate?.(0);
    } catch {
      /* Optional hardware. */
    }
  }
  nextStart = 0;
}
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("blur", stopHaptics);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopHaptics();
  });
}
/** Bound the queue even if the user rapidly changes direction several times. */
export function detentHaptic(steps = 1) {
  listen();
  if (availability()) return;
  pending = Math.min(5, pending + Math.max(1, Math.min(4, Math.floor(steps))));
  if (timer === undefined) flush();
}
/** A trusted button click gives a clearly distinguishable diagnostic pattern.
 * A true return only means the browser accepted it, not that the motor ran. */
export function testVibration(): VibrationResult {
  stopHaptics();
  listen();
  const result = request([60, 70, 60]);
  if (result === "requested") nextStart = performance.now() + 190 + GAP_MS;
  return result;
}
