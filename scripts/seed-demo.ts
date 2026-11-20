/**
 * scripts/seed-demo.ts — Demo account seeder
 *
 * Creates a complete demo account so judges can experience a full
 * ALIVE → OVERDUE → AWAITING_KEEPERS → RELEASED flow in ~3 minutes using
 * the demo clock (profiles.demo_time_offset).
 *
 * Design-doc §6.4: keys are generated in the same session so judges can
 * complete a release in one browser — no second device or email needed.
 *
 * HOW TO RUN (after a Supabase project is linked):
 *   pnpm seed-demo
 *
 * BLOCKED until a live Supabase project exists — do NOT run now.
 *
 * What this script creates:
 *   • Demo owner account  (demo@will-o-wisp.example / demo-pass-1234!)
 *   • profiles row        (display_name "Demo Owner", demo_time_offset set)
 *   • heartbeat_settings  (cadence_days 1, grace_days 1 — fast demo clock)
 *   • vaults row          (salt + wrapped_dek derived from KNOWN demo passphrase)
 *   • 3 vault_items       (message, credential_pointer, instruction)
 *   • TWO demo keeper accounts (keeper@ and keeper2@will-o-wisp.example),
 *     because a release needs 2 confirmations
 *   • keepers rows        (status accepted, public_key set)
 *   • vaults.wrapped_dek_for_keepers updated with both keeper-wrapped DEKs
 *   • 3 letters           (2 final — one AI-assisted — and 1 draft)
 *
 * Security note: the demo passphrase is published in Devpost's private field.
 * Never use the demo passphrase or keys for a real account.
 */

// ---------------------------------------------------------------------------
// This file is intentionally NOT compiled by tsc as part of the app —
// it runs standalone with Node 24's native TypeScript type stripping
// (`pnpm seed-demo`). Keep it to erasable TypeScript only: no enums,
// namespaces, or parameter properties.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

// ---------------------------------------------------------------------------
// WebCrypto helpers (Node 24 provides globalThis.crypto natively)
// ---------------------------------------------------------------------------

const SUBTLE = globalThis.crypto.subtle;

