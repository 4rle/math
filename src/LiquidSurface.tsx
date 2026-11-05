import { useEffect, useRef } from "react";
import type { LiquidGlass as Engine, GlassConfig } from "@ybouane/liquidglass";

type Kind = "card" | "tabs" | "dialog" | "button";
type Surface = {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  kind: Kind;
  visible: boolean;
  pressed: boolean;
  hover: boolean;
};
const PAD = 20; // Upstream SHADOW_PAD, pinned to LiquidGlass 1.0.3.
const surfaces = new Set<Surface>();
const dirty = new Set<Surface>();
let engine: Engine | undefined;
let defaults: GlassConfig;
let loading: Promise<void> | undefined;
let unavailable = false;
let frame = 0;
let epoch = 0;
const sizes = new Set<string>();
const source = document.createElement("canvas");

async function loadEngine() {
  if (unavailable) return;
  const generation = epoch;
  if (!loading)
    loading = import("@ybouane/liquidglass")
      .then(({ LiquidGlass, DEFAULTS }) => {
        if (generation !== epoch || !surfaces.size) return;
        defaults = DEFAULTS;
        // Use the package's renderer directly: native HTML text and inputs remain
        // above the material, avoiding DOM capture and hundreds of WebGL contexts.
        const before = new Set(document.querySelectorAll("canvas"));
        try {
          engine = new LiquidGlass({
            root: document.createElement("div"),
            glassElements: [],
          });
          engine.renderer.canvas.dataset.liquidRenderer = "shared";
          surfaces.forEach(schedule);
          engine.renderer.canvas.addEventListener("webglcontextlost", () => {
            surfaces.forEach((s) => {
              s.canvas.dataset.engine = "fallback";
            });
          });
          engine.renderer.canvas.addEventListener(
            "webglcontextrestored",
            () => {
              sizes.clear();
              surfaces.forEach(schedule);
            },
          );
        } catch {
          unavailable = true;
          document.querySelectorAll("canvas").forEach((c) => {
            if (!before.has(c) && c.style.display === "none") c.remove();
          });
        }
      })
      .catch(() => {
        unavailable = true;
      });
  await loading;
}
function release() {
  epoch++;
  if (engine) {
    const gl = engine.renderer.gl;
    engine.destroy();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  engine = undefined;
  loading = undefined;
  sizes.clear();
}
function schedule(s: Surface) {
  if (!surfaces.has(s) || !s.visible) return;
  dirty.add(s);
  if (!frame) frame = requestAnimationFrame(flush);
}
async function flush() {
  frame = 0;
  await loadEngine();
  if (!surfaces.size) {
    release();
    return;
  }
  let budget = 4;
  for (const s of dirty) {
    dirty.delete(s);
    if (!surfaces.has(s) || !s.visible) continue;
    if (unavailable || !engine || engine.renderer.contextLost) {
      s.canvas.dataset.engine = "fallback";
      continue;
    }
    const width = s.host.clientWidth,
      height = s.host.clientHeight;
    if (!width || !height) continue;
    // Bound the upstream FBO cache across resize/orientation changes.
    sizes.add(`${width}x${height}`);
    if (sizes.size > 24) {
      engine.renderer.resize(1, 1);
      sizes.clear();
      sizes.add(`${width}x${height}`);
    }
    try {
      draw(s, width, height);
    } catch {
      s.canvas.dataset.engine = "fallback";
    }
    if (--budget === 0) break;
  }
  if (dirty.size && !frame) frame = requestAnimationFrame(flush);
}
function draw(s: Surface, width: number, height: number) {
  const renderer = engine!.renderer;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = Math.round((width + PAD * 2) * dpr),
    h = Math.round((height + PAD * 2) * dpr);
  source.width = w;
  source.height = h;
  const ctx = source.getContext("2d")!;
  const light = ctx.createLinearGradient(0, 0, w, h);
  light.addColorStop(0, "#fcfcfc");
  light.addColorStop(0.4, "#f7f7f7");
  light.addColorStop(0.75, "#ffffff");
  light.addColorStop(1, "#f8f8f8");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  // The selected panel refracts the glass surfaces beneath it, not its own
  // text. Native form content is never rasterised or hidden by the library.
  if (s.kind === "dialog") {
    const r = s.host.getBoundingClientRect();
    for (const other of surfaces) {
      if (
        other.kind !== "card" ||
        !other.visible ||
        other.canvas.dataset.engine !== "liquidglass"
      )
        continue;
      const b = other.host.getBoundingClientRect();
      ctx.drawImage(
        other.canvas,
        (b.x - r.x) * dpr,
        (b.y - r.y) * dpr,
        (b.width + 40) * dpr,
        (b.height + 40) * dpr,
      );
    }
  }
  const config: GlassConfig = {
    ...defaults,
    floating: false,
    button: false,
    chromAberration: 0,
    tintStrength: 0,
    saturation: -1,
    cornerRadius: s.kind === "card" ? 20 : s.kind === "button" ? 12 : 18,
    zRadius: s.pressed ? 2 : s.kind === "dialog" ? 8 : 4,
    blurAmount: s.kind === "dialog" ? 0.12 : 0,
    refraction: 0.24,
    fresnel: 0.24,
    specular: s.hover ? 0.035 : 0.015,
    edgeHighlight: 0.035,
    shadowOpacity: s.pressed ? 0.045 : 0.075,
    shadowSpread: s.pressed ? 4 : 8,
    shadowOffsetY: s.pressed ? 1 : 4,
    brightness: s.hover ? -0.035 : -0.055,
  };
  renderer.uploadAndBlur(source, 0, 0, w, h, config.blurAmount);
  renderer.clear();
  renderer.renderGlassPanel(config, width, height, dpr);
  s.canvas.width = w;
  s.canvas.height = h;
  s.canvas.getContext("2d")!.drawImage(renderer.canvas, 0, 0, w, h, 0, 0, w, h);
  s.canvas.dataset.engine = "liquidglass";
  s.canvas.dataset.pressed = String(s.pressed);
}

/** Shared upstream WebGL material; the canvas never intercepts input. */
export function LiquidSurface({ kind = "card" }: { kind?: Kind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      host = canvas.parentElement!;
    const s: Surface = {
      canvas,
      host,
      kind,
      visible: false,
      pressed: false,
      hover: false,
    };
    surfaces.add(s);
    const observer = new IntersectionObserver((entries) => {
      s.visible = entries[0].isIntersecting;
      if (s.visible) schedule(s);
      else {
        dirty.delete(s);
        canvas.width = canvas.height = 1;
        canvas.dataset.engine = "pending";
      }
    });
    observer.observe(host);
    const resize = new ResizeObserver(() => schedule(s));
    resize.observe(host);
    const over = () => {
      s.hover = true;
      schedule(s);
    };
    const out = () => {
      s.hover = s.pressed = false;
      schedule(s);
    };
    const down = () => {
      s.pressed = true;
      schedule(s);
    };
    const up = () => {
      if (s.pressed) {
        s.pressed = false;
        schedule(s);
      }
    };
    host.addEventListener("pointerenter", over);
    host.addEventListener("pointerleave", out);
    host.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", out);
    return () => {
      observer.disconnect();
      resize.disconnect();
      surfaces.delete(s);
      dirty.delete(s);
      host.removeEventListener("pointerenter", over);
      host.removeEventListener("pointerleave", out);
      host.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", out);
      if (!surfaces.size) {
        cancelAnimationFrame(frame);
        frame = 0;
        release();
      }
    };
  }, [kind]);
  return (
    <canvas
      ref={ref}
      className="liquid-surface"
      data-engine="pending"
      aria-hidden="true"
    />
  );
}
