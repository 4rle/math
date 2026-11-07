import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`後付けの背表紙 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });
    test("スワイプ確定後に遅れて降下し、2.5秒で右半分を満たす。閉じる回転を妨げない", async ({
      page,
      context,
    }) => {
      await page.goto("/");
      await expect(page.locator(".problem-card")).toHaveCount(303);
      const scene = page.locator(".flip-scene");
      const spine = page.locator(".menu-spine");
      const cdp = await context.newCDPSession(page);
      const touch = async (
        type: "touchStart" | "touchMove" | "touchEnd",
        x = 60,
      ) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : [{ x, y: 100, id: 1 }],
        });
      await touch("touchStart");
      await touch("touchMove", viewport.width * 0.9);
      // The existing finger-following flip has no decorative spine yet.
      await expect(spine).toHaveCount(0);
      await touch("touchEnd");
      await expect(scene).toHaveAttribute("data-turn", "1.000");
      await expect(page.locator(".flip-solid .menu-spine")).toHaveCount(0);
      const before = await page
        .locator(".flip-solid")
        .evaluate((el) => getComputedStyle(el).transform);
      const timing = await spine.evaluate((el) => {
        const animation = el.getAnimations()[0];
        animation.pause();
        animation.currentTime = 500;
        return animation.effect!.getTiming();
      });
      expect(Number(timing.delay) + Number(timing.duration)).toBe(2500);
      expect(timing.delay).toBeGreaterThan(0);
      expect((await spine.boundingBox())!.y + viewport.height).toBeLessThan(0);
      await spine.evaluate((el) => {
        el.getAnimations()[0].currentTime = 1400;
      });
      const falling = (await spine.boundingBox())!;
      expect(falling.y).toBeLessThan(0);
      expect(falling.y + falling.height).toBeGreaterThan(0);
      await spine.evaluate((el) => {
        el.getAnimations()[0].currentTime = 2500;
      });
      const finished = (await spine.boundingBox())!;
      expect(finished.x).toBeCloseTo(viewport.width / 2, 0);
      expect(finished.y).toBeCloseTo(0, 0);
      expect(finished.width).toBeCloseTo(viewport.width / 2, 0);
      expect(finished.height).toBe(viewport.height);
      await expect(spine).toHaveAttribute("aria-hidden", "true");
      await expect(spine).toHaveCSS("pointer-events", "none");
      await expect(page.locator(".menu-spine-title")).toHaveText("Focusgold");
      const title = await page.locator(".menu-spine-title").evaluate((el) => {
        const matrix = new DOMMatrix(getComputedStyle(el).transform);
        return { x: matrix.m11, y: matrix.m12 };
      });
      expect(title.x).toBeCloseTo(0);
      expect(title.y).toBeCloseTo(1);
      expect(
        await page
          .locator(".flip-solid")
          .evaluate((el) => getComputedStyle(el).transform),
      ).toBe(before);
      const study = (await page.locator(".flip-face--study").boundingBox())!;
      expect(study.x).toBeCloseTo(viewport.width * 0.8, 0);
      expect(study.width).toBeLessThan(viewport.width * 0.01);
      await expect(page.locator(".floating-tabs")).toHaveCSS("opacity", "0");
      // The decoration disappears as soon as the existing closing flip moves.
      await touch("touchStart", viewport.width * 0.95);
      await touch("touchMove", viewport.width * 0.7);
      await expect(spine).toHaveCSS("visibility", "hidden");
      await touch("touchMove", 12);
      await touch("touchEnd");
      await expect(scene).toHaveAttribute("data-turn", "0.000");
      await expect(spine).toHaveCount(0);
      await expect(page.locator(".problem-card")).toHaveCount(303);
    });
  });
}

test("早く閉じても背表紙が残らず、再度開くとやり直す。設定から戻っても降下を再生しない", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.locator("#menu-trigger");
  const spine = page.locator(".menu-spine");
  await trigger.click();
  await expect(spine).toHaveCount(1);
  await spine.evaluate((el) => {
    const a = el.getAnimations()[0];
    a.pause();
    a.currentTime = 500;
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(spine).toHaveCount(0);
  await expect(page.locator(".flip-scene")).toHaveAttribute(
    "data-turn",
    "0.000",
  );
  await trigger.click();
  const time = await spine.evaluate((el) => {
    const a = el.getAnimations()[0];
    const initial = Number(a.currentTime);
    a.pause();
    a.currentTime = 2500;
    return initial;
  });
  expect(time).toBeLessThan(750);
  await expect(page.locator(".flip-scene")).toHaveAttribute(
    "data-turn",
    "1.000",
  );
  const original = await spine.elementHandle();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "General", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "メニューに戻る", exact: true })
    .click();
  expect(
    await original!.evaluate(
      (el) => el === document.querySelector(".menu-spine"),
    ),
  ).toBe(true);
  expect((await spine.boundingBox())!.y).toBeCloseTo(0, 0);
  await trigger.click();
  await expect(spine).toHaveCount(0);
});

test("動きを減らす設定では降下を省略し、背表紙があってもハンバーガーから閉じられる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.locator("#menu-trigger").click();
  const spine = page.locator(".menu-spine");
  await expect(spine).toHaveAttribute("data-motion", "false");
  expect(await spine.evaluate((el) => el.getAnimations().length)).toBe(0);
  expect((await spine.boundingBox())!.y).toBe(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(spine).toHaveCount(0);
  await expect(page.locator(".flip-scene")).toHaveAttribute(
    "data-turn",
    "0.000",
  );
});
