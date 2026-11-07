import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`後付けの背表紙 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });
    test("スワイプ確定後にその場でフェードインし、メニューに重ならず右20%を満たす。閉じる回転を妨げない", async ({
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
        animation.currentTime = 0;
        return animation.effect!.getTiming();
      });
      expect(Number(timing.delay) + Number(timing.duration)).toBe(360);
      expect(timing.delay).toBe(0);
      await expect(spine).toHaveCSS("opacity", "0");
      await expect(spine).toHaveCSS("transform", "none");
      const initial = (await spine.boundingBox())!;
      await spine.evaluate((el) => {
        el.getAnimations()[0].currentTime = 180;
      });
      const fading = (await spine.boundingBox())!;
      expect(fading).toEqual(initial);
      const alpha = await spine.evaluate((el) =>
        Number(getComputedStyle(el).opacity),
      );
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      await spine.evaluate((el) => {
        el.getAnimations()[0].currentTime = 360;
      });
      const finished = (await spine.boundingBox())!;
      await expect(spine).toHaveCSS("opacity", "1");
      expect(finished).toEqual(initial);
      expect(finished.x).toBeCloseTo(viewport.width * 0.8, 0);
      expect(finished.y).toBeCloseTo(0, 0);
      expect(finished.width).toBeCloseTo(viewport.width * 0.2, 0);
      expect(finished.height).toBe(viewport.height);
      const menu = (await page.locator(".flip-face--menu").boundingBox())!;
      expect(menu.x + menu.width).toBeLessThanOrEqual(finished.x + 1);
      await expect(spine).toHaveAttribute("aria-hidden", "true");
      await expect(spine).toHaveCSS("pointer-events", "none");
      await expect(page.locator(".menu-spine-brand")).toHaveText("Focus Gold");
      await expect(page.locator(".menu-spine-brand")).toHaveCSS(
        "writing-mode",
        "horizontal-tb",
      );
      await expect(page.locator(".menu-spine-subject")).toHaveText("数学Ⅰ+A");
      await expect(page.locator(".menu-spine-subject")).toHaveCSS(
        "writing-mode",
        "vertical-rl",
      );
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

test("ボタンで開くと回転の終盤からフェードを開始し、完了まで待ちすぎない", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#menu-trigger").click();
  const start = await page.evaluate(
    () =>
      new Promise<{ turn: number; playState: string }>((resolve) => {
        const scene = document.querySelector<HTMLElement>(".flip-scene")!;
        const sample = () => {
          const turn = Number(scene.dataset.turn);
          if (turn >= 0.9) {
            resolve({
              turn,
              playState: getComputedStyle(scene.querySelector(".menu-spine")!)
                .animationPlayState,
            });
          } else requestAnimationFrame(sample);
        };
        sample();
      }),
  );
  expect(start.turn).toBeLessThan(1);
  expect(start.playState).toBe("running");
});

test("早く閉じても背表紙が残らず、再度開くとやり直す。設定から戻ってもフェードを再生しない", async ({
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
    a.currentTime = 0;
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
    a.currentTime = 360;
    return initial;
  });
  expect(time).toBeLessThan(360);
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

test("動きを減らす設定ではフェードを省略し、背表紙があってもハンバーガーから閉じられる", async ({
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
  await expect(spine).toHaveCSS("opacity", "1");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(spine).toHaveCount(0);
  await expect(page.locator(".flip-scene")).toHaveAttribute(
    "data-turn",
    "0.000",
  );
});

test("選択した参考書の科目名を白い縦組みにし、金の横組みと同梱の明朝体で表示する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const subjects = ["数学Ⅰ+A", "数学Ⅱ+B+C", "数学Ⅲ+C"];
  for (let index = 0; index < subjects.length; index++) {
    await page.getByRole("tab").nth(index).click();
    await expect(page.getByRole("tab").nth(index)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.locator("#menu-trigger").click();
    const subject = page.locator(".menu-spine-subject");
    const brand = page.locator(".menu-spine-brand");
    await expect(subject).toHaveText(subjects[index]);
    await expect(subject).toHaveCSS("writing-mode", "vertical-rl");
    await expect(subject).toHaveCSS("text-orientation", "upright");
    await expect(subject).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(brand).toHaveText("Focus Gold");
    await expect(brand).toHaveCSS("writing-mode", "horizontal-tb");
    await expect(brand).toHaveCSS("color", "rgb(216, 180, 92)");
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() =>
        [...document.fonts].some(
          (font) =>
            font.family === "Focusgold Spine Serif" && font.status === "loaded",
        ),
      ),
    ).toBe(true);
    await expect(subject).toHaveCSS("font-family", /Focusgold Spine Serif/);
    await page.locator("#menu-trigger").click();
    await expect(page.locator(".flip-scene")).toHaveAttribute(
      "data-turn",
      "0.000",
    );
  }
  await page.reload();
  await page.locator("#menu-trigger").click();
  await expect(page.locator(".menu-spine-subject")).toHaveText("数学Ⅲ+C");
});
