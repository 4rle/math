import { recordGrade } from "./grade-helper";
import {
  test,
  expect,
  type BrowserContext,
  type Browser,
  type Page,
} from "@playwright/test";
import type { State } from "../src/model";
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
type Remote = { version: number; state: State; updated_at: string };
class Backend {
  records = new Map<string, Remote>();
  offline = new Set<BrowserContext>();
  hold: Promise<void> | null = null;
  user(email: string) {
    return {
      id: email.startsWith("bob") ? bob : alice,
      aud: "authenticated",
      role: "authenticated",
      email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
    };
  }
  async attach(context: BrowserContext) {
    await context.route("http://127.0.0.1:54321/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Content-Type": "application/json",
      };
      const reply = (body: unknown, status = 200) =>
        route.fulfill({ status, headers, body: JSON.stringify(body) });
      if (this.offline.has(context)) {
        await route.abort("internetdisconnected");
        return;
      }
      if (req.method() === "OPTIONS") {
        await reply({});
        return;
      }
      const input = req.postDataJSON() as Record<string, any> | null;
      let subject = "";
      try {
        subject = JSON.parse(
          Buffer.from(
            (req.headers().authorization || "")
              .replace("Bearer ", "")
              .split(".")[1],
            "base64url",
          ).toString(),
        ).sub;
      } catch {}
      if (path === "/auth/v1/token") {
        if (input?.password !== "correct-password") {
          await reply(
            {
              error_code: "invalid_credentials",
              msg: "Invalid login credentials",
            },
            400,
          );
          return;
        }
        const user = this.user(input.email),
          token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
        await reply({
          access_token: token,
          refresh_token: "test-refresh-" + user.id,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        });
        return;
      }
      if (path === "/auth/v1/signup") {
        await reply({ user: this.user(input!.email), session: null });
        return;
      }
      if (path === "/auth/v1/recover") {
        await reply({});
        return;
      }
      if (path === "/auth/v1/logout") {
        await reply({});
        return;
      }
      if (path === "/auth/v1/user") {
        await reply(
          this.user(
            subject === bob ? "bob@example.test" : "alice@example.test",
          ),
        );
        return;
      }
      if (![alice, bob].includes(subject)) {
        await reply({ message: "unauthorized" }, 401);
        return;
      }
      if (path === "/rest/v1/study_states") {
        const row = this.records.get(subject);
        await reply(
          row && url.searchParams.get("user_id") === `eq.${subject}`
            ? [row]
            : [],
        );
        return;
      }
      if (path === "/rest/v1/rpc/save_study_state") {
        if (this.hold) await this.hold;
        const old = this.records.get(subject);
        if ((old?.version || 0) !== input!.expected_version) {
          await reply({ message: "SYNC_CONFLICT", code: "P0001" }, 400);
          return;
        }
        const next = {
          state: input!.payload as State,
          version: (old?.version || 0) + 1,
          updated_at: new Date().toISOString(),
        };
        this.records.set(subject, next);
        await reply(next);
        return;
      }
      await reply({ message: "not found" }, 404);
    });
  }
}
async function account(page: Page) {
  await page
    .getByRole("button", { name: "メニューを開く", exact: true })
    .click();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page
    .getByRole("button", { name: "アカウントと同期", exact: true })
    .click();
}
async function close(page: Page) {
  if (await page.locator(".settings-screen").count())
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
}
async function login(page: Page, email = "alice@example.test") {
  await page.goto("/");
  await account(page);
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "ログインする", exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "同期済み" }),
  ).toBeVisible();
}
async function grade(page: Page, number: number, grade = "C") {
  await page
    .getByRole("button", { name: new RegExp(`^問題 ${number}、`) })
    .click();
  await recordGrade(page, grade);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function contextFor(browser: Browser, backend: Backend) {
  const context = await browser.newContext();
  await backend.attach(context);
  return context;
}

test("2つの独立したブラウザーで同じアカウントの記録が同期され、別ユーザーには見えない", async ({
  browser,
}) => {
  const backend = new Backend(),
    one = await contextFor(browser, backend),
    two = await contextFor(browser, backend),
    other = await contextFor(browser, backend);
  const a = await one.newPage(),
    b = await two.newPage(),
    c = await other.newPage();
  await login(a);
  await close(a);
  await grade(a, 1);
  await expect
    .poll(() => backend.records.get(alice)?.state.attempts.length)
    .toBe(1);
  await login(b);
  await close(b);
  await expect(b.getByRole("button", { name: /^問題 1、/ })).toHaveCount(0);
  await grade(b, 2, "D");
  await expect
    .poll(() => backend.records.get(alice)?.state.attempts.length)
    .toBe(2);
  await account(a);
  await a.getByRole("button", { name: "今すぐ同期", exact: true }).click();
  await expect(
    a.getByRole("status").filter({ hasText: "同期済み" }),
  ).toBeVisible();
  await close(a);
  await expect(a.getByRole("button", { name: /^問題 2、/ })).toHaveCount(0);
  await a.reload();
  await expect(a.getByRole("button", { name: /^問題 1、/ })).toHaveCount(0);
  await login(c, "bob@example.test");
  await close(c);
  await expect(c.getByRole("button", { name: /^問題 1、/ })).toBeVisible();
  expect(backend.records.get(bob)?.state.attempts).toHaveLength(0);
  await one.close();
  await two.close();
  await other.close();
});

test("ログイン前のデータを確認して引き継ぎ、ログアウトや別アカウントで混ざらない", async ({
  browser,
}) => {
  const backend = new Backend(),
    context = await contextFor(browser, backend),
    page = await context.newPage();
  await page.goto("/");
  await grade(page, 1, "D");
  await account(page);
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("alice@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "ログインする", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("確認してください");
  await page.getByLabel("パスワード", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "ログインする", exact: true }).click();
  await expect(
    page.getByText("alice@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "この端末の記録を追加する", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "この端末の記録を、このアカウントに追加する",
    })
    .check();
  await page
    .getByRole("button", { name: "この端末の記録を追加する", exact: true })
    .click();
  await expect
    .poll(() => backend.records.get(alice)?.state.attempts.length)
    .toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "同期済み" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "この端末でログアウト", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "ログインする", exact: true }),
  ).toBeVisible();
  await close(page);
  await expect(page.getByRole("button", { name: /^問題 1、/ })).toHaveCount(0);
  await account(page);
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("bob@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "ログインする", exact: true }).click();
  await expect(
    page.getByText("bob@example.test", { exact: true }),
  ).toBeVisible();
  await close(page);
  await expect(page.getByRole("button", { name: /^問題 1、/ })).toBeVisible();
  expect(backend.records.get(alice)?.state.attempts).toHaveLength(1);
  await context.close();
});

