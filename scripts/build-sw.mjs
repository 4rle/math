import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = resolve("dist");
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(resolve(dir, e.name)) : resolve(dir, e.name),
      ),
    )
  ).flat();
}
// A build-time allowlist. No API response, navigation query, or user data is cached.
const shell = (await files(root))
  .map((p) => `/${relative(root, p).replaceAll("\\", "/")}`)
  .filter(
    (p) =>
      p === "/index.html" ||
      p === "/manifest.webmanifest" ||
      p === "/favicon.svg" ||
      /^\/icons\/[^/]+\.png$/.test(p) ||
      /^\/assets\/[^/]+\.(js|css|woff2?)$/.test(p),
  )
  .sort();
if (!shell.includes("/index.html") || !shell.some((p) => p.endsWith(".js")))
  throw new Error(
    "Build the application before generating its service worker.",
  );
const hash = createHash("sha256");
for (const path of shell) {
  hash.update(path);
  hash.update(await readFile(resolve(root, `.${path}`)));
}
const revision = hash.digest("hex").slice(0, 20);
const template = await readFile(resolve("scripts/service-worker.js"), "utf8");
await writeFile(
  resolve(root, "sw.js"),
  template
    .replace('"__CACHE_NAME__"', JSON.stringify(`focusgold-shell-${revision}`))
    .replace('"__SHELL_FILES__"', JSON.stringify(shell)),
);
console.log(`PWA shell: ${shell.length} files, revision ${revision}`);
