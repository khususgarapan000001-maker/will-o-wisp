import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/keepers/token";
import { InviteResponse } from "@/components/keepers/InviteResponse";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Public invite landing page. The URL token is the credential: it is hashed here
 * and resolved through the SECURITY DEFINER function get_keeper_invite (there is
 * no public SELECT policy on keepers).
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = looksLikeInviteToken(token) ? await resolve(token) : null;

  if (!invite || invite.expired) {
    return (
      <Shell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-xl">This invitation link has expired</CardTitle>
            <CardDescription>
              It may be older than 7 days, or you may already have answered it. Please ask the
              person who invited you to send a new invitation.
            </CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const user = await getUser();
  const signedInAsInvitee =
    user !== null && (user.email ?? "").toLowerCase() === invite.keeper_email.toLowerCase();

  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            {invite.owner_name} would like you to be a keeper
          </CardTitle>
          <CardDescription>Hello {invite.keeper_name}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="space-y-2 text-sm text-foreground">
            <p>
              A keeper is someone {invite.owner_name} trusts. There&apos;s nothing to do day to day.
            </p>
            <p>
              If {invite.owner_name} stops checking in, we&apos;ll ask you and one other keeper
              whether you can reach them. Only if you both say you can&apos;t will you be able to
              read what they left for you. Any keeper can say it&apos;s a false alarm, and nothing
              is shared.
            </p>
            <p className="text-muted-foreground">
              What they left stays encrypted. Your key is created on this device and never leaves
              it.
            </p>
          </div>
          <InviteResponse
            token={token}
            keeperId={invite.keeper_id}
            keeperEmail={invite.keeper_email}
            ownerName={invite.owner_name}
            signedInAsInvitee={signedInAsInvitee}
          />
        </CardContent>
      </Card>
    </Shell>
  );
}

async function resolve(token: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_keeper_invite", {
    p_token_hash: hashInviteToken(token),
  });
  if (error) {
    console.error("[keeper/invite] lookup failed:", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
          WILL-O&apos;-WISP
        </Link>
      </header>
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-10">{children}</main>
    </div>
  );
}