test("通信切断の記録は再読み込み後も残り、他端末との競合を確認してから解消する", async ({
  browser,
}) => {
  const backend = new Backend(),
    one = await contextFor(browser, backend),
    two = await contextFor(browser, backend);
  const a = await one.newPage(),
    b = await two.newPage();
  await login(a);
  await close(a);
  await login(b);
  await close(b);
  backend.offline.add(one);
  await grade(a, 1, "C");
  await a.reload();
  await expect(a.getByRole("button", { name: /^問題 1、/ })).toHaveCount(0);
  await grade(b, 2, "D");
  await expect
    .poll(() => backend.records.get(alice)?.state.attempts.length)
    .toBe(1);
  backend.offline.delete(one);
  await account(a);
  await a.evaluate(() => dispatchEvent(new Event("online")));
  await expect(
    a.getByRole("heading", { name: "両方の記録を確認" }),
  ).toBeVisible();
  await expect(
    a.getByRole("button", { name: "クラウドの記録を使う", exact: true }),
  ).toBeDisabled();
  const download = a.waitForEvent("download");
  await a
    .getByRole("button", { name: "この端末のバックアップを保存", exact: true })
    .click();
  await download;
  await a
    .getByRole("checkbox", {
      name: "選ばなかった側の内容が置き換わることを確認しました",
    })
    .check();
  await a
    .getByRole("button", { name: "クラウドの記録を使う", exact: true })
    .click();
  await expect(
    a.getByRole("heading", { name: "両方の記録を確認" }),
  ).toHaveCount(0);
  await close(a);
  await expect(a.getByRole("button", { name: /^問題 1、/ })).toBeVisible();
  await expect(a.getByRole("button", { name: /^問題 2、/ })).toHaveCount(0);
  await one.close();
  await two.close();
});

