import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`ガラスの独立レイヤー ${viewport.width}×${viewport.height}`, () => {
    test.use({ hasTouch: true, viewport });
    test("面が回転してもタブ・カードは正面を保ち、遅れて横移動する。途中で戻しても残像や誤記録を残さない", async ({
      page,
      context,
    }, info) => {
      await page.goto("/");
      await expect(page.locator(".problem-card")).toHaveCount(303);
      const scene = page.locator(".book-scene");
      expect(
        await page
          .locator(".book-volume .problem-card, .book-volume .book-tabs")
          .count(),
      ).toBe(0);
      const first = page.locator(".problem-card").first();
      const original = (await first.boundingBox())!;
      const cdp = await context.newCDPSession(page);
      const startX = 60,
        startY = viewport.height > 500 ? 95 : 76;
      const move = async (
        type: "touchStart" | "touchMove" | "touchCancel",
        dx = 0,
      ) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints:
            type === "touchCancel"
              ? []
              : [{ x: startX + dx, y: startY, id: 1 }],
        });
      await move("touchStart");
      await move("touchMove", viewport.width * 0.4);
      await expect
        .poll(() =>
          scene.evaluate((el) =>
            Number(el.style.getPropertyValue("--tabs-exit")),
          ),
        )
        .toBeGreaterThan(0.05);
      const layers = await scene.evaluate((el) => ({
        turn: Number(el.getAttribute("data-turn")),
        tabs: Number(el.style.getPropertyValue("--tabs-exit")),
        front: Number(el.style.getPropertyValue("--tile-exit-0")),
        rear: Number(el.style.getPropertyValue("--tile-exit-3")),
      }));
      expect(layers.tabs).toBeLessThan(layers.turn);
      expect(layers.front).toBeLessThan(layers.turn);
      expect(layers.rear).toBeLessThan(layers.front);
      const orientation = await page
        .locator(".floating-tabs")
        .evaluate((el) => {
          const m = new DOMMatrix(getComputedStyle(el).transform);
          return { x: m.m41, rotate: m.m13, scaleX: m.m11 };
        });
      expect(orientation.x).toBeGreaterThan(10);
      expect(orientation.rotate).toBe(0);
      expect(orientation.scaleX).toBe(1);
      const menuSurface = await page.locator(".flip-menu").evaluate((el) => {
        const style = getComputedStyle(el.closest(".book-side")!),
          matrix = new DOMMatrix(style.transform);
        return {
          opacity: style.opacity,
          rotation: matrix.m13,
          scaleX: matrix.m11,
        };
      });
      expect(menuSurface.opacity).toBe("1");
      expect(menuSurface.rotation).toBeGreaterThan(0.1);
      expect(menuSurface.scaleX).toBeLessThan(0.99);
      expect(
        await page
          .locator(".flip-menu")
          .evaluate(
            (el) =>
              el.parentElement ===
              document.querySelector(".book-spine")?.parentElement,
          ),
      ).toBe(true);
      await expect(page.locator(".floating-tabs")).toHaveCSS("opacity", "1");
      await expect(first).toHaveCSS("opacity", "1");
      // Unlike the turning desk, the slab retains its face and readable width.
      expect((await first.boundingBox())!.width).toBeCloseTo(original.width, 0);
      await page.screenshot({ path: info.outputPath("layered-swipe.png") });
      await move("touchMove", 20);
      await move("touchCancel");
      await expect(scene).toHaveAttribute("data-turn", "0.000");
      await expect(scene).toHaveAttribute("data-layers-settled", "true");
      await expect(first).toHaveCSS("opacity", "1");
      expect((await first.boundingBox())!.x).toBeCloseTo(original.x, 1);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(first).toHaveAttribute("aria-label", /未着手/);
      await first.tap();
      await expect(
        page.getByRole("dialog", { name: "問題 1 の記録" }),
      ).toBeVisible();
    });
  });
}

test("開閉後も一覧のスクロール位置を保ち、動き停止では遅延レイヤーも即座に切り替わる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const field = page.locator(".card-field"),
    scene = page.locator(".book-scene");
  await expect(page.locator(".problem-card")).toHaveCount(303);
  await field.evaluate((el) => {
    el.scrollTop = 570;
  });
  await page.locator("#menu-trigger").click();
  await expect(scene).toHaveAttribute("data-turn", "1.000");
  await expect(scene).toHaveAttribute("data-layers-settled", "true");
  await expect(page.locator(".floating-tabs")).toHaveCSS("opacity", "1");
  expect(
    (await page.locator(".floating-tabs").boundingBox())!.x,
  ).toBeGreaterThan(390);
  await expect(page.locator(".flip-menu")).toHaveCSS("opacity", "1");
  await expect(field).toHaveJSProperty("scrollTop", 570);
  await page.locator("#menu-trigger").click();
  await expect(scene).toHaveAttribute("data-turn", "0.000");
  await expect(scene).toHaveAttribute("data-layers-settled", "true");
  await expect(field).toHaveJSProperty("scrollTop", 570);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#menu-trigger").click();
  await expect(scene).toHaveAttribute("data-turn", "1.000");
  await expect(scene).toHaveAttribute("data-layers-settled", "true");
  await expect(page.locator(".study-layer")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".floating-tabs")).toHaveCSS(
    "visibility",
    "hidden",
  );
  await page.locator("#menu-trigger").click();
  await expect(scene).toHaveAttribute("data-turn", "0.000");
  await expect(scene).toHaveAttribute("data-layers-settled", "true");
  await expect(page.locator(".floating-tabs")).toHaveCSS("opacity", "1");
  await expect(field).toHaveJSProperty("scrollTop", 570);
});
