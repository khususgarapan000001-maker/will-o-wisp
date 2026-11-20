import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";

export function KeeperReleasedShell({
  releaseId,
  title,
  children,
}: {
  releaseId: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/keeper" className="text-sm tracking-[0.3em] text-primary/80 uppercase">
            WILL-O&apos;-WISP
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/keeper/release/${releaseId}`} className="text-sm text-muted-foreground hover:underline">
            Release
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-foreground">{title}</span>
        </div>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
    </div>
  );
}
