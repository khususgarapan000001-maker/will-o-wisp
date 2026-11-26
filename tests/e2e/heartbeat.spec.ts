/**
 * E2E tests for heartbeat + grace period (Spec 3 task 8.3).
 *
 * SKIPPED — these need things this build environment does not have:
 *   - the three Spec 3 migrations applied to the live Supabase project
 *     (checkins, notifications, release_processes);
 *   - the seeded demo owner (`pnpm seed-demo`, needs SUPABASE_SERVICE_ROLE_KEY);
 *   - the app running with DEMO_MODE=true (and DEMO_ACCOUNT_EMAIL unset or equal
 *     to the demo email) so /api/demo/advance accepts the demo account.
 *
 * To run: set the env above, remove `.skip` below, then `pnpm test:e2e`.
 * Tests share one demo account and mutate its state, so they run serially and
 * each starts by checking in (which returns the account to ALIVE).
 *
 * Demo seed: cadence 7 days, grace 7 days.
 */

import { test, expect, type Page } from "@playwright/test";

const DEMO_EMAIL = "demo@will-o-wisp.example";
const DEMO_PASSWORD = "demo-pass-1234!";

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app(\?welcome=1)?$/);
}

async function checkIn(page: Page) {
  await page.goto("/app");
  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(page.getByRole("status").filter({ hasText: "lantern is bright" })).toBeVisible();
}

async function advance(page: Page, label: "+1 day" | "+7 days" | "+14 days") {
  await page.goto("/app/heartbeat");
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByRole("status").filter({ hasText: "Time moved forward" })).toBeVisible();
}

async function expectFlame(page: Page, state: string) {
  await page.goto("/app");
  await expect(page.locator(`svg[data-flame-state="${state}"]`)).toBeVisible();
}

test.describe("heartbeat — requires live Supabase + migrations + seed-demo + DEMO_MODE", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await checkIn(page); // back to ALIVE with a fresh due date
  });

  test("lifecycle via the demo clock: ALIVE → OVERDUE → AWAITING_KEEPERS", async ({ page }) => {
    await expectFlame(page, "ALIVE");

    await advance(page, "+7 days"); // exactly at the due instant: still ALIVE
    await advance(page, "+1 day"); // past due: OVERDUE (inside grace)
    await expectFlame(page, "OVERDUE");
    await page.goto("/app/heartbeat");
    await expect(page.getByText(/grace period/i).first()).toBeVisible();

    await advance(page, "+7 days"); // grace over
    await expectFlame(page, "AWAITING_KEEPERS");
    await page.goto("/app/heartbeat");
    await expect(page.getByText(/Two of them must agree/i)).toBeVisible();
  });

  test("check-in rescue while OVERDUE", async ({ page }) => {
    await advance(page, "+7 days");
    await advance(page, "+1 day");
    await expectFlame(page, "OVERDUE");

    await checkIn(page);
    await expectFlame(page, "ALIVE");
    await page.goto("/app/heartbeat");
    await expect(page.getByText("Steady")).toBeVisible();
  });

  test("check-in rescue while AWAITING_KEEPERS", async ({ page }) => {
    await advance(page, "+14 days");
    await advance(page, "+1 day");
    await expectFlame(page, "AWAITING_KEEPERS");

    await checkIn(page);
    await expectFlame(page, "ALIVE");
    await page.goto("/app/heartbeat");
    await expect(page.getByText("Steady")).toBeVisible();
  });

  test("settings: changing cadence updates the next due date", async ({ page }) => {
    await page.goto("/app/heartbeat");
    await page.getByLabel("Check in every").selectOption("30");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();
  });
});

test.describe("heartbeat — no credentials needed", () => {
  test("the check-in API refuses anonymous callers", async ({ request }) => {
    const res = await request.post("/api/checkin", { data: { method: "button" } });
    expect(res.status()).toBe(401);
  });

  test("the demo clock API refuses to set an offset when DEMO_MODE is off", async ({ request }) => {
    test.skip(process.env.DEMO_MODE === "true", "only meaningful with DEMO_MODE off");
    const res = await request.post("/api/demo/advance", { data: { days: 7 } });
    expect(res.status()).toBe(403);
  });
});
