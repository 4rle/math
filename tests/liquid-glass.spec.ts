import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("LiquidGlassが実際に描画し、押下に反応する。描画器は一覧と評価画面で共有する", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const first = page.locator(".problem-card").first();
  const material = first.locator(".liquid-surface");
  await expect(material).toHaveAttribute("data-engine", "liquidglass");
  await expect(page.locator("[data-liquid-renderer]")).toHaveCount(1);
  const pixels = await material.evaluate((el: HTMLCanvasElement) => {
    const p = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let painted = 0;
    for (let i = 3; i < p.length; i += 4) if (p[i] > 0) painted++;
    return painted / (el.width * el.height);
  });
  expect(pixels).toBeGreaterThan(0.4);
  // Offscreen cards release their bitmap instead of retaining 303 GPU textures.
  expect(
    await page.locator('.problem-card > [data-engine="liquidglass"]').count(),
  ).toBeLessThan(20);
  const box = (await first.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(material).toHaveAttribute("data-pressed", "true");
  await page.mouse.up();
  const dialog = page.getByRole("dialog", { name: "問題 1 の記録" });
  await expect(dialog.locator(":scope > .liquid-surface")).toHaveAttribute(
    "data-engine",
    "liquidglass",
  );
  await expect(
    dialog.locator('.grade-option > [data-engine="liquidglass"]'),
  ).toHaveCount(5);
  await expect(page.locator("[data-liquid-renderer]")).toHaveCount(1);
  await page.getByRole("button", { name: /^B / }).click();
  await page.reload();
  await expect(page.locator(".problem-card")).toHaveCount(302);
  await page.locator("#menu-trigger").click();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "1.000",
  );
  await expect(page.locator(".book-side .liquid-surface")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("WebGL非対応でもカードを読め、評価を保存できる", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2") return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto("/");
  const first = page.locator(".problem-card").first();
  await expect(first.locator(".liquid-surface")).toHaveAttribute(
    "data-engine",
    "fallback",
  );
  await expect(page.locator("[data-liquid-renderer]")).toHaveCount(0);
  await expect(first).toContainText("多項式の加法・減法");
  await first.click();
  await page.getByRole("button", { name: /^B / }).click();
  await page.reload();
  await expect(page.locator(".problem-card")).toHaveCount(302);
});

test("WebGLのコンテキスト喪失から復帰し、画面回転とタブ切替でも描画器を増やさない", async ({
  page,
}) => {
  await page.goto("/");
  const first = page
    .locator(".problem-card")
    .first()
    .locator(".liquid-surface");
  await expect(first).toHaveAttribute("data-engine", "liquidglass");
  await page
    .locator("[data-liquid-renderer]")
    .evaluate((el: HTMLCanvasElement) => {
      const extension = el
        .getContext("webgl")!
        .getExtension("WEBGL_lose_context")!;
      el.addEventListener(
        "webglcontextlost",
        () => setTimeout(() => extension.restoreContext(), 150),
        { once: true },
      );
      extension.loseContext();
    });
  await expect(first).toHaveAttribute("data-engine", "fallback");
  await expect(first).toHaveAttribute("data-engine", "liquidglass");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator(".problem-card")).toHaveCount(411);
  await expect(first).toHaveAttribute("data-engine", "liquidglass");
  await expect(page.locator("[data-liquid-renderer]")).toHaveCount(1);
});
