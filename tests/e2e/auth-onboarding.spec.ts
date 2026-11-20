/**
 * E2E tests for auth + onboarding (Spec 1 task 7.2).
 *
 * BLOCKED — these tests require a live Supabase project:
 *   - A real auth endpoint to sign up / sign in against
 *   - A seeded demo account with known credentials
 *   - Email delivery (or the magic-link token from Supabase's test helpers)
 *
 * When a Supabase project is available:
 *   1. Set PLAYWRIGHT_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   2. Run `pnpm db:types` and `pnpm seed-demo`
 *   3. Remove the `test.skip` wrapper below and run `pnpm test:e2e`
 *
 * Assumptions in test 1 verified statically (18 Nov 2026, Spec 2 review):
 *   - The "Your name" label exists in components/onboarding/StepA.tsx.
 *   - Email confirmation OFF is still UNVERIFIED — confirm in the Supabase
 *     project settings (Auth → providers → email) before un-skipping.
 */

import { test, expect } from "@playwright/test";

// All cases are wrapped in test.skip until a live Supabase project exists.
// The test file itself is valid TypeScript and the suite reports as skipped,
// keeping `pnpm test:e2e` green (exit 0).
test.describe.skip("auth + onboarding — requires live Supabase project", () => {
  // -------------------------------------------------------------------------
  // 1. Full sign-up → onboarding → dashboard flow
  // -------------------------------------------------------------------------
  test("new user: sign up → complete onboarding → reach dashboard", async ({ page }) => {
    const email = `test+${Date.now()}@example.com`;
    const password = "test-password-123";

    // Sign up
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    // Should arrive at onboarding step (a)
    await expect(page).toHaveURL("/app/onboarding");
    await expect(page.getByRole("heading", { name: /Tell us about yourself/i })).toBeVisible();

    // Step (a) — display name + timezone
    await page.getByLabel("Your name").fill("Test User");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step (b) — passphrase (skip for this flow)
    await expect(page.getByRole("heading", { name: /Secure your vault/i })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    // Step (c) — heartbeat settings (use defaults)
    await expect(page.getByRole("heading", { name: /Set your heartbeat/i })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step (d) — keepers (skip)
    await expect(page.getByRole("heading", { name: /Choose your keepers/i })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    // Step (e) — first letter (skip)
    await expect(page.getByRole("heading", { name: /Write your first letter/i })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();

    // Should reach dashboard
    await expect(page).toHaveURL(/\/app(\?welcome=1)?$/);
    await expect(page.getByRole("heading", { name: /Hello/i })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. Wrong-password error shows a gentle message
  // -------------------------------------------------------------------------
  test("sign in with wrong password shows gentle error", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    // The raw Supabase error must NOT appear.
    await expect(page.getByText("Invalid login credentials")).not.toBeVisible();
    // A gentle user-facing message must appear.
    await expect(
      page.getByRole("alert")
    ).toContainText(/didn.t match|try again/i);
  });

  // -------------------------------------------------------------------------
  // 3. Magic-link callback completes sign-in
  // -------------------------------------------------------------------------
  test("magic-link request shows confirmation, callback completes sign-in", async ({
    page,
  }) => {
    await page.goto("/auth/sign-in");
    await page.getByRole("button", { name: /magic link/i }).click();

    await page.getByLabel("Email").last().fill("demo@example.com");
    await page.getByRole("button", { name: "Send magic link" }).click();

    // The page should show the "check your inbox" state.
    await expect(page.getByRole("heading", { name: /Check your inbox/i })).toBeVisible();

    // Simulating the callback itself requires extracting the OTP link from the
    // Supabase email logs (available via the Supabase admin API in test mode).
    // That wiring is deferred until the project is linked and seed helpers exist.
  });

  // -------------------------------------------------------------------------
  // 4. Protected route redirects anonymous users to sign-in
  // -------------------------------------------------------------------------
  test("anonymous visitor visiting /app is redirected to sign-in", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
  });

  // -------------------------------------------------------------------------
  // 5. Refresh mid-wizard resumes at the correct step
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  test("refreshing mid-onboarding resumes at the correct step", async ({ page: _page }) => {
    // This test requires a signed-in session that has completed step (a) but
    // not step (c). Set up via seed script.
    // Deferred until seed-demo.ts is implemented and project is linked.
  });
});
