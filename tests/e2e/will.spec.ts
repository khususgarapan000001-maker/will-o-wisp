/**
 * E2E tests for the digital will checklist (Spec 6, task 5.2).
 *
 * SKIPPED — like the heartbeat/vault/keepers/letters specs these need what this
 * build environment does not have:
 *   - ALL migrations applied to the live Supabase project, including the Spec 6
 *     pair (20261121110000_will_items.sql, 20261121110100_will_delivery.sql) on
 *     top of the Spec 1–5 migrations;
 *   - the seeded demo owner (`pnpm seed-demo`) and DEMO_MODE=true with
 *     DEMO_ACCOUNT_EMAIL = the demo owner (only that account may advance the
 *     demo clock);
 *   - Supabase Auth with "Confirm email" OFF (otherwise keeper sign-up needs an
 *     inbox) and NO email provider configured, so /api/keepers/invite returns
 *     `devInviteLink` for the test to follow.
 *
 * To run: set the env above, remove `.skip`, then `pnpm test:e2e`. The demo
 * owner starts ALIVE and WITHOUT the seeded keepers/will items (revoke them, or
 * use a fresh demo account): the scenario invites three new keepers and writes
 * its own checklist. RELEASED is terminal, so re-seed before re-running.
 *
 * Each keeper uses its own browser context: a keeper's private key lives in the
 * IndexedDB of the context that accepted the invitation.
 *
 * Scenario (one release, three keepers):
 *   - owner adds, edits and deletes an account; sets a transfer wish
 *   - Mail  → transfer to keeper 1 (with an encrypted note)
 *   - Bank  → transfer to keeper 3, who is removed BEFORE the release
 *   - Blog  → no wish yet (the dashboard prompts for it)
 *   keepers 1 and 2 confirm → released.
 *   - keeper 1 sees all three accounts, Mail highlighted, note decrypted
 *   - keeper 2 sees the same list with nothing highlighted
 *   - Bank carries the "Keeper no longer available" flag
 *   - the owner can no longer add or change anything
 */

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const OWNER_EMAIL = "demo@will-o-wisp.example";
const OWNER_PASSWORD = "demo-pass-1234!";
const VAULT_PASSPHRASE = "demo-vault-passphrase-lantern-2026";
const KEEPER_PASSWORD = "keeper-e2e-pass-1!";
const RUN = Date.now();
const KEEPERS = [1, 2, 3].map((n) => ({
  name: `Will Keeper ${n}`,
  email: `wkeeper${n}+${RUN}@example.com`,
}));
const MAIL = `Mail ${RUN}`;
const BANK = `Bank ${RUN}`;
const BLOG = `Blog ${RUN}`;
const GONE = `Scratch ${RUN}`;
const NOTE = "The recovery phone is in the desk drawer.";

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

async function addAccount(
  page: Page,
  args: { name: string; wish?: RegExp; keeper?: string; note?: string }
) {
  await page.getByRole("button", { name: /Add (an account|your first account)/ }).first().click();
  await page.getByLabel("Account or service").fill(args.name);
  if (args.wish) await page.getByLabel(args.wish).check();
  if (args.keeper) await page.getByLabel("Transfer to").selectOption({ label: args.keeper });
  if (args.note) await page.getByLabel(/Private note/).fill(args.note);
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText(args.name)).toBeVisible();
}

async function advance(page: Page, label: "+1 day" | "+7 days" | "+14 days") {
  await page.goto("/app/heartbeat");
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByRole("status").filter({ hasText: "Time moved forward" })).toBeVisible();
}

