/* Build template. Cache only this build's public, static shell. */
const CACHE = "__CACHE_NAME__";
const SHELL = "__SHELL_FILES__";
const PATHS = new Set(SHELL);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  // Updates wait for every old app window to close. Never interrupt a study input.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("focusgold-shell-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("authorization")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) return response;
        } catch {
          /* Offline navigation uses the public shell, never a cached login response. */
        }
        const shell = await (await caches.open(CACHE)).match("/index.html");
        if (!shell) return Response.error();
        // Cloudflare redirects /index.html to /. A followed-redirect response
        // cannot be reused for a navigation with redirect mode "manual".
        return new Response(shell.body, {
          status: shell.status,
          statusText: shell.statusText,
          headers: shell.headers,
        });
      })(),
    );
  } else if (!url.search && PATHS.has(url.pathname)) {
    event.respondWith(
      (async () =>
        (await (await caches.open(CACHE)).match(url.pathname)) ||
        fetch(request))(),
    );
  }
});
