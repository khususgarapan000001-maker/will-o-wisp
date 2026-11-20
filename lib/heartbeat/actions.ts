"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { updateCadenceAndGrace } from "./service";
import { validateCadenceGrace } from "./validation";

export interface UpdateSettingsResult {
  error?: string;
  saved?: boolean;
}

export async function updateHeartbeatSettingsAction(
  cadenceDays: number,
  graceDays: number
): Promise<UpdateSettingsResult> {
  const user = await getUser();
  if (!user) return { error: "Please sign in again to change your settings." };

  const valid = validateCadenceGrace(cadenceDays, graceDays);
  if (!valid.ok) return { error: valid.error };

  const supabase = await createClient();
  const result = await updateCadenceAndGrace(supabase, user.id, cadenceDays, graceDays);
  if (!result.ok) {
    return { error: "We couldn't save that just now. Please try again in a moment." };
  }
  revalidatePath("/app/heartbeat");
  revalidatePath("/app");
  return { saved: true };
}