test.describe.skip("will — requires live Supabase + Spec 6 migrations + seed-demo + DEMO_MODE", () => {
  test.describe.configure({ mode: "serial" });

  test("add / edit / delete → transfer wish → release → keepers see the checklist, transfers highlighted, revoked target flagged", async ({
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
    // accepted keeper (KeeperKeySync); then open the will and unlock for notes.
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText(/Access prepared for 3 keepers/)).toBeVisible({ timeout: 20_000 });

    await page.goto("/app/will");
    await expect(page.getByText(/not a legal will/)).toBeVisible();
    await page.getByText(/Unlock your vault to read or write private notes/).click();
    await page.getByLabel("Vault passphrase").fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();

    // Add, edit, delete.
    await addAccount(page, { name: GONE, wish: /Ignore/ });
    const row = page.getByTestId("will-item").filter({ hasText: GONE });
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel(/Delete\./).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByTestId("will-item").filter({ hasText: GONE }).getByText("Delete")).toBeVisible();
    await page.getByTestId("will-item").filter({ hasText: GONE }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Remove permanently" }).click();
    await expect(page.getByText(GONE)).toHaveCount(0);

    // The checklist for the release.
    await addAccount(page, { name: MAIL, wish: /Transfer\./, keeper: KEEPERS[0]!.name, note: NOTE });
    await addAccount(page, { name: BANK, wish: /Transfer\./, keeper: KEEPERS[2]!.name });
    await addAccount(page, { name: BLOG });
    await expect(page.getByTestId("will-item").filter({ hasText: BLOG }).getByText("No wish yet")).toBeVisible();

    // Dashboard prompt for the account without a wish.
    await page.goto("/app");
    await expect(page.getByText(/no wish yet/)).toBeVisible();

    // Keeper 3 is removed BEFORE the release: Bank stays, flagged for the keepers.
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

    // Keeper 1: full list, Mail highlighted, note decrypted locally.
    const p1 = await c1.newPage();
    await p1.goto("/keeper");
    await p1.getByRole("link", { name: /Demo Owner/ }).click();
    await p1.getByRole("link", { name: /Will/ }).click();
    await expect(p1.getByText(MAIL)).toBeVisible({ timeout: 15_000 });
    await expect(p1.getByText(BANK)).toBeVisible();
    await expect(p1.getByText(BLOG)).toBeVisible();
    await expect(p1.getByTestId("keeper-will-item").filter({ hasText: MAIL })).toHaveAttribute("data-mine", "true");
    await expect(p1.getByTestId("keeper-will-item").filter({ hasText: BANK })).not.toHaveAttribute("data-mine", "true");
    await expect(p1.getByText(NOTE)).toBeVisible({ timeout: 15_000 });
    // Revoked transfer target is flagged, not hidden.
    await expect(
      p1.getByTestId("keeper-will-item").filter({ hasText: BANK }).getByText("Keeper no longer available")
    ).toBeVisible();

    // Keeper 2: same list, nothing highlighted.
    const p2 = await c2.newPage();
    await p2.goto("/keeper");
    await p2.getByRole("link", { name: /Demo Owner/ }).click();
    await p2.getByRole("link", { name: /Will/ }).click();
    await expect(p2.getByText(MAIL)).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('[data-mine="true"]')).toHaveCount(0);

    // Owner: the will is sealed.
    await page.goto("/app/will");
    await page.getByRole("button", { name: "Add an account" }).click();
    await page.getByLabel("Account or service").fill(`Late ${RUN}`);
    await page.getByRole("button", { name: "Save account" }).click();
    await expect(page.getByText(/already been passed on/)).toBeVisible();

    for (const c of contexts) await c.close();
  });
});

test.describe("will — no credentials needed", () => {
  test("the will API refuses anonymous callers", async ({ request }) => {
    expect((await request.get("/api/will")).status()).toBe(401);
    expect(
      (await request.post("/api/will", { data: { id: "x", serviceName: "x", category: "other" } })).status()
    ).toBe(401);
    expect((await request.post("/api/will/reorder", { data: { ids: [] } })).status()).toBe(401);
    expect((await request.delete("/api/will/11111111-1111-4111-8111-111111111111")).status()).toBe(401);
  });

  test("the owner will page sends anonymous visitors to sign in", async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://"),
      "needs a configured Supabase project"
    );
    await page.goto("/app/will");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });
});
