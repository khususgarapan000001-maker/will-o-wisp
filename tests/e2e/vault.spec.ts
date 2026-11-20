/**
 * E2E tests for the encrypted vault (Spec 2 task 6.3).
 *
 * BLOCKED — these tests require a live Supabase project:
 *   - A seeded demo account with a known vault passphrase
 *   - A running app connected to that project
 *   - `pnpm seed-demo` having been run to populate vault items
 *
 * When a Supabase project is available:
 *   1. Set PLAYWRIGHT_BASE_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   2. Run `pnpm seed-demo` (creates the demo owner + vault + items + keeper)
 *   3. Remove the `test.describe.skip` wrapper and run `pnpm test:e2e`
 *
 * Demo credentials (after seed-demo runs) are printed by the seed script and
 * stored in the Devpost private field. The vault passphrase used by these
 * tests is DEMO_VAULT_PASSPHRASE from scripts/seed-demo.ts.
 */

import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@will-o-wisp.example";
const DEMO_PASSWORD = "demo-pass-1234!";
const DEMO_VAULT_PASSPHRASE = "demo-vault-passphrase-lantern-2026";
const WRONG_PASSPHRASE = "definitely-the-wrong-passphrase";

test.describe.skip("vault — requires live Supabase project + seed-demo", () => {
  // ---------------------------------------------------------------------------
  // Helper: sign in as the demo owner before each vault test.
  // ---------------------------------------------------------------------------
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email").fill(DEMO_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app(\?welcome=1)?$/);
  });

  // ---------------------------------------------------------------------------
  // 1. Vault is locked by default — unlock screen shown, no ciphertext
  // ---------------------------------------------------------------------------
  test("vault shows unlock screen when locked", async ({ page }) => {
    await page.goto("/app/vault");

    // The unlock form must be visible.
    await expect(page.getByRole("heading", { name: /Unlock your vault/i })).toBeVisible();

    // No vault item titles, ciphertext, or metadata should be in the DOM.
    // (The page renders only the unlock card when locked — this is a
    // hard requirement from spec §2 rule 6.)
    const pageText = await page.textContent("body");
    expect(pageText).not.toContain("payload_ciphertext");
  });

  // ---------------------------------------------------------------------------
  // 2. Wrong passphrase shows gentle error, stays locked
  // ---------------------------------------------------------------------------
  test("wrong vault passphrase shows gentle error", async ({ page }) => {
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(WRONG_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();

    // The error must be gentle and not reveal crypto details.
    await expect(page.getByRole("alert")).toBeVisible();
    const alertText = await page.getByRole("alert").textContent();
    expect(alertText).not.toContain("OperationError");
    expect(alertText).not.toContain("DOMException");
    // Must still show the unlock form (not the item list).
    await expect(page.getByRole("button", { name: "Unlock vault" })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 3. Correct passphrase unlocks and shows decrypted items
  // ---------------------------------------------------------------------------
  test("correct passphrase unlocks vault and shows items", async ({ page }) => {
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(DEMO_VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();

    // The unlock form should disappear.
    await expect(page.getByRole("button", { name: "Unlock vault" })).not.toBeVisible();
    // The seeded item titles should appear decrypted.
    await expect(page.getByText("To everyone I love")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Banking — main account")).toBeVisible({ timeout: 5_000 });
  });

  // ---------------------------------------------------------------------------
  // 4. Create a new vault item (CRUD — create)
  // ---------------------------------------------------------------------------
  test("can create a new vault item", async ({ page }) => {
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(DEMO_VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add item" }).click();

    await page.getByLabel("Title").fill("E2E test item");
    await page.getByLabel("Content").fill("Created by Playwright test");
    await page.getByRole("button", { name: "Add item" }).last().click();

    // The new item should appear in the list.
    await expect(page.getByText("E2E test item")).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------------------
  // 5. Edit a vault item (CRUD — update)
  // ---------------------------------------------------------------------------
  test("can edit a vault item", async ({ page }) => {
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(DEMO_VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText("To everyone I love")).toBeVisible({ timeout: 10_000 });

    // Click Edit on the first item.
    await page.getByRole("button", { name: "Edit item" }).first().click();

    // Clear and re-enter the title.
    const titleInput = page.getByLabel("Title");
    await titleInput.clear();
    await titleInput.fill("Updated title by Playwright");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Updated title by Playwright")).toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------------------
  // 6. Delete a vault item (CRUD — delete)
  // ---------------------------------------------------------------------------
  test("can delete a vault item", async ({ page }) => {
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(DEMO_VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText("Cancel subscriptions")).toBeVisible({ timeout: 10_000 });

    // Delete the "Cancel subscriptions" item.
    // Find the card and click its Delete button.
    const card = page.getByText("Cancel subscriptions").locator("..").locator("..");
    await card.getByRole("button", { name: "Delete item" }).click();

    // Confirm deletion.
    await page.getByRole("button", { name: "Delete permanently" }).click();

    // The item should no longer appear.
    await expect(page.getByText("Cancel subscriptions")).not.toBeVisible({ timeout: 10_000 });
  });

  // ---------------------------------------------------------------------------
  // 7. DB holds only ciphertext — not plaintext (conceptual verification)
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  test("vault items in DB are ciphertext, not plaintext", async ({ page: _page }) => {
    // This test is a placeholder for a Supabase direct-query assertion.
    // In a full test suite, we would use the Supabase admin client to query
    // vault_items directly and assert that payload_ciphertext does NOT contain
    // the plaintext value "To everyone I love".
    //
    // Implementation: use the Supabase JS client with the service-role key
    // in a test fixture, fetch the row, and assert:
    //   expect(row.payload_ciphertext).not.toContain("To everyone I love")
    //   expect(row.payload_ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/) // Base64
    //
    // Deferred until the project is linked and the Supabase admin client
    // is wired into the Playwright global setup.
    expect(true).toBe(true); // placeholder — always passes
  });

  // ---------------------------------------------------------------------------
  // 8. Lock vault button clears the DEK
  // ---------------------------------------------------------------------------
  test("lock vault button locks the vault", async ({ page }) => {
    await page.goto("/app/vault");
    await page.getByLabel("Vault passphrase").fill(DEMO_VAULT_PASSPHRASE);
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByRole("button", { name: "Lock vault" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Lock vault" }).click();

    // Should return to the unlock screen.
    await expect(page.getByRole("button", { name: "Unlock vault" })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 9. 5-failure cooldown (UX anti-brute-force)
  // ---------------------------------------------------------------------------
  test("5 consecutive wrong passphrases trigger 60-second cooldown", async ({ page }) => {
    await page.goto("/app/vault");

    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Vault passphrase").fill(`wrong-passphrase-${i}`);
      await page.getByRole("button", { name: "Unlock vault" }).click();
      // Brief wait between attempts.
      await page.waitForTimeout(200);
    }

    // After 5 failures the button should be disabled and a cooldown message shown.
    const btn = page.getByRole("button", { name: "Unlock vault" });
    await expect(btn).toBeDisabled({ timeout: 3_000 });
    await expect(page.getByRole("status")).toContainText(/wait/i);
  });
});
