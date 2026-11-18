"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

interface SignOutButtonProps {
  className?: string;
}

/**
 * Calls the sign-out server action and redirects to the home page.
 * In a future build: also clears in-memory vault keys from the crypto module.
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
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