function bufToBase64(buf: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const arrayBuf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(arrayBuf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function strToBytes(s: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(s);
  const buf = new ArrayBuffer(encoded.byteLength);
  const out = new Uint8Array(buf);
  out.set(encoded);
  return out;
}

function concatBytes(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(a.byteLength + b.byteLength);
  const out = new Uint8Array(buf);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(n);
  const bytes = new Uint8Array(buf);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// ---------------------------------------------------------------------------
// Crypto helpers (mirrors lib/crypto/ — duplicated here to run standalone)
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 600_000;
const HKDF_INFO = strToBytes("will-o-wisp-vault-dek-wrap-v1");

async function deriveKek(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const keyMaterial = await SUBTLE.importKey("raw", strToBytes(passphrase), "PBKDF2", false, ["deriveKey"]);
  return SUBTLE.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

async function generateDek(): Promise<CryptoKey> {
  return SUBTLE.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const wrapped = await SUBTLE.wrapKey("raw", dek, kek, { name: "AES-KW" });
  return bufToBase64(wrapped);
}

async function encryptItem(
  dek: CryptoKey,
  ownerId: string,
  itemId: string,
  plaintext: string
): Promise<{ ciphertext: string; iv: string }> {
  const ivBuf = new ArrayBuffer(12);
  const iv = new Uint8Array(ivBuf);
  globalThis.crypto.getRandomValues(iv);
  const aad = concatBytes(strToBytes(ownerId), strToBytes(itemId));
  const ciphertextBuf = await SUBTLE.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    dek,
    strToBytes(plaintext)
  );
  return { ciphertext: bufToBase64(ciphertextBuf), iv: bufToBase64(iv) };
}

async function wrapDekForKeeper(
  dek: CryptoKey,
  keeperId: string,
  keeperPublicKeyB64: string
): Promise<{ keeper_id: string; wrapped_dek: string; ephemeral_public_key: string; kdf_salt: string }> {
  const keeperPubKey = await SUBTLE.importKey(
    "spki", base64ToBuf(keeperPublicKeyB64),
    { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const ephemeral = await SUBTLE.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const ephemeralPubSpki = await SUBTLE.exportKey("spki", ephemeral.publicKey);
  const hkdfSalt = randomBytes(32);
  const sharedBits = await SUBTLE.deriveBits(
    { name: "ECDH", public: keeperPubKey }, ephemeral.privateKey, 256
  );
  const hkdfKeyMaterial = await SUBTLE.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrappingKey = await SUBTLE.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: hkdfSalt, info: HKDF_INFO },
    hkdfKeyMaterial,
    { name: "AES-KW", length: 256 }, false, ["wrapKey"]
  );
  const wrappedDek = await SUBTLE.wrapKey("raw", dek, wrappingKey, { name: "AES-KW" });
  return {
    keeper_id: keeperId,
    wrapped_dek: bufToBase64(wrappedDek),
    ephemeral_public_key: bufToBase64(ephemeralPubSpki),
    kdf_salt: bufToBase64(hkdfSalt),
  };
}

// ---------------------------------------------------------------------------
// Demo constants
// ---------------------------------------------------------------------------

const DEMO_OWNER_EMAIL = "demo@will-o-wisp.example";
const DEMO_OWNER_PASSWORD = "demo-pass-1234!";
const DEMO_VAULT_PASSPHRASE = "demo-vault-passphrase-lantern-2026";
const DEMO_KEEPER_EMAIL = "keeper@will-o-wisp.example";
const DEMO_KEEPER_PASSWORD = "keeper-pass-5678!";
const DEMO_KEEPER2_EMAIL = "keeper2@will-o-wisp.example";
const DEMO_KEEPER2_PASSWORD = "keeper-pass-9012!";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
      "Copy .env.example to .env.local and fill in real values."
    );
    process.exit(1);
  }

  // Use the service-role key for admin operations (bypasses RLS for seeding).
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("🌿 Seeding demo account…");

  // -------------------------------------------------------------------------
  // 1. Create demo owner auth account
  // -------------------------------------------------------------------------
  const { error: ownerAuthError } =
    await supabase.auth.admin.createUser({
      email: DEMO_OWNER_EMAIL,
      password: DEMO_OWNER_PASSWORD,
      email_confirm: true,
    });

  if (ownerAuthError && !ownerAuthError.message.includes("already been registered")) {
    throw new Error(`Owner auth create failed: ${ownerAuthError.message}`);
  }

  // Fetch the user if already existed.
  // ownerAuthData.user is only set on creation; resolve by listing if needed.
  const ownerId = (await (async () => {
    const { data } = await supabase.auth.admin.listUsers();
    return data.users.find((u) => u.email === DEMO_OWNER_EMAIL)?.id;
  })());

  if (!ownerId) throw new Error("Could not resolve owner user ID");
  console.log(`  ✓ Owner account: ${DEMO_OWNER_EMAIL} (${ownerId})`);

  // -------------------------------------------------------------------------
  // 2. Update profile (demo_time_offset lets the demo clock run fast)
  // -------------------------------------------------------------------------
  await supabase.from("profiles").upsert({
    id: ownerId,
    display_name: "Demo Owner",
    timezone: "Asia/Jakarta",
    // demo_time_offset: start at 0; the demo UI advances it.
    demo_time_offset: "0 seconds",
  });
  console.log("  ✓ Profile updated");

  // -------------------------------------------------------------------------
  // 3. Create heartbeat_settings with 1-day cadence for fast demo
  // -------------------------------------------------------------------------
  const nextCheckinDue = new Date();
  nextCheckinDue.setDate(nextCheckinDue.getDate() + 1);
  await supabase.from("heartbeat_settings").upsert(
    {
      owner_id: ownerId,
      cadence_days: 7,    // smallest valid value; demo clock handles the rest
      grace_days: 7,
      next_checkin_due: nextCheckinDue.toISOString(),
      state: "ALIVE",
      state_changed_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );
  console.log("  ✓ Heartbeat settings created");

  // -------------------------------------------------------------------------
  // 4. Create vault (crypto all in this session — same session, one browser)
  // -------------------------------------------------------------------------
  const salt = randomBytes(32);
  const dek = await generateDek();
  const kek = await deriveKek(DEMO_VAULT_PASSPHRASE, salt);
  const wrappedDek = await wrapDek(dek, kek);

  const { data: vaultData, error: vaultError } = await supabase
    .from("vaults")
    .upsert(
      {
        owner_id: ownerId,
        salt: bufToBase64(salt),
        wrapped_dek: wrappedDek,
        wrapped_dek_for_keepers: [],
        recovery_hint: "Think of a lantern in the dark.",
      },
      { onConflict: "owner_id" }
    )
    .select("id")
    .single();

  if (vaultError) throw new Error(`Vault create failed: ${vaultError.message}`);
  const vaultId = vaultData.id;
  console.log(`  ✓ Vault created (${vaultId})`);

  // -------------------------------------------------------------------------
  // 5. Create vault items (encrypted with the demo DEK)
  // -------------------------------------------------------------------------
  const items: { id: string; kind: string; payload: { title: string; body: string } }[] = [
    {
      id: globalThis.crypto.randomUUID(),
      kind: "message",
      payload: {
        title: "To everyone I love",
        body: "If you are reading this, the lantern has gone dark. I want you to know that every moment with you was a gift. Please take care of each other.",
      },
    },
    {
      id: globalThis.crypto.randomUUID(),
      kind: "credential_pointer",
      payload: {
        title: "Banking — main account",
        body: "Login details are in the black leather notebook in the top desk drawer. The notebook key is on my keychain (the small brass key).",
      },
    },
    {
      id: globalThis.crypto.randomUUID(),
      kind: "instruction",
      payload: {
        title: "Cancel subscriptions",
        body: "Netflix, Spotify, and iCloud are charged to the Visa ending 4242. Contact each service's support to cancel. The login emails are in the notebook above.",
      },
    },
  ];

  for (const item of items) {
    const plaintext = JSON.stringify(item.payload);
    const enc = await encryptItem(dek, ownerId, item.id, plaintext);
    await supabase.from("vault_items").upsert({
      id: item.id,
      vault_id: vaultId,
      kind: item.kind,
      payload_ciphertext: enc.ciphertext,
      iv: enc.iv,
      sort_order: items.indexOf(item),
    });
  }
  console.log(`  ✓ ${items.length} vault items created`);

  // -------------------------------------------------------------------------
  // 6–9. Two demo keepers (a release needs 2 confirmations, requirement 17).
  //    Each gets an auth account, an ECDH key pair (same session — demo mode:
  //    in production the keeper's browser generates it and the private key
  //    NEVER leaves their device), an accepted `keepers` row, and a wrapped DEK.
  // -------------------------------------------------------------------------
  async function seedKeeper(
    email: string,
    password: string,
    name: string
  ): Promise<{ keeperId: string; publicKeyB64: string; privateKeyB64: string }> {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError && !authError.message.includes("already been registered")) {
      throw new Error(`Keeper auth create failed (${email}): ${authError.message}`);
    }
    // keepers.auth_user_id (Spec 4) links the keeper row to their login.
    let authUserId: string | null = authData?.user?.id ?? null;
    if (!authUserId) {
      const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      authUserId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    }
    if (!authUserId) throw new Error(`Could not resolve the auth user id for ${email}`);

    const pair = await SUBTLE.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]
    );
    const publicKeyB64 = bufToBase64(await SUBTLE.exportKey("spki", pair.publicKey));
    const privateKeyB64 = bufToBase64(await SUBTLE.exportKey("pkcs8", pair.privateKey));

    // Re-running the seed reuses the existing keeper row (one live keeper per
    // owner + email), so letters keep pointing at a valid recipient.
    const { data: existing } = await supabase
      .from("keepers")
      .select("id")
      .eq("owner_id", ownerId as string)
      .ilike("email", email)
      .in("status", ["invited", "accepted"])
      .maybeSingle();
    const keeperId = existing?.id ?? globalThis.crypto.randomUUID();
    await supabase.from("keepers" as never).upsert({
      id: keeperId,
      owner_id: ownerId,
      name,
      email,
      relationship: "trusted person",
      status: "accepted",
      auth_user_id: authUserId,
      public_key: publicKeyB64,
    } as never);
    console.log(`  ✓ Keeper: ${name} <${email}> (${keeperId})`);
    return { keeperId, publicKeyB64, privateKeyB64 };
  }

  const keeperOne = await seedKeeper(DEMO_KEEPER_EMAIL, DEMO_KEEPER_PASSWORD, "Demo Keeper");
  const keeperTwo = await seedKeeper(DEMO_KEEPER2_EMAIL, DEMO_KEEPER2_PASSWORD, "Demo Keeper Two");

  const wrappedForKeepers = [];
  for (const k of [keeperOne, keeperTwo]) {
    const wrapped = await wrapDekForKeeper(dek, k.keeperId, k.publicKeyB64);
    // Same shape KeeperKeySync writes: remembers which key the DEK was wrapped for.
    (wrapped as Record<string, string>).keeper_public_key = k.publicKeyB64;
    wrappedForKeepers.push(wrapped);
  }
  await supabase
    .from("vaults")
    .update({ wrapped_dek_for_keepers: wrappedForKeepers })
    .eq("id", vaultId);
  console.log("  ✓ DEK wrapped for both keepers and stored");

  // -------------------------------------------------------------------------
  // 9b. Last letters (Spec 5): 2 final + 1 draft. Each letter is ONE JSON
  //     payload {subject, body} under ONE fresh IV (never two ciphertexts under
  //     one IV). One final letter is `ai_assisted` so the badge is demoable.
  //     Only the FINAL letters are delivered on release; the draft never is.
  // -------------------------------------------------------------------------
  // Start clean so re-running the seed does not pile up letters.
  await supabase.from("letters").delete().eq("owner_id", ownerId as string);

  const letters: {
    recipient: string;
    status: "draft" | "final";
    aiAssisted: boolean;
    subject: string;
    body: string;
  }[] = [
    {
      recipient: keeperOne.keeperId,
      status: "final",
      aiAssisted: false,
      subject: "For when you're ready",
      body:
        "If you are reading this, I'm sorry I couldn't tell you in person.\n\n" +
        "Thank you for every Sunday morning, every silly argument and every time you stayed on the phone a little longer than you had to. " +
        "Please be gentle with yourself. The lantern is yours to carry now.",
    },
    {
      recipient: keeperTwo.keeperId,
      status: "final",
      aiAssisted: true,
      subject: "Where to find things",
      body:
        "A few practical things, so you don't have to hunt for them.\n\n" +
        "The black notebook in my desk drawer has the details for my accounts. " +
        "The little brass key on my keychain opens it. Please don't worry about getting everything right; just do what feels kind.",
    },
    {
      recipient: keeperOne.keeperId,
      status: "draft",
      aiAssisted: false,
      subject: "Still thinking about this one",
      body: "(Unfinished.) I want to say something about the garden, but I'm not sure how yet.",
    },
  ];
  for (const l of letters) {
    const letterId = globalThis.crypto.randomUUID();
    const enc = await encryptItem(
      dek,
      ownerId as string,
      letterId,
      JSON.stringify({ subject: l.subject, body: l.body })
    );
    const { error: letterError } = await supabase.from("letters").insert({
      id: letterId,
      owner_id: ownerId as string,
      vault_id: vaultId,
      recipient_keeper_id: l.recipient,
      payload_ciphertext: enc.ciphertext,
      iv: enc.iv,
      ai_assisted: l.aiAssisted,
      status: l.status,
    });
    if (letterError) throw new Error(`Letter create failed: ${letterError.message}`);
  }
  console.log("  ✓ 3 letters created (2 final, 1 draft; 1 AI-assisted)");

  // -------------------------------------------------------------------------
  // 10. Output demo credentials (for Devpost private field)
  // -------------------------------------------------------------------------
  console.log("\n━━━ Demo credentials (add to Devpost private field) ━━━");
  console.log(`  Owner email:        ${DEMO_OWNER_EMAIL}`);
  console.log(`  Owner password:     ${DEMO_OWNER_PASSWORD}`);
  console.log(`  Vault passphrase:   ${DEMO_VAULT_PASSPHRASE}`);
  console.log(`  Keeper 1 email:     ${DEMO_KEEPER_EMAIL}`);
  console.log(`  Keeper 1 password:  ${DEMO_KEEPER_PASSWORD}`);
  console.log(`  Keeper 1 private key: ${keeperOne.privateKeyB64.slice(0, 32)}… (store securely)`);
  console.log(`  Keeper 2 email:     ${DEMO_KEEPER2_EMAIL}`);
  console.log(`  Keeper 2 password:  ${DEMO_KEEPER2_PASSWORD}`);
  console.log(`  Keeper 2 private key: ${keeperTwo.privateKeyB64.slice(0, 32)}… (store securely)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("✅ Demo seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
