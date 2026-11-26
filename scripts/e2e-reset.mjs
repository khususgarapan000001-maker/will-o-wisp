import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing env"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
const owner = list.users.find((u) => u.email === "demo@will-o-wisp.example");
if (!owner) { console.error("owner not found"); process.exit(1); }
const oid = owner.id;

for (const t of ["keeper_confirmations", "release_processes", "notifications", "letters", "will_items", "keepers", "checkins"]) {
  const col = t === "keeper_confirmations" ? "keeper_id" : "owner_id";
  // keeper_confirmations has no owner_id; delete via release ids first
  if (t === "keeper_confirmations") {
    const { data: rels } = await sb.from("release_processes").select("id").eq("owner_id", oid);
    for (const r of rels ?? []) await sb.from(t).delete().eq("release_id", r.id);
    console.log("cleared keeper_confirmations");
    continue;
  }
  const { error } = await sb.from(t).delete().eq(col, oid);
  console.log(`cleared ${t}`, error ? error.message : "ok");
}
const due = new Date(Date.now() + 7 * 86400_000).toISOString();
// RELEASED is terminal even for the service role (guard trigger), so the
// only way back is delete + fresh insert starting ALIVE.
await sb.from("heartbeat_settings").delete().eq("owner_id", oid);
const { error: hbErr } = await sb.from("heartbeat_settings").insert({
  owner_id: oid, cadence_days: 7, grace_days: 7, state: "ALIVE",
  next_checkin_due: due, state_changed_at: new Date().toISOString(),
});
console.log("heartbeat recreated", hbErr ? hbErr.message : "ok");
await sb.from("profiles").update({ demo_time_offset: "0 seconds", onboarding_completed_at: new Date().toISOString() }).eq("id", oid);
console.log("reset done: ALIVE, offset 0, keepers/letters/will/releases cleared (vault kept)");
