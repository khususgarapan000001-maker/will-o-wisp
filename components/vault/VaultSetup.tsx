"use client";

import { useRouter } from "next/navigation";
import { StepB } from "@/components/onboarding/StepB";

/**
 * In-place vault creation for users who skipped onboarding step (b).
 *
 * Reuses StepB's passphrase form + real crypto flow (PBKDF2 → DEK → AES-KW).
 * The vault page cannot link these users to /app/onboarding — completed users
 * bounce back to /app from there — so the vault is created here instead.
 *
 * On success, refreshes the server components: the vault page then finds the
 * vault row and renders VaultClient, which opens unlocked (createVault leaves
 * the DEK in memory).
 */
export function VaultSetup() {
  const router = useRouter();

  return (
    <StepB
      onComplete={() => router.refresh()}
      onSkip={() => router.push("/app")}
    />
  );
}
