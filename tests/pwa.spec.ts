import { test, expect, chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { recordGrade } from "./grade-helper";

// Exercise the real production build and worker, independently of the Vite dev server.
test.describe.configure({ mode: "serial" });
let server: Server,
  site: string,
  worker: string,
  originalWorker: string,
  privateReads = 0;
const root = resolve("dist");
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
test.beforeAll(async () => {
  originalWorker = await readFile(resolve(root, "sw.js"), "utf8");
  worker = originalWorker;
  server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Cache-Control", "no-store");
    // Cloudflare Static Assets canonicalizes this URL before serving the HTML.
    if (path === "/index.html") {
      res.writeHead(307, { Location: "/" });
      res.end();
      return;
    }
    if (path === "/private-test") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ revision: ++privateReads }));
      return;
    }
    if (path === "/sw.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(worker);
      return;
    }
    try {
      const filename = resolve(root, `.${path === "/" ? "/index.html" : path}`);
      if (!filename.startsWith(`${root}/`)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = await readFile(filename);
      res.setHeader(
        "Content-Type",
        mime[extname(filename)] || "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  site = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(() => {
  worker = originalWorker;
  privateReads = 0;
});
async function ready(page: import("@playwright/test").Page) {
  await page.goto(site);
  await expect(page.locator(".problem-card")).toHaveCount(303);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

test("本番manifest・アイコン・Service Workerがインストール条件を満たし、タブはフラットな白黒になる", async ({}, info) => {
  const context = await chromium.launchPersistentContext(
    info.outputPath("install-profile"),
    {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      headless: true,
      args: ["--no-sandbox"],
      viewport: { width: 390, height: 844 },
    },
  );
  const page = context.pages()[0] || (await context.newPage());
  try {
    await ready(page);
    const manifest = await page.evaluate(async () => {
      const link =
        document.querySelector<HTMLLinkElement>("link[rel=manifest]")!;
      return (await fetch(link.href)).json();
    });
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    for (const icon of manifest.icons) {
      const size = await page.evaluate(async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return `${image.naturalWidth}x${image.naturalHeight}`;
      }, icon.src);
      expect(size).toBe(icon.sizes);
    }
    const cdp = await context.newCDPSession(page);
    const installability = await cdp.send("Page.getInstallabilityErrors");
    expect(installability.installabilityErrors).toEqual([]);
    await expect(page.locator(".book-tabs > .liquid-surface")).toHaveCount(0);
    await expect(page.locator(".book-tabs")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".book-tabs")).toHaveCSS("border-radius", "0px");
    await expect(page.getByRole("tab").first()).toHaveCSS(
      "background-color",
      "rgb(0, 0, 0)",
    );
    await page.getByRole("tab").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab").nth(1)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.locator("#menu-trigger").click();
    await page.getByRole("button", { name: "General", exact: true }).click();
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(e, {
        prompt: async () => {
          (window as unknown as { prompted: boolean }).prompted = true;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      dispatchEvent(e);
    });
    await page
      .getByRole("button", { name: "アプリをインストール", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => (window as unknown as { prompted: boolean }).prompted,
      ),
    ).toBe(true);
    await page.evaluate(() => dispatchEvent(new Event("appinstalled")));
    await expect(page.getByText("ホーム画面に追加済みです。")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("オフライン再起動・評価保存ができ、個人向けAPIや認証ヘッダー付き応答をキャッシュしない", async ({
  page,
  context,
}) => {
  await ready(page);
  expect(
    await page.evaluate(async () =>
      (await fetch("/private-test?token=test-only")).json(),
    ),
  ).toEqual({ revision: 1 });
  expect(
    await page.evaluate(async () =>
      (
        await fetch("/private-test", {
          headers: { Authorization: "Bearer test-only" },
        })
      ).json(),
    ),
  ).toEqual({ revision: 2 });
  const urls = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (k) =>
          (await (await caches.open(k)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
  });
  expect(
    urls.some((url) => url.includes("private-test") || new URL(url).search),
  ).toBe(false);
  expect(
    await page.evaluate(
      async () => (await caches.match("/index.html"))?.redirected,
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".problem-card")).toHaveCount(303);
  await expect(
    page.locator(".problem-card").first().locator(".liquid-surface"),
  ).toHaveAttribute("data-engine", "liquidglass");
  await page.locator(".problem-card").first().click();
  await recordGrade(page, "B");
  await page.reload();
  await expect(page.locator(".problem-card")).toHaveCount(302);
  await expect(page.getByRole("button", { name: /^問題 1、/ })).toHaveCount(0);
});

test("更新版は入力中に割り込まず、古い画面を閉じると有効になり記録を維持する", async ({
  page,
  context,
}) => {
  await ready(page);
  const oldKeys = await page.evaluate(() => caches.keys());
  await page.locator("#menu-trigger").click();
  await page.getByRole("button", { name: "学習の設定", exact: true }).click();
  const daily = page.getByRole("spinbutton", {
    name: "1 日の新規候補数",
    exact: true,
  });
  await daily.fill("9");
  worker = originalWorker.replace(
    "focusgold-shell-",
    "focusgold-shell-update-",
  );
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r!.update();
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !!(await navigator.serviceWorker.getRegistration())?.waiting,
      ),
    )
    .toBe(true);
  await expect(daily).toHaveValue("9");
  await expect(page.getByRole("region", { name: "学習の設定" })).toBeVisible();
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await page
    .getByRole("button", { name: "メニューに戻る", exact: true })
    .click();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(page.getByText(/新しいバージョンがあります/)).toBeVisible();
  const workers = await Promise.all(
    context.serviceWorkers().map(async (w) => ({
      worker: w,
      cache: await w.evaluate<string>("CACHE"),
    })),
  );
  const replacement = workers.find((w) =>
    w.cache.includes("focusgold-shell-update-"),
  )!.worker;
  await page.close();
  // Wait for the browser to release its old client, without creating another
  // controlled page that would keep the old worker alive again.
  await expect
    .poll(() =>
      replacement.evaluate(() => {
        const r = (
          self as unknown as { registration: ServiceWorkerRegistration }
        ).registration;
        return !r.waiting && r.active?.state === "activated";
      }),
    )
    .toBe(true);
  const next = await context.newPage();
  await next.goto(site);
  await next.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => next.evaluate(() => caches.keys()))
    .toEqual([expect.stringContaining("focusgold-shell-update-")]);
  expect(await next.evaluate(() => caches.keys())).not.toEqual(oldKeys);
  await next.locator("#menu-trigger").click();
  await next.getByRole("button", { name: "学習の設定", exact: true }).click();
  await expect(
    next.getByRole("spinbutton", { name: "1 日の新規候補数", exact: true }),
  ).toHaveValue("9");
});
