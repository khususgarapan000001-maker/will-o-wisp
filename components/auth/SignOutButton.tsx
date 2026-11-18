"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { lockVault } from "@/lib/crypto/session";

interface SignOutButtonProps {
  className?: string;
}

/**
 * Clears the in-memory vault DEK, then calls the sign-out server action.
 * The key clearing must happen here (client component) — the server action
 * cannot reach browser memory.
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    // Clear vault key material from memory BEFORE signing out (Spec 2 req §2.5).
    lockVault();
    startTransition(async () => {
      await signOutAction();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      disabled={isPending}
      className={className}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
