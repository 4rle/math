import { test, expect, type Page } from "@playwright/test";
import type { State } from "../src/model";
async function saved(page: Page) {
  return page.evaluate(
    () =>
      new Promise<State>((resolve, reject) => {
        const r = indexedDB.open("focusgold-orbit", 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("state").objectStore("state").get("current");
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
}
async function open(page: Page) {
  await page.goto("/");
  await page.locator(".problem-card").first().click();
  await page
    .locator(".grade-dialog")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return page.getByRole("slider", { name: "理解度", exact: true });
}
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`指でEからAへ5点を滑り、一度だけ記録する。振動は各段階で要求する ${viewport.width}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "vibrate", {
        value: (p: number) => {
          (window as unknown as { ticks: number[] }).ticks.push(p);
          return true;
        },
      });
      (window as unknown as { ticks: number[] }).ticks = [];
    });
    const page = await context.newPage();
    const slider = await open(page);
    await expect(slider).toHaveAttribute("aria-valuetext", /未選択/);
    expect((await saved(page)).attempts).toHaveLength(0);
    const r = (await page.locator(".rating-path").boundingBox())!,
      y = r.y + r.height / 2;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: r.x, y, id: 1 }],
    });
    for (let i = 1; i <= 4; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: r.x + (r.width * i) / 4, y, id: 1 }],
      });
      await expect(slider).toHaveAttribute("aria-valuenow", String(i));
      expect((await saved(page)).attempts).toHaveLength(0);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator(".grade-dialog")).toHaveCount(0);
    expect((await saved(page)).attempts.map((a) => a.grade)).toEqual(["A"]);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { ticks: number[] }).ticks),
      )
      .toEqual([25, 25, 25, 25, 25]);
    await page.getByRole("button", { name: "取り消す", exact: true }).click();
    expect((await saved(page)).attempts).toHaveLength(0);
    await context.close();
  });
}

test("タップだけでは記録せず、Eを明示して記録できる。振動APIがなくても動作する", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "vibrate", { value: undefined }),
  );
  const slider = await open(page);
  const r = (await page.locator(".rating-path").boundingBox())!;
  await page.mouse.click(r.x, r.y + r.height / 2);
  await expect(slider).toHaveAttribute("aria-valuetext", /^E /);
  expect((await saved(page)).attempts).toHaveLength(0);
  await page.getByRole("button", { name: "E を記録", exact: true }).click();
  await expect(page.locator(".grade-dialog")).toHaveCount(0);
  expect((await saved(page)).attempts.map((a) => a.grade)).toEqual(["E"]);
});

test("中間点でのリリース・pointercancel・フォーカス喪失は誤記録しない", async ({
  page,
}) => {
  const slider = await open(page),
    r = (await page.locator(".rating-path").boundingBox())!,
    y = r.y + r.height / 2;
  await page.mouse.move(r.x, y);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.38, y, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".rating-hint")).toContainText(
    "まだ保存していません",
  );
  expect((await saved(page)).attempts).toHaveLength(0);
  await page.mouse.move(r.x, y);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width, y, { steps: 8 });
  await slider.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  expect((await saved(page)).attempts).toHaveLength(0);
  await page.mouse.move(r.x, y);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width, y, { steps: 8 });
  await page.evaluate(() => dispatchEvent(new Event("blur")));
  await page.mouse.up();
  expect((await saved(page)).attempts).toHaveLength(0);
  await expect(slider).toHaveAttribute("data-dragging", "false");
});

test("キーボード・動きを減らす設定で選択と確定を分け、保存失敗後も一件だけ再試行できる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const slider = await open(page);
  await slider.focus();
  await page.keyboard.press("Enter");
  expect((await saved(page)).attempts).toHaveLength(0);
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /^A /);
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuetext", /^B /);
  expect((await saved(page)).attempts).toHaveLength(0);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restore: () => void }).restore = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", /^B /);
  expect((await saved(page)).attempts).toHaveLength(0);
  await page.evaluate(() =>
    (window as unknown as { restore: () => void }).restore(),
  );
  await page
    .getByRole("button", { name: "もう一度 B を記録", exact: true })
    .click();
  await expect(page.locator(".grade-dialog")).toHaveCount(0);
  expect((await saved(page)).attempts.map((a) => a.grade)).toEqual(["B"]);
});

test("Motionの振動テストが受付と拒否を表示し、設定の保存とは別に動く", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as unknown as { accepted: boolean; patterns: VibratePattern[] }
    ).accepted = true;
    (window as unknown as { patterns: VibratePattern[] }).patterns = [];
    Object.defineProperty(navigator, "vibrate", {
      value: (pattern: VibratePattern) => {
        (window as unknown as { patterns: VibratePattern[] }).patterns.push(
          pattern,
        );
        return (window as unknown as { accepted: boolean }).accepted;
      },
    });
  });
  await page.goto("/");
  await page.locator("#menu-trigger").click();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "表示と動き", exact: true }).click();
  await page.getByRole("button", { name: "振動をテスト", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("振動を要求しました");
  expect(
    await page.evaluate(
      () => (window as unknown as { patterns: VibratePattern[] }).patterns,
    ),
  ).toContainEqual([60, 70, 60]);
  await page.evaluate(() => {
    (window as unknown as { accepted: boolean }).accepted = false;
  });
  await page.getByRole("button", { name: "振動をテスト", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("受け付けませんでした");
  await expect(
    page.getByRole("checkbox", { name: "カードの動きとドラッグ" }),
  ).toBeChecked();
});
