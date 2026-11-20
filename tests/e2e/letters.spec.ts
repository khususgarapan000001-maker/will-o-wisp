/**
 * E2E tests for last letters (Spec 5, task 5.2).
 *
 * SKIPPED — like the heartbeat/vault/keepers specs these need what this build
 * environment does not have:
 *   - ALL migrations applied to the live Supabase project, including the Spec 5
 *     pair (20261121100000_letters.sql, 20261121100100_letters_delivery.sql) on
 *     top of the Spec 1–4 migrations;
 *   - the seeded demo owner (`pnpm seed-demo`) and DEMO_MODE=true with
 *     DEMO_ACCOUNT_EMAIL = the demo owner (only that account may advance the
 *     demo clock);
 *   - Supabase Auth with "Confirm email" OFF (otherwise keeper sign-up needs an
 *     inbox) and NO email provider configured, so /api/keepers/invite returns
 *     `devInviteLink` for the test to follow.
 *
 * To run: set the env above, remove `.skip`, then `pnpm test:e2e`. The demo
 * owner starts ALIVE and WITHOUT the seeded keepers/letters (revoke them, or
 * use a fresh demo account): the scenario invites three new keepers and writes
 * its own letters. RELEASED is terminal, so re-seed before re-running.
 *
 * Each keeper uses its own browser context: a keeper's private key lives in the
 * IndexedDB of the context that accepted the invitation.
 *
 * Scenario (one release, three keepers):
 *   - letter A (final)  → keeper 1   delivered, keeper 1 reads it
 *   - letter B (draft)  → keeper 1   NOT delivered
 *   - letter C (final)  → keeper 3, who is removed before the release
 *                                    NOT delivered
 *   keeper 2 confirms alongside keeper 1 to complete the 2-of-2 release.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const OWNER_EMAIL = "demo@will-o-wisp.example";
const OWNER_PASSWORD = "demo-pass-1234!";
const VAULT_PASSPHRASE = "demo-vault-passphrase-lantern-2026";
const KEEPER_PASSWORD = "keeper-e2e-pass-1!";
const RUN = Date.now();
const KEEPERS = [1, 2, 3].map((n) => ({
  name: `Letter Keeper ${n}`,
  email: `lkeeper${n}+${RUN}@example.com`,
}));
const SUBJECT_A = `For when you're ready ${RUN}`;
const BODY_A = "Thank you for every Sunday morning.";
const SUBJECT_B = `Unfinished thought ${RUN}`;
const SUBJECT_C = `Letter to a removed keeper ${RUN}`;

async function signIn(page: Page, email: string, password: string, expectUrl: RegExp) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectUrl);
}

async function invite(page: Page, name: string, email: string): Promise<string> {
  const res = await page.request.post("/api/keepers/invite", {
    data: { name, email, relationship: "friend" },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { devInviteLink?: string };
  expect(body.devInviteLink, "no email provider => devInviteLink").toBeTruthy();
  return body.devInviteLink as string;
}

async function acceptInvite(browser: Browser, link: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByLabel("Password").fill(KEEPER_PASSWORD);
  await page.getByRole("button", { name: /Create account and accept/ }).click();
  await expect(page.getByText(/You're now a keeper/)).toBeVisible({ timeout: 15_000 });
  return context;
}

async function writeLetter(
  page: Page,
  args: { to: string; subject: string; body: string; final: boolean }
) {
  await page.getByRole("button", { name: /Write (a|your first) letter/ }).first().click();
  await page.getByLabel("For").selectOption({ label: args.to });
  await page.getByLabel("Subject").fill(args.subject);
  await page.getByLabel("Your letter").fill(args.body);
  // New letters default to a draft; "Ready to deliver" is an explicit choice.
  if (args.final) await page.getByLabel(/Ready to deliver/).check();
  await page.getByRole("button", { name: "Save letter" }).click();
  await expect(page.getByText(args.subject)).toBeVisible();
}

async function advance(page: Page, label: "+1 day" | "+7 days" | "+14 days") {
  await page.goto("/app/heartbeat");
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByRole("status").filter({ hasText: "Time moved forward" })).toBeVisible();
}

test.describe.skip("letters — requires live Supabase + Spec 5 migrations + seed-demo + DEMO_MODE", () => {
  test.describe.configure({ mode: "serial" });

  test("write → mark final → release → keeper reads; draft and removed-keeper letters are NOT delivered", async ({
    page,
    browser,
  }) => {
    await signIn(page, OWNER_EMAIL, OWNER_PASSWORD, /\/app(\?welcome=1)?$/);
    await page.goto("/app");
    await page.getByRole("button", { name: "I'm here" }).click();

    const contexts: BrowserContext[] = [];
    for (const k of KEEPERS) {
      contexts.push(await acceptInvite(browser, await invite(page, k.name, k.email)));
    }
    const [c1, c2] = contexts as [BrowserContext, BrowserContext, BrowserContext];

    // Unlock once on /app/vault so the owner's browser wraps the DEK for every
    // accepted keeper (KeeperKeySync), then write the letters.
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText(/Access prepared for 3 keepers/)).toBeVisible({ timeout: 20_000 });

    await page.goto("/app/letters");
    await page.getByLabel("Vault passphrase").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await writeLetter(page, { to: KEEPERS[0]!.name, subject: SUBJECT_A, body: BODY_A, final: true });
    await writeLetter(page, { to: KEEPERS[0]!.name, subject: SUBJECT_B, body: "Not ready.", final: false });
    await writeLetter(page, { to: KEEPERS[2]!.name, subject: SUBJECT_C, body: "For keeper three.", final: true });
    await expect(page.getByText("Draft")).toHaveCount(1);

    // Keeper 3 is removed BEFORE the release: their letter must not be delivered.
    await page.goto("/app/keepers");
    await page
      .getByRole("listitem")
      .filter({ hasText: KEEPERS[2]!.name })
      .getByRole("button", { name: "Remove keeper" })
      .click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    // Demo clock: ALIVE → OVERDUE → AWAITING_KEEPERS.
    await advance(page, "+7 days");
    await advance(page, "+1 day");
    await advance(page, "+7 days");
    await page.goto("/app");
    await expect(page.getByText("0 of 2 confirmations")).toBeVisible();

    // Two keepers confirm → released.
    for (const ctx of [c1, c2]) {
      const p = await ctx.newPage();
      await p.goto("/keeper");
      await p.getByRole("link", { name: /Demo Owner/ }).click();
      await p.getByRole("button", { name: /Confirm — I can't reach them/ }).click();
      await p.close();
    }

    // Keeper 1 reads letter A, rendered as the paper letter, decrypted locally.
    const p1 = await c1.newPage();
    await p1.goto("/keeper");
    await p1.getByRole("link", { name: /Demo Owner/ }).click();
    await p1.getByRole("link", { name: /Letters/ }).click();
    await expect(p1.getByRole("heading", { name: SUBJECT_A })).toBeVisible({ timeout: 15_000 });
    await expect(p1.getByText(BODY_A)).toBeVisible();
    // The draft was never delivered.
    await expect(p1.getByText(SUBJECT_B)).toHaveCount(0);

    // Keeper 2 had no letters.
    const p2 = await c2.newPage();
    await p2.goto("/keeper");
    await p2.getByRole("link", { name: /Demo Owner/ }).click();
    await p2.getByRole("link", { name: /Letters/ }).click();
    await expect(p2.getByText(/didn't leave a letter for you/)).toBeVisible();

    // Owner side: A shows "Delivered" and is locked; the draft and C are not delivered.
    await page.goto("/app/letters");
    await page.getByLabel("Vault passphrase").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText("Delivered")).toHaveCount(1);
    await expect(page.getByText(/already been delivered and read/)).toBeVisible();

    for (const c of contexts) await c.close();
  });
});

test.describe("letters — no credentials needed", () => {
  test("the letters API refuses anonymous callers", async ({ request }) => {
    expect((await request.get("/api/letters")).status()).toBe(401);
    expect(
      (
        await request.post("/api/letters", {
          data: { id: "x", recipientKeeperId: "x", payloadCiphertext: "x", iv: "x", status: "draft" },
        })
      ).status()
    ).toBe(401);
  });

  test("the owner letters page sends anonymous visitors to sign in", async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://"),
      "needs a configured Supabase project"
    );
    await page.goto("/app/letters");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
