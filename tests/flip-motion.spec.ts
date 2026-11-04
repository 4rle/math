import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`剛体としての回転 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });
    test("指を止めた角度で2面がつながり、カードとタブも縮んで見える。逆転とキャンセルで復帰する", async ({
      page,
      context,
    }, info) => {
      await page.goto("/");
      await expect(page.locator(".problem-card")).toHaveCount(303);
      const scene = page.locator(".flip-scene");
      const first = page.locator(".problem-card").first();
      const before = (await first.boundingBox())!;
      const tabWidth = (await page.getByRole("tablist").boundingBox())!.width;
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
      for (const fraction of [0.25, 0.4, 0.6]) {
        await move("touchMove", viewport.width * fraction);
        const turn = Number(await scene.getAttribute("data-turn"));
        expect(turn).toBeGreaterThan(0);
        expect(turn).toBeLessThan(1);
        const study = (await page.locator(".flip-face--study").boundingBox())!;
        const menu = (await page.locator(".flip-face--menu").boundingBox())!;
        expect(menu.x + menu.width).toBeCloseTo(study.x, 0);
        expect(study.x + study.width).toBeCloseTo(viewport.width, 0);
        expect((await first.boundingBox())!.width).toBeLessThan(before.width);
        expect(
          (await page.getByRole("tablist").boundingBox())!.width,
        ).toBeLessThan(tabWidth);
        for (const selector of [
          ".flip-solid",
          ".flip-face--menu",
          ".flip-face--study",
          ".book-tabs",
          ".problem-card:first-child",
        ]) {
          await expect(page.locator(selector)).toHaveCSS("opacity", "1");
        }
        // No animation keeps running while the user holds the same position.
        await page.screenshot({
          path: info.outputPath(`turn-${fraction}.png`),
        });
        expect(Number(await scene.getAttribute("data-turn"))).toBe(turn);
      }
      await move("touchMove", 20);
      await move("touchCancel");
      await expect(scene).toHaveAttribute("data-turn", "0.000");
      await expect(scene).toHaveAttribute("data-turning", "false");
      expect((await first.boundingBox())!.x).toBeCloseTo(before.x, 1);
      expect((await first.boundingBox())!.width).toBeCloseTo(before.width, 1);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(first).toHaveAttribute("aria-label", /未着手/);
      await first.tap();
      await expect(
        page.getByRole("dialog", { name: "問題 1 の記録" }),
      ).toBeVisible();
    });
  });
}

test("開閉・途中反転・動き停止でもスクロール位置と同じカードを保持する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const field = page.locator(".card-field"),
    scene = page.locator(".flip-scene"),
    trigger = page.locator("#menu-trigger");
  await expect(page.locator(".problem-card")).toHaveCount(303);
  await field.evaluate((el) => {
    el.scrollTop = 570;
  });
  await trigger.click();
  await expect(scene).toHaveAttribute("data-turn", "1.000");
  await expect(field).toHaveJSProperty("scrollTop", 570);
  await expect(page.locator(".study-face-content")).toHaveAttribute(
    "inert",
    "",
  );
  await trigger.click();
  await expect(scene).toHaveAttribute("data-turn", "0.000");
  await expect(field).toHaveJSProperty("scrollTop", 570);
  // Keyboard can reverse an in-flight animation without waiting for a stable button.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => Number(await scene.getAttribute("data-turn")))
    .toBeGreaterThan(0.1);
  await page.keyboard.press("Enter");
  await expect(scene).toHaveAttribute("data-turn", "0.000");
  await expect(field).toHaveJSProperty("scrollTop", 570);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(scene).toHaveAttribute("data-turn", "1.000");
  await expect(scene).toHaveAttribute("data-turning", "false");
  await expect(field).toHaveCSS("visibility", "visible");
  const side = (await page.locator(".flip-face--study").boundingBox())!;
  expect(side.x).toBeCloseTo(312, 0);
  expect(side.width).toBeCloseTo(78, 0);
  await trigger.click();
  await expect(scene).toHaveAttribute("data-turn", "0.000");
  await expect(field).toHaveJSProperty("scrollTop", 570);
});
