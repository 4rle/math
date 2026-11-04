import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`3D書籍 ${viewport.width}×${viewport.height}`, () => {
    test.use({ hasTouch: true, viewport });
    test("指の途中位置に回転が追従し、慣性で開く。メニュー上から逆スワイプで閉じる", async ({
      page,
      context,
    }, info) => {
      await page.goto("/");
      await expect(page.locator(".problem-card")).toHaveCount(303);
      const cdp = await context.newCDPSession(page);
      const root = page.locator(".book-scene");
      const x = 95,
        y = 175;
      const send = async (
        type: "touchStart" | "touchMove" | "touchEnd",
        dx = 0,
      ) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : [{ x: x + dx, y, id: 1 }],
        });
      await send("touchStart");
      await send("touchMove", 30);
      const first = Number(await root.getAttribute("data-turn"));
      const midButton = await page.locator("#menu-trigger").evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { x: m.m41, z: m.m43, rotation: m.m13 };
      });
      expect(midButton.x).toBeGreaterThan(10);
      expect(midButton.z).toBeGreaterThan(0);
      expect(midButton.rotation).toBe(0);
      await send("touchMove", 90);
      expect(Number(await root.getAttribute("data-turn"))).toBeGreaterThan(
        first,
      );
      const matrix = await page.locator(".book-volume").evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { depth: m.m13, rotate: m.m11 };
      });
      expect(Math.abs(matrix.depth)).toBeGreaterThan(0.1);
      expect(matrix.rotate).toBeLessThan(1);
      await page.screenshot({ path: info.outputPath("mid-turn.png") });
      await send("touchMove", viewport.width * 0.6);
      await send("touchEnd");
      await expect(root).toHaveAttribute("data-turn", "1.000");
      await expect(
        page.getByRole("dialog", { name: "メニュー" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "問題の登録と管理", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".study-layer")).toHaveAttribute("inert", "");
      await expect(page.locator(".grade-dialog")).toHaveCount(0);
      await expect(page.locator(".book-spine")).toContainText(
        "Focusgold Helper",
      );
      await page.screenshot({ path: info.outputPath("open-book.png") });
      // Start on a menu item: horizontal gestures must not activate that item.
      const item = await page
        .getByRole("button", { name: "表示する問題", exact: true })
        .boundingBox();
      const start = item!.x + item!.width - 8;
      const menuY = item!.y + item!.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: start, y: menuY, id: 1 }],
      });
      for (const dx of [30, 75, start - 12]) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start - dx, y: menuY, id: 1 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(root).toHaveAttribute("data-turn", "0.000");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(".card-field")).toHaveJSProperty(
        "scrollTop",
        0,
      );
      await expect(page.locator(".problem-card")).toHaveCount(303);
      await page.locator(".problem-card").first().tap();
      await expect(
        page.getByRole("dialog", { name: "問題 1 の記録" }),
      ).toBeVisible();
      await expect(page.locator(".selected-title")).toHaveText(
        "多項式の加法・減法",
      );
      await page.getByRole("button", { name: /^B / }).tap();
      await page.reload();
      await expect(page.getByRole("button", { name: /^問題 1、/ })).toHaveCount(
        0,
      );
    });
  });
}

test("メニューのフォーカス循環、Escapeで復帰、動き停止でも全項目にアクセスできる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "メニューを開く",
    exact: true,
  });
  await trigger.click();
  const close = page.getByRole("button", { name: "閉じる", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "問題一覧に戻る", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "0.000",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(110, 95);
  await page.mouse.down();
  await page.mouse.move(290, 95, { steps: 5 });
  expect(
    await page
      .locator(".book-scene")
      .evaluate((el) => el.style.getPropertyValue("--turn")),
  ).toBe("0");
  await page.mouse.up();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "1.000",
  );
  await page.keyboard.press("Escape");
  await trigger.click();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "1.000",
  );
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turning",
    "false",
  );
  await page.getByRole("button", { name: "表示と動き", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "表示と動き" })).toBeVisible();
  await page
    .getByRole("button", { name: "メニューに戻る", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "メニュー" })).toBeVisible();
});

test("PCでも回転した本をクリックすると一覧へ戻れる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "メニューを開く", exact: true })
    .click();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "1.000",
  );
  const spine = (await page.locator(".book-spine").boundingBox())!;
  await page.mouse.click(spine.x + spine.width / 2, spine.y + spine.height / 2);
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "0.000",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("90度回転で右半分を背表紙が埋め、同じメニューボタンが右上へ移動する", async ({
  page,
}, info) => {
  await page.goto("/");
  const trigger = page.locator("#menu-trigger");
  const original = await trigger.elementHandle();
  await trigger.click();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "1.000",
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [932, 430],
    [740, 360],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    const spine = (await page.locator(".book-spine").boundingBox())!;
    expect(spine.x).toBeCloseTo(width / 2, 0);
    expect(spine.y).toBeCloseTo(0, 0);
    expect(spine.width).toBeCloseTo(width / 2, 0);
    expect(spine.height).toBeCloseTo(height, 0);
    const matrix = await page.locator(".book-volume").evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return { cosine: m.m11, sine: m.m13, scaleY: m.m22 };
    });
    expect(matrix.cosine).toBeCloseTo(0, 5);
    expect(matrix.sine).toBeCloseTo(-1, 5);
    expect(matrix.scaleY).toBe(1);
    const button = (await trigger.boundingBox())!;
    expect(button.x + button.width).toBeCloseTo(width - 12, 0);
    expect(button.y).toBeCloseTo(16, 0);
    expect(
      await original!.evaluate(
        (el) => el === document.getElementById("menu-trigger"),
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`full-spine-${width}.png`) });
  }
  await trigger.click();
  await expect(page.locator(".book-scene")).toHaveAttribute(
    "data-turn",
    "0.000",
  );
  expect((await trigger.boundingBox())!.x).toBeCloseTo(12, 0);
  await expect(trigger).toBeFocused();
});
