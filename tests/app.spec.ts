import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { initialState, applyImport, recompute, type State } from "../src/model";
async function menu(page: Page, name: string) {
  await page
    .getByRole("button", { name: "メニューを開く", exact: true })
    .click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function close(page: Page) {
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
}
async function readState(page: Page): Promise<State> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("focusgold-orbit", 1);
        open.onsuccess = () => {
          const db = open.result;
          const r = db.transaction("state").objectStore("state").get("current");
          r.onsuccess = () => {
            resolve(r.result);
            db.close();
          };
          r.onerror = () => reject(r.error);
        };
      }),
  );
}
async function seed(page: Page, state: State) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "メニューを開く" }),
  ).toBeVisible();
  await page.evaluate(
    (s) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("focusgold-orbit", 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("state", "readwrite");
          tx.objectStore("state").put(s, "current");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    state,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "メニューを開く" }),
  ).toBeVisible();
}
function populated() {
  return applyImport(
    initialState(),
    Array.from({ length: 48 }, (_, i) => ({
      book: "1A",
      stars: i % 3 === 0 ? 4 : 3,
      number: 125 + i * 3,
      line: i + 1,
      unit: i % 2 ? "三角比" : "",
    })),
    false,
  );
}

test("空状態から登録、キャンセル、即記録、取り消し、参考書の分離と再読み込み", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("最初の問題を、ここに。")).toBeVisible();
  expect(await page.locator("header, nav").count()).toBe(0);
  await menu(page, "問題の登録と管理");
  await page
    .getByLabel("問題番号", { exact: true })
    .fill("１２５，128 132\n125");
  await page.getByRole("button", { name: "読み取った番号を確認" }).click();
  await expect(
    page.getByText("入力内の重複 1 件をまとめました。", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "この内容で登録" }).click();
  await close(page);
  const card = page.getByRole("button", { name: /^問題 125、/ });
  await card.click();
  await page.keyboard.press("Escape");
  await expect(card).toHaveAttribute("aria-label", /未着手/);
  await card.click();
  await page.getByRole("button", { name: /^C 解説を少し確認/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "取り消す" }).click();
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: /^A 自力完答/ }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
  const state = await readState(page);
  expect(state.attempts).toHaveLength(1);
  expect(state.problems[0].latest_grade).toBe("A");
  await page.getByRole("tab", { name: "Ⅱ＋B", exact: true }).click();
  await expect(page.getByText("最初の問題を、ここに。")).toBeVisible();
  await menu(page, "問題の登録と管理");
  await page.getByLabel("問題番号", { exact: true }).fill("125");
  await page.getByRole("button", { name: "読み取った番号を確認" }).click();
  await page.getByRole("button", { name: "この内容で登録" }).click();
  await close(page);
  await expect(
    page.getByRole("button", { name: /^問題 125、☆3、未着手/ }),
  ).toBeVisible();
  expect(
    (await readState(page)).problems.filter((p) => p.number === 125),
  ).toHaveLength(2);
});