test("同期リクエスト中の追加入力も、応答後に取り残さず同期する", async ({
  browser,
}) => {
  const backend = new Backend(),
    context = await contextFor(browser, backend),
    page = await context.newPage();
  await login(page);
  await close(page);
  let release!: () => void;
  backend.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await grade(page, 1, "C");
  await grade(page, 2, "D");
  release();
  backend.hold = null;
  await expect
    .poll(() => backend.records.get(alice)?.state.attempts.length)
    .toBe(2);
  await context.close();
});

test("新規登録とパスワード再設定の案内を表示する", async ({ browser }) => {
  const backend = new Backend(),
    context = await contextFor(browser, backend),
    page = await context.newPage();
  await page.goto("/");
  await account(page);
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  await page
    .getByLabel("メールアドレス", { exact: true })
    .fill("alice@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("correct-password");
  await page
    .getByRole("button", { name: "アカウントを作成", exact: true })
    .click();
  await expect(
    page.getByText(
      "確認メールを送信しました。リンクを開いて登録を完了してください。",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "パスワードを忘れた場合", exact: true })
    .click();
  await page
    .getByRole("button", { name: "再設定メールを送る", exact: true })
    .click();
  await expect(
    page.getByText(
      "登録されている場合、パスワード再設定メールを送信しました。",
    ),
  ).toBeVisible();
  await context.close();
});

test("タイトルをカードで読み、スクロールで表示。一度表示したカードと動き停止を保つ", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const first = page.getByRole("button", { name: /^問題 1、/ });
  await expect(first.locator(".card-title")).toHaveText("多項式の加法・減法");
  const below = page.getByRole("button", { name: /^問題 60、/ });
  await expect(below).toHaveAttribute("data-reveal", "waiting");
  await below.scrollIntoViewIfNeeded();
  await expect(below).toHaveAttribute("data-reveal", "shown");
  await below.locator(".card-title").waitFor();
  await below.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)),
  );
  await page.screenshot({ path: testInfo.outputPath("title-reveal.png") });
  await first.scrollIntoViewIfNeeded();
  await expect(below).toHaveAttribute("data-reveal", "shown");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".study-desk")).toHaveClass(/still/);
  await expect(below).not.toHaveAttribute("data-reveal", "waiting");
});

test("設定を編集中に別端末が更新しても、古い入力で黙って上書きしない", async ({
  browser,
}) => {
  const backend = new Backend(),
    one = await contextFor(browser, backend),
    two = await contextFor(browser, backend);
  const a = await one.newPage(),
    b = await two.newPage();
  await login(a);
  await close(a);
  await login(b);
  await close(b);
  await a.getByRole("button", { name: "メニューを開く", exact: true }).click();
  await a.getByRole("button", { name: "学習の設定", exact: true }).click();
  await a
    .getByRole("spinbutton", { name: "1 日の新規候補数", exact: true })
    .fill("9");
  await grade(b, 1, "D");
  await expect
    .poll(() => backend.records.get(alice)?.state.attempts.length)
    .toBe(1);
  await a.evaluate(() => dispatchEvent(new Event("focus")));
  await a.getByRole("button", { name: "設定を保存", exact: true }).click();
  await a.getByRole("button", { name: "メニューに戻る", exact: true }).click();
  await a.getByRole("button", { name: "General", exact: true }).click();
  await a
    .getByRole("button", { name: "アカウントと同期", exact: true })
    .click();
  await expect(
    a.getByRole("heading", { name: "両方の記録を確認" }),
  ).toBeVisible();
  expect(backend.records.get(alice)?.state.settings.daily).toBe(3);
  expect(backend.records.get(alice)?.state.attempts).toHaveLength(1);
  await one.close();
  await two.close();
});
