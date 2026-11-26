/**
 * E2E for Echo (Spec 7, task 4.2).
 *
 * SKIPPED like the other live specs: it needs the migrations applied to a live
 * Supabase project, the seeded demo owner with an accepted keeper, and a
 * server started with OPENROUTER_API_KEY set to any non-placeholder value. The
 * provider is mocked at the network edge with page.route on /api/echo/draft,
 * so no real LLM call is made.
 *
 * To run: set the env above, remove `.skip`, then `pnpm test:e2e`.
 */
import { test, expect } from "@playwright/test";

const OWNER_EMAIL = "demo@will-o-wisp.example";
const OWNER_PASSWORD = "demo-pass-1234!";
const VAULT_PASSPHRASE = "demo-vault-passphrase-lantern-2026";

test.describe("Echo drafting", () => {
  test("draft -> save -> letter is marked AI-assisted", async ({ page }) => {
    await page.route("**/api/echo/draft", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { available: true } });
      return route.fulfill({ json: { draft: "Dear friend,\n\nThank you for the garden.", truncated: false } });
    });

    await page.goto("/auth/sign-in");
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app(\?welcome=1)?$/, { timeout: 30_000 });
    await page.goto("/app/letters");
    await page.getByLabel(/passphrase/i).fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: /unlock/i }).click();

    await page.getByRole("button", { name: /write a letter/i }).click();
    await page.getByLabel("Subject").fill("Echo e2e");
    await page.getByRole("button", { name: "Help me draft" }).click();
    await page.getByRole("button", { name: /I understand, continue/i }).click();
    await page.getByLabel(/A few notes for/).fill("thank them for the garden");
    await page.getByRole("button", { name: "Draft", exact: true }).click();

    await expect(page.getByLabel("Your letter")).toHaveValue(/Thank you for the garden/);
    // Editing afterwards must not clear the flag.
    await page.getByLabel("Your letter").fill("Dear friend, thank you.");
    await page.getByRole("button", { name: /save letter/i }).click();
    await expect(page.getByText("AI-assisted").first()).toBeVisible();
    // Keeper side: after release the badge "Drafted with AI assistance from the
    // owner's notes" renders in the keeper letters view (covered by the letters spec).
  });

  test("without a configured key Echo says so", async ({ page }) => {
    await page.route("**/api/echo/draft", (route) => route.fulfill({ json: { available: false } }));
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app(\?welcome=1)?$/, { timeout: 30_000 });
    await page.goto("/app/letters");
    await page.getByLabel(/passphrase/i).fill(VAULT_PASSPHRASE);
    await page.getByRole("button", { name: /unlock/i }).click();
    await page.getByRole("button", { name: /write a letter/i }).click();
    await page.getByRole("button", { name: "Help me draft" }).click();
    await expect(page.getByText("AI drafting isn't configured yet")).toBeVisible();
  });
});
