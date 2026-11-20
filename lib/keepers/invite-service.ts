/**
 * Owner-side invite operations (create + resend), run as the owner through RLS.
 * Server-only (token hashing uses node:crypto).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createMailerFromEnv, type Mailer } from "@/lib/heartbeat/mailer";
import { buildKeeperInviteEmail } from "@/lib/email/templates/keepers";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
  INVITE_TTL_DAYS,
} from "./token";
import type { InviteInput } from "./validation";

type Db = SupabaseClient<Database>;

export type InviteResult =
  | {
      ok: true;
      keeperId: string;
      emailSent: boolean;
      /** Only present when no email provider is configured (dev/demo): the owner can share it by hand. */
      devInviteLink?: string;
    }
  | { ok: false; reason: "duplicate" | "not_found" | "not_pending" | "db_error" };

async function deliver(
  supabase: Db,
  mailer: Mailer,
  args: { keeperId: string; ownerName: string; keeperName: string; email: string; url: string }
): Promise<boolean> {
  const result = await mailer.send(
    buildKeeperInviteEmail({
      to: args.email,
      keeperName: args.keeperName,
      ownerName: args.ownerName,
      inviteUrl: args.url,
      expiresInDays: INVITE_TTL_DAYS,
    })
  );
  const { error } = await supabase
    .from("keepers")
    .update({ invite_email_failed: !result.ok })
    .eq("id", args.keeperId);
  if (error) console.error("[keepers/invite] flag update failed:", error.message);
  return result.ok;
}

export async function createInvite(
  supabase: Db,
  owner: { id: string; displayName: string },
  input: InviteInput,
  appUrl: string,
  mailer: Mailer = createMailerFromEnv(process.env),
  now: Date = new Date()
): Promise<InviteResult> {
  const token = generateInviteToken();
  const { data, error } = await supabase
    .from("keepers")
    .insert({
      owner_id: owner.id,
      name: input.name,
      email: input.email,
      relationship: input.relationship,
      status: "invited",
      invite_token_hash: hashInviteToken(token),
      invite_expires_at: inviteExpiry(now).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    console.error("[keepers/invite] insert failed:", error.message);
    return { ok: false, reason: "db_error" };
  }

  const url = inviteUrl(appUrl, token);
  const emailSent = await deliver(supabase, mailer, {
    keeperId: data.id,
    ownerName: owner.displayName,
    keeperName: input.name,
    email: input.email,
    url,
  });
  return {
    ok: true,
    keeperId: data.id,
    emailSent,
    ...(mailer.provider === "log" ? { devInviteLink: url } : {}),
  };
}

/** Fresh token + expiry for a still-pending invite (also fixes a failed send). */
export async function resendInvite(
  supabase: Db,
  owner: { id: string; displayName: string },
  keeperId: string,
  appUrl: string,
  mailer: Mailer = createMailerFromEnv(process.env),
  now: Date = new Date()
): Promise<InviteResult> {
  const { data: keeper } = await supabase
    .from("keepers")
    .select("id, name, email, status")
    .eq("id", keeperId)
    .eq("owner_id", owner.id)
    .maybeSingle();
  if (!keeper) return { ok: false, reason: "not_found" };
  if (keeper.status !== "invited") return { ok: false, reason: "not_pending" };

  const token = generateInviteToken();
  const { error } = await supabase
    .from("keepers")
    .update({
      invite_token_hash: hashInviteToken(token),
      invite_expires_at: inviteExpiry(now).toISOString(),
    })
    .eq("id", keeper.id);
  if (error) {
    console.error("[keepers/resend] update failed:", error.message);
    return { ok: false, reason: "db_error" };
  }

  const url = inviteUrl(appUrl, token);
  const emailSent = await deliver(supabase, mailer, {
    keeperId: keeper.id,
    ownerName: owner.displayName,
    keeperName: keeper.name,
    email: keeper.email,
    url,
  });
  return {
    ok: true,
    keeperId: keeper.id,
    emailSent,
    ...(mailer.provider === "log" ? { devInviteLink: url } : {}),
  };
}