test("CSV検証・難度更新の確認で履歴を保持し、履歴修正が派生状態に反映される", async ({
  page,
}) => {
  const s = populated();
  s.attempts = [
    {
      id: "old",
      problem_id: s.problems[0].id,
      grade: "A",
      at: "2026-10-01T01:00:00Z",
      memo: "最初の記録",
    },
  ];
  await seed(page, recompute(s));
  await menu(page, "問題の登録と管理");
  await page
    .getByRole("button", { name: "CSV を取り込む", exact: true })
    .click();
  await page
    .getByLabel("CSV を貼り付け")
    .fill("book,stars,number\n1A,3,125\n1A,3,0");
  await page.getByRole("button", { name: "読み取った番号を確認" }).click();
  await expect(page.getByRole("alert")).toContainText("3行目");
  await expect(
    page.getByRole("button", { name: "この内容で登録" }),
  ).toBeDisabled();
  await page
    .getByLabel("CSV を貼り付け")
    .fill("book,stars,number\n1A,3,125\n2B,4,125");
  await page.getByRole("button", { name: "読み取った番号を確認" }).click();
  await expect(
    page.getByRole("button", { name: "この内容で登録" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /難度が異なる既存/ }).check();
  await page.getByRole("button", { name: "この内容で登録" }).click();
  await close(page);
  let saved = await readState(page);
  expect(saved.problems.find((p) => p.id === s.problems[0].id)).toMatchObject({
    latest_grade: "A",
    stars: 3,
  });
  expect(saved.attempts).toHaveLength(1);
  await menu(page, "学習履歴");
  await page.getByRole("button", { name: /A No. 125/ }).click();
  await page.getByLabel("評価", { exact: true }).selectOption("D");
  await page.getByLabel("この回のメモ").fill("解説を閉じて再現する");
  await page.getByRole("button", { name: "履歴を修正", exact: true }).click();
  saved = await readState(page);
  expect(saved.problems[0]).toMatchObject({
    latest_grade: "D",
    review_available_on: "2026-10-08",
    last_self_solved_at: null,
  });
  expect(saved.attempts[0].memo).toBe("解説を閉じて再現する");
});

test("バックアップの書き出し・確認付き復元と、壊れたバックアップの拒否", async ({
  page,
}) => {
  const s = populated();
  s.attempts = [
    {
      id: "record",
      problem_id: s.problems[0].id,
      grade: "E",
      at: "2026-10-25T01:00:00Z",
      memo: "式変形",
    },
  ];
  await seed(page, recompute(s));
  await menu(page, "データ");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "バックアップを書き出す" }).click();
  const file = await downloadPromise;
  const backup = await readFile((await file.path())!, "utf8");
  expect(JSON.parse(backup).attempts).toHaveLength(1);
  await page.getByLabel("バックアップファイル", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.getByRole("alert")).toContainText("不正");
  const different = initialState();
  different.settings.daily = 9;
  await page.getByLabel("バックアップファイル", { exact: true }).setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(different)),
  });
  await expect(
    page.getByRole("button", { name: "この内容で置き換える" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "現在のデータを置き換えることを確認しました",
    })
    .check();
  await page.getByRole("button", { name: "この内容で置き換える" }).click();
  await expect(
    page.getByRole("heading", { name: "復元内容の確認" }),
  ).toHaveCount(0);
  await close(page);
  await page.reload();
  await expect(page.getByText("最初の問題を、ここに。")).toBeVisible();
  expect((await readState(page)).settings.daily).toBe(9);
  await menu(page, "データ");
  await page.getByLabel("バックアップファイル", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await page
    .getByRole("checkbox", {
      name: "現在のデータを置き換えることを確認しました",
    })
    .check();
  await page.getByRole("button", { name: "この内容で置き換える" }).click();
  await expect(
    page.getByRole("heading", { name: "復元内容の確認" }),
  ).toHaveCount(0);
  await close(page);
  const restored = await readState(page);
  expect(restored.problems).toHaveLength(48);
  expect(restored.attempts[0].memo).toBe("式変形");
});

