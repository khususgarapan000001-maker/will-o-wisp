import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { deriveOnboardingState } from "@/lib/onboarding/state";
import { OnboardingWizard } from "./OnboardingWizard";

/**
 * Onboarding page — server component.
 *
 * Loads the user's profile and heartbeat_settings, derives which step they
 * should resume from, and passes the initial state to the client wizard.
 */
export default async function OnboardingPage() {
  const user = await getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const supabase = await createClient();

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  // If onboarding is already complete, send to dashboard.
  if (profile?.onboarding_completed_at) {
    redirect("/app");
  }

  // Check whether heartbeat settings row exists.
  const { data: heartbeatSettings } = await supabase
    .from("heartbeat_settings")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  const { currentStep } = deriveOnboardingState({
    onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
    hasHeartbeatSettings: heartbeatSettings !== null,
    // Vault check: always false until Spec 2 (encrypted-vault) is integrated.
    hasVault: false,
  });

  return (
    <OnboardingWizard
      initialStep={currentStep}
      initialDisplayName={profile?.display_name ?? ""}
      initialTimezone={profile?.timezone ?? "Asia/Jakarta"}
    />
  );
}
