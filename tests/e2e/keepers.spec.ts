/**
 * E2E tests for keeper confirmation (Spec 4 task 6.3).
 *
 * SKIPPED — like the heartbeat/vault specs these need what this build
 * environment does not have:
 *   - the Spec 4 migrations (20261121090000 … 20261121090300) applied to the
 *     live Supabase project, on top of the Spec 1–3 migrations;
 *   - the seeded demo owner (`pnpm seed-demo`) and DEMO_MODE=true;
 *   - Supabase Auth with "Confirm email" OFF (otherwise keeper sign-up needs an
 *     inbox) and NO email provider configured, so /api/keepers/invite returns
 *     `devInviteLink` for the test to follow (with Resend configured, read the
 *     link from the test inbox instead).
 *
 * To run: set the env above, remove `.skip`, then `pnpm test:e2e`. The demo
 * owner starts each scenario ALIVE (check-in) and WITHOUT the seeded demo
 * keeper (revoke it first, or use a fresh demo account): the scenarios invite
 * two new keepers and need exactly those two to be accepted. RELEASED is
 * terminal, so re-seed between scenarios.
 *
 * Key detail: a keeper's private key lives in IndexedDB of the browser context
 * that accepted the invite, so each keeper uses its own browser context.
 */

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const OWNER_EMAIL = "demo@will-o-wisp.example";
const OWNER_PASSWORD = "demo-pass-1234!";
const VAULT_PASSPHRASE = "demo-vault-passphrase-lantern-2026";
const KEEPER_PASSWORD = "keeper-e2e-pass-1!";
const RUN = Date.now();
const KEEPER_1 = `keeper1+${RUN}@example.com`;
const KEEPER_2 = `keeper2+${RUN}@example.com`;
const ITEM_TITLE = `Letter for the keepers ${RUN}`;

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
  await expect(page.getByText(/would like you to be a keeper/i)).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByLabel("Password").fill(KEEPER_PASSWORD);
  await page.getByRole("button", { name: /Create account and accept/ }).click();
  await expect(page.getByText(/You're now a keeper/)).toBeVisible({ timeout: 15_000 });
  return context;
}

async function ownerPrepareVault(page: Page) {
  // Unlock once so the owner's browser wraps the DEK for both new keepers
  // (KeeperKeySync), then add an item visible to all keepers after release.
  await page.goto("/app/vault");
  await page.getByLabel("Vault passphrase").fill(VAULT_PASSPHRASE);
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await expect(page.getByText(/Access prepared for 2 keepers/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Title").fill(ITEM_TITLE);
  await page.getByLabel("Content").fill("Everything is in the blue folder.");
  await page.getByRole("button", { name: /save|add/i }).last().click();
  await expect(page.getByText(ITEM_TITLE)).toBeVisible();
}

async function advance(page: Page, label: "+1 day" | "+7 days" | "+14 days") {
  await page.goto("/app/heartbeat");
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByRole("status").filter({ hasText: "Time moved forward" })).toBeVisible();
}

/**
 * Brings the demo owner to "release pending" with two freshly accepted keepers
 * (and one vault item for all keepers). Returns the keeper browser contexts.
 */
async function releasePending(page: Page, browser: Browser) {
  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD, /\/app(\?welcome=1)?$/);
  await page.goto("/app");
  await page.getByRole("button", { name: "I'm here" }).click();

  // The dashboard warns until two keepers have accepted.
  await page.goto("/app/keepers");
  await expect(page.getByText("You need 2 keepers for the release to work.")).toBeVisible();

  const link1 = await invite(page, "Keeper One", KEEPER_1);
  const link2 = await invite(page, "Keeper Two", KEEPER_2);
  const k1 = await acceptInvite(browser, link1);
  const k2 = await acceptInvite(browser, link2);

  await page.goto("/app/keepers");
  await expect(page.getByText("Accepted")).toHaveCount(2);
  await expect(page.getByText("You need 2 keepers for the release to work.")).toHaveCount(0);
  await ownerPrepareVault(page);

  // Demo clock: ALIVE → OVERDUE → AWAITING_KEEPERS (release pending).
  await advance(page, "+7 days");
  await advance(page, "+1 day");
  await advance(page, "+7 days");
  await page.goto("/app");
  await expect(page.getByText("0 of 2 confirmations")).toBeVisible();
  return { k1, k2 };
}

async function openRelease(ctx: BrowserContext): Promise<Page> {
  const p = await ctx.newPage();
  await p.goto("/keeper");
  await p.getByRole("link", { name: /Demo Owner/ }).click();
  return p;
}

// RELEASED is terminal, so each scenario below needs a freshly seeded demo
// owner: run `pnpm seed-demo` between them (or run one with --grep).
test.describe.skip("keepers — requires live Supabase + Spec 4 migrations + seed-demo + DEMO_MODE", () => {
  test.describe.configure({ mode: "serial" });

  test("invite → accept → release pending → keeper 1 confirms → keeper 2 confirms → released; keeper reads the vault item; double decision blocked", async ({
    page,
    browser,
  }) => {
    const { k1, k2 } = await releasePending(page, browser);

    // Keeper 1 confirms: still waiting, owner sees 1 of 2.
    const p1 = await openRelease(k1);
    await p1.getByRole("button", { name: /Confirm — I can't reach them/ }).click();
    await expect(p1.getByText(/You've confirmed/)).toBeVisible();
    await page.reload();
    await expect(page.getByText("1 of 2 confirmations")).toBeVisible();

    // Double decision is blocked: buttons are gone and the API answers 409.
    await expect(p1.getByRole("button", { name: /Confirm — I can't reach them/ })).toHaveCount(0);
    const releaseId = p1.url().split("/").pop() as string;
    const again = await p1.request.post(`/api/releases/${releaseId}/decide`, {
      data: { decision: "confirm" },
    });
    expect(again.status()).toBe(409);

    // Keeper 2 confirms: released.
    const p2 = await openRelease(k2);
    await p2.getByRole("button", { name: /Confirm — I can't reach them/ }).click();
    await expect(p2.getByText(/The release was confirmed/).first()).toBeVisible();

    // The keeper reads the vault item, decrypted in their own browser.
    await p2.getByRole("link", { name: /Vault/ }).click();
    await expect(p2.getByText(ITEM_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect(p2.getByText("Everything is in the blue folder.")).toBeVisible();

    // Letters (Spec 5): this scenario wrote none, so the page says so plainly.
    // The letter flow itself is covered in letters.spec.ts.
    await p2.goBack();
    await p2.getByRole("link", { name: /Letters/ }).click();
    await expect(p2.getByText(/didn't leave a letter for you/)).toBeVisible();

    await k1.close();
    await k2.close();
  });

  test("false alarm cancels the release and returns the owner to ALIVE", async ({ page, browser }) => {
    const { k1, k2 } = await releasePending(page, browser);

    const p1 = await openRelease(k1);
    await p1.getByRole("button", { name: /False alarm/ }).click();
    await p1.getByLabel(/short note/i).fill("Spoke to her yesterday, she's travelling.");
    await p1.getByRole("button", { name: "Send the all-clear" }).click();
    await expect(p1.getByText(/false alarm/i).first()).toBeVisible();

    // The other keeper now sees a closed release, not buttons.
    const p2 = await openRelease(k2);
    await expect(p2.getByRole("button", { name: /Confirm — I can't reach them/ })).toHaveCount(0);
    await expect(p2.getByText(/false alarm/i).first()).toBeVisible();

    // The owner is back to ALIVE.
    await page.goto("/app");
    await expect(page.locator('svg[data-flame-state="ALIVE"]')).toBeVisible();

    await k1.close();
    await k2.close();
  });
});

test.describe("keepers — no credentials needed", () => {
  test("the invite API refuses anonymous callers", async ({ request }) => {
    const res = await request.post("/api/keepers/invite", {
      data: { name: "A", email: "a@example.com" },
    });
    expect(res.status()).toBe(401);
  });

  test("the decision API refuses anonymous callers", async ({ request }) => {
    const res = await request.post("/api/releases/00000000-0000-4000-8000-000000000000/decide", {
      data: { decision: "confirm" },
    });
    expect(res.status()).toBe(401);
  });

  test("a made-up invite link shows the friendly expired state, not an error", async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://"),
      "needs a configured Supabase project"
    );
    await page.goto(`/keeper/invite/${"a".repeat(43)}`);
    await expect(page.getByText(/invitation link has expired/i)).toBeVisible();
    await expect(page.getByText(/ask the person who invited you/i)).toBeVisible();
  });
});