test("保存失敗時は評価画面と選択結果を残し、再試行できる", async ({ page }) => {
  await seed(page, populated());
  await page.getByRole("button", { name: /^問題 125、/ }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: /^C 解説を少し確認/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { restorePut: () => void }).restorePut(),
  );
  await page.getByRole("button", { name: /^C 解説を少し確認/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await readState(page)).attempts).toHaveLength(1);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 740, height: 360 },
]) {
  test(`カード・評価・メニューが操作できる ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await seed(page, populated());
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(page.locator(".problem-card")).toHaveCount(48);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const first = page.getByRole("button", { name: /^問題 125、/ });
    const rect = await first.boundingBox();
    expect(rect!.width).toBeGreaterThan(100);
    expect(rect!.height).toBeGreaterThan(100);
    await page.screenshot({ path: testInfo.outputPath("field.png") });
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await page.screenshot({ path: testInfo.outputPath("grade.png") });
    await page.getByRole("button", { name: /^E 解説でも不明/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(first).toHaveAttribute("aria-label", /E 解説でも不明/);
    await menu(page, "表示と動き");
    await page
      .getByRole("checkbox", { name: "カードの動きとドラッグ" })
      .uncheck();
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await close(page);
    await expect(page.locator(".universe")).toHaveClass(/still/);
    await first.click();
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });
}

test("模試の登録で A が候補に戻り、確認済みになると再提示しない", async ({
  page,
}) => {
  const s = populated();
  s.attempts = [
    {
      id: "self-solved",
      problem_id: s.problems[0].id,
      grade: "A",
      at: "2025-01-01T00:00:00Z",
      memo: "",
    },
  ];
  await seed(page, recompute(s));
  await expect(page.getByRole("button", { name: /^問題 125、/ })).toHaveCount(
    0,
  );
  await menu(page, "模試");
  await page.getByRole("button", { name: "模試を登録", exact: true }).click();
  await page.getByLabel("模試名", { exact: true }).fill("確認用模試");
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  await page.getByLabel("実施日", { exact: true }).fill(today);
  await page.getByLabel("問題番号範囲", { exact: false }).fill("125-128");
  await page.getByRole("button", { name: "模試を保存", exact: true }).click();
  await expect(page.getByText("確認用模試", { exact: true })).toBeVisible();
  await close(page);
  await page.getByRole("button", { name: /^問題 125、/ }).click();
  await page.getByRole("button", { name: /^A 自力完答/ }).click();
  await expect(page.getByRole("button", { name: /^問題 125、/ })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /^問題 125、/ })).toHaveCount(
    0,
  );
  const saved = await readState(page);
  expect(saved.exams).toHaveLength(1);
  expect(saved.attempts).toHaveLength(2);
  await menu(page, "進捗");
  await expect(page.locator(".progress-pair")).toContainText("取り組み済み");
  await expect(page.locator(".progress-pair strong").first()).toHaveText("1問");
});

test("別のタブの更新を古い状態で上書きしない", async ({ page, context }) => {
  await seed(page, populated());
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: /^問題 125、/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^問題 125、/ }).click();
  await page.getByRole("button", { name: /^C 解説を少し確認/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await other.getByRole("button", { name: /^問題 128、/ }).click();
  await other.getByRole("button", { name: /^A 自力完答/ }).click();
  await expect(other.getByRole("alert")).toContainText("別のタブ");
  await expect(other.getByRole("dialog")).toBeVisible();
  const saved = await readState(page);
  expect(saved.attempts).toHaveLength(1);
  expect(saved.problems.find((p) => p.number === 125)?.latest_grade).toBe("C");
  await other.close();
});

// Dragging is temporary play, and must never create a study attempt or reorder cards.
test("マウスでドラッグすると追従し、離すと戻る。記録と隣のカードは変わらない", async ({
  page,
}, testInfo) => {
  await seed(page, populated());
  const card = page.getByRole("button", { name: /^問題 125、/ });
  const neighbor = page.getByRole("button", { name: /^問題 128、/ });
  const original = (await card.boundingBox())!,
    nextOriginal = (await neighbor.boundingBox())!;
  const before = await readState(page);
  await page.mouse.move(
    original.x + original.width / 2,
    original.y + original.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    original.x + original.width / 2 + 110,
    original.y + original.height / 2 + 65,
    { steps: 12 },
  );
  await expect(card).toHaveAttribute("data-drag-state", "dragging");
  expect((await card.boundingBox())!.x).toBeGreaterThan(original.x + 50);
  expect((await neighbor.boundingBox())!.x).toBeCloseTo(nextOriginal.x, 1);
  await page.screenshot({ path: testInfo.outputPath("drag.png") });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toHaveAttribute("data-drag-state", "idle");
  expect((await card.boundingBox())!.x).toBeCloseTo(original.x, 1);
  expect((await card.boundingBox())!.y).toBeCloseTo(original.y, 1);
  expect(await readState(page)).toEqual(before);
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
});

test("戻り途中の再ドラッグ、キャプチャ中断でも元の位置に復帰する", async ({
  page,
}) => {
  await seed(page, populated());
  const card = page.getByRole("button", { name: /^問題 125、/ });
  const original = (await card.boundingBox())!;
  for (let i = 0; i < 2; i++) {
    const rect = (await card.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width / 2 + 90,
      rect.y + rect.height / 2 + 40,
      { steps: 8 },
    );
    await expect(card).toHaveAttribute("data-drag-state", "dragging");
    if (i === 0) {
      await page.mouse.up();
      await expect(card).toHaveAttribute("data-drag-state", "returning");
    } else {
      await card.evaluate((el) =>
        el.dispatchEvent(
          new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }),
        ),
      );
      await page.mouse.up();
    }
  }
  await expect(card).toHaveAttribute("data-drag-state", "idle");
  expect((await card.boundingBox())!.x).toBeCloseTo(original.x, 1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`指のジェスチャー ${viewport.width}×${viewport.height}`, () => {
    test.use({ hasTouch: true, viewport });
    test("横ドラッグと長押しの自由移動、キャンセル後もタップで記録できる", async ({
      page,
      context,
    }) => {
      await seed(page, populated());
      const cdp = await context.newCDPSession(page);
      const card = page.getByRole("button", { name: /^問題 125、/ });
      const original = (await card.boundingBox())!;
      const x = original.x + original.width / 2,
        y = original.y + original.height / 2;
      const point = (dx = 0, dy = 0) => [{ x: x + dx, y: y + dy, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: point(),
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(65, 10),
      });
      await expect(card).toHaveAttribute("data-drag-state", "dragging");
      expect((await card.boundingBox())!.x).toBeGreaterThan(original.x + 25);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect(card).toHaveAttribute("data-drag-state", "idle");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(
        await page.locator(".card-field").evaluate((el) => el.scrollTop),
      ).toBe(0);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: point(),
      });
      await expect(card).toHaveAttribute("data-drag-state", "dragging"); // 200ms hold
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: point(10, 70),
      });
      await expect
        .poll(async () => (await card.boundingBox())!.y)
        .toBeGreaterThan(original.y + 25);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
      await expect(card).toHaveAttribute("data-drag-state", "idle");
      expect((await card.boundingBox())!.y).toBeCloseTo(original.y, 1);
      await page.touchscreen.tap(x, y);
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: /^C 解説を少し確認/ }).tap();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await readState(page)).attempts).toHaveLength(1);
    });
    test("カード上の縦スワイプで一覧をスクロールできる", async ({
      page,
      context,
    }) => {
      await seed(page, populated());
      const cdp = await context.newCDPSession(page);
      const startY = Math.min(550, viewport.height - 50);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 100, y: startY, id: 1 }],
      });
      for (const dy of [20, 50, 90, 150, 210]) {
        const y = startY - dy;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 100, y, id: 1 }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect
        .poll(() => page.locator(".card-field").evaluate((el) => el.scrollTop))
        .toBeGreaterThan(80);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await readState(page)).attempts).toHaveLength(0);
    });
  });
}

test("動き停止・OSの動きを減らす設定ではドラッグせず、キーボードで記録できる", async ({
  page,
}) => {
  const state = populated();
  state.settings.motion = false;
  await seed(page, state);
  const card = page.getByRole("button", { name: /^問題 125、/ });
  let original = (await card.boundingBox())!;
  await page.mouse.move(original.x + 50, original.y + 50);
  await page.mouse.down();
  await page.mouse.move(original.x + 100, original.y + 85, { steps: 5 });
  expect((await card.boundingBox())!.x).toBeCloseTo(original.x, 1);
  await page.mouse.up();
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape");
  const enabled = populated();
  await seed(page, enabled);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".universe")).toHaveClass(/still/);
  original = (await card.boundingBox())!;
  await page.mouse.move(original.x + 50, original.y + 50);
  await page.mouse.down();
  await page.mouse.move(original.x + 100, original.y + 85, { steps: 5 });
  expect((await card.boundingBox())!.x).toBeCloseTo(original.x, 1);
  await page.mouse.up();
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape");
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});
