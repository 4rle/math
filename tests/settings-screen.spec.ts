import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`メニューから全画面設定へ進んでも立体は開いたまま。Generalと戻る階層 ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".problem-card")).toHaveCount(303);
    await page.locator("#menu-trigger").click();
    await expect(page.locator(".flip-scene")).toHaveAttribute(
      "data-turn",
      "1.000",
    );
    const menu = page.locator(".menu-items");
    await expect(menu.getByRole("button")).toHaveCount(6);
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThan(viewport.height * 0.15);
    expect(box.y + box.height).toBeLessThan(viewport.height * 0.85);
    await expect(
      page.getByRole("button", { name: "データ", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "General", exact: true }).click();
    const screen = page.getByRole("region", { name: "General", exact: true });
    await expect(screen).toBeVisible();
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(page.locator(".flip-scene")).toHaveAttribute("inert", "");
    await expect(page.locator(".flip-scene")).toHaveAttribute(
      "data-turn",
      "1.000",
    );
    await screen.evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished)),
    );
    const rect = (await screen.boundingBox())!;
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(viewport.width);
    expect(rect.height).toBe(viewport.height);
    for (const name of ["アカウントと同期", "学習履歴", "データ", "表示と動き"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    await page.getByRole("button", { name: "表示と動き", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "表示と動き" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Generalに戻る" }).click();
    await expect(screen).toBeVisible();
    await page.getByRole("button", { name: "メニューに戻る" }).click();
    await expect(
      page.getByRole("dialog", { name: "メニュー", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".flip-scene")).toHaveAttribute(
      "data-turn",
      "1.000",
    );
    await page.locator("#menu-trigger").click();
    await expect(page.locator(".flip-scene")).toHaveAttribute(
      "data-turn",
      "0.000",
    );
  });
}

test("白黒の選択メニュー・ラジオ・数値ステッパーで保存でき、Escapeは選択だけを閉じる", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#menu-trigger").click();
  await page.getByRole("button", { name: "表示する問題", exact: true }).click();
  const select = page.getByRole("combobox", { name: "単元" });
  await select.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "表示する問題" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /全登録問題/ }).check();
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await page.getByRole("button", { name: "メニューに戻る" }).click();
  await page.getByRole("button", { name: "学習の設定", exact: true }).click();
  const daily = page.getByRole("spinbutton", {
    name: "1 日の新規候補数",
    exact: true,
  });
  await daily.fill("7");
  await page
    .getByRole("button", { name: "1 日の新規候補数を増やす", exact: true })
    .click();
  await expect(daily).toHaveValue("8");
  await page
    .getByRole("button", { name: "1 日の新規候補数を減らす", exact: true })
    .click();
  await expect(daily).toHaveValue("7");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await page.getByRole("button", { name: "メニューに戻る" }).click();
  await page.getByRole("button", { name: "学習の設定", exact: true }).click();
  await expect(daily).toHaveValue("7");
  await page.getByRole("button", { name: "メニューに戻る" }).click();
  await page
    .getByRole("button", { name: "問題の登録と管理", exact: true })
    .click();
  const book = page.getByRole("combobox", { name: "参考書", exact: true });
  await book.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(book).toHaveText(/Ⅱ＋B＋C/);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByLabel("問題番号", { exact: true }).fill("20");
  await page
    .getByRole("button", { name: "読み取った番号を確認", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "取り込み確認", exact: true }),
  ).toBeVisible();
  await book.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "取り込み確認", exact: true }),
  ).toHaveCount(0);
});
