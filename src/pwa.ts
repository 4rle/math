type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
let prompt: InstallPrompt | undefined;
let started = false;
let state = { canInstall: false, installed: false, updateAvailable: false };
const listeners = new Set<() => void>();
function update(values: Partial<typeof state>) {
  state = { ...state, ...values };
  listeners.forEach((fn) => fn());
}
export function pwaSnapshot() {
  return state;
}
export function subscribePwa(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export async function installPwa() {
  const event = prompt;
  if (!event) return false;
  prompt = undefined;
  update({ canInstall: false });
  try {
    await event.prompt();
    await event.userChoice;
    return true;
  } catch {
    return false;
  }
}
export function startPwa() {
  if (started) return;
  started = true;
  const standalone = matchMedia("(display-mode: standalone)");
  const installed = () =>
    standalone.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  update({ installed: installed() });
  standalone.addEventListener("change", () =>
    update({ installed: installed() }),
  );
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e as InstallPrompt;
    update({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    prompt = undefined;
    update({ installed: true, canInstall: false });
  });
  // No worker in Vite dev: production/offline behavior is tested against dist.
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  )
    return;
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      const waiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller)
          update({ updateAvailable: true });
      };
      waiting();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", waiting);
      });
    } catch {
      /* The online app and local records remain usable without a worker. */
    }
  };
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}
