"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/get-user";
import {
  validateStepA,
  validateStepC,
  type CadenceDays,
  type GraceDays,
} from "./validation";

// ---------------------------------------------------------------------------
// Step (a) — save display name + timezone
// ---------------------------------------------------------------------------

export interface StepAResult {
  error?: string;
  fieldErrors?: { displayName?: string; timezone?: string };
}

export async function saveStepA(
  displayName: string,
  timezone: string
): Promise<StepAResult> {
  const user = await getUser();
  if (!user) {
    return { error: "You must be signed in to continue." };
  }

  const { valid, errors } = validateStepA({ displayName, timezone });
  if (!valid) {
    return { fieldErrors: errors };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim(), timezone })
      .eq("id", user.id);

    if (error) {
      console.error("[onboarding/step-a] Supabase error:", error.message);
      return { error: "Could not save your details. Please try again." };
    }

    return {};
  } catch (err) {
    console.error("[onboarding/step-a] unexpected error:", err);
    return { error: "Could not save your details. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Step (c) — save heartbeat cadence + grace period
// ---------------------------------------------------------------------------

export interface StepCResult {
  error?: string;
  fieldErrors?: { cadenceDays?: string; graceDays?: string };
}

export async function saveStepC(
  cadenceDays: number,
  graceDays: number
): Promise<StepCResult> {
  const user = await getUser();
  if (!user) {
    return { error: "You must be signed in to continue." };
  }

  const { valid, errors } = validateStepC({ cadenceDays, graceDays });
  if (!valid) {
    return { fieldErrors: errors };
  }

  const nextCheckinDue = new Date();
  nextCheckinDue.setDate(nextCheckinDue.getDate() + cadenceDays);

  try {
    const supabase = await createClient();

    // Upsert: if the row already exists (e.g. user edits settings),
    // update it. The unique constraint on owner_id handles conflicts.
    // NOTE: resetting state to ALIVE is correct during onboarding (first
    // creation), but Spec 3's settings edit must NOT reset the state
    // machine when the user changes cadence/grace later.
    const { error } = await supabase.from("heartbeat_settings").upsert(
      {
        owner_id: user.id,
        cadence_days: cadenceDays as CadenceDays,
        grace_days: graceDays as GraceDays,
        next_checkin_due: nextCheckinDue.toISOString(),
        state: "ALIVE",
        state_changed_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    );

    if (error) {
      console.error("[onboarding/step-c] Supabase error:", error.message);
      return { error: "Could not save your heartbeat settings. Please try again." };
    }

    return {};
  } catch (err) {
    console.error("[onboarding/step-c] unexpected error:", err);
    return { error: "Could not save your heartbeat settings. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Completion — set onboarding_completed_at and redirect to dashboard
// ---------------------------------------------------------------------------

export async function completeOnboardingAction(
  destination: "dashboard" | "letters" = "dashboard"
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) {
    return { error: "You must be signed in to continue." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      console.error("[onboarding/complete] Supabase error:", error.message);
      return { error: "Could not complete onboarding. Please try again." };
    }
  } catch (err) {
    console.error("[onboarding/complete] unexpected error:", err);
    return { error: "Could not complete onboarding. Please try again." };
  }

  // Whitelisted destinations only: never redirect to a caller-supplied path.
  redirect(destination === "letters" ? "/app/letters" : "/app");
}
