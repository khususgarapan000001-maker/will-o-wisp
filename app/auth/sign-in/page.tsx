"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInAction, requestMagicLinkAction } from "@/lib/auth/actions";

const isConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://");

export default function SignInPage() {
  return (
    <AuthLayout>
      {!isConfigured ? (
        <NotConfiguredNotice />
      ) : (
        <Suspense fallback={<div className="h-64 w-full max-w-sm animate-pulse rounded-xl bg-card" />}>
          <SignInForms />
        </Suspense>
      )}
    </AuthLayout>
  );
}

function SignInForms() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? undefined;
  const [mode, setMode] = useState<"password" | "magic-link">("password");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PasswordForm redirectTo={redirectTo} />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {mode === "magic-link" ? (
        <MagicLinkForm onBack={() => setMode("password")} />
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setMode("magic-link")}
        >
          Send me a magic link instead
        </Button>
      )}
    </div>
  );
}

function PasswordForm({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email) errors.email = "Email is required.";
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    startTransition(async () => {
      const result = await signInAction(email, password, redirectTo);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your account.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "signin-email-error" : undefined}
              disabled={isPending}
            />
            {fieldErrors.email && (
              <p id="signin-email-error" className="text-sm text-destructive">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "signin-password-error" : undefined}
              disabled={isPending}
            />
            {fieldErrors.password && (
              <p id="signin-password-error" className="text-sm text-destructive">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <Button type="submit" className="mt-2 w-full" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/auth/sign-up" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

function MagicLinkForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setServerError(null);

    if (!email) {
      setEmailError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    startTransition(async () => {
      const result = await requestMagicLinkAction(email);
      if (result.error) {
        setServerError(result.error);
      } else {
        setSent(true);
      }
    });
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Check your inbox</CardTitle>
          <CardDescription>
            We sent a magic link to <strong>{email}</strong>. Click it to sign
            in. It expires in 10 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="ghost" className="w-full" onClick={onBack}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Magic link</CardTitle>
        <CardDescription>
          We&apos;ll email you a one-click sign-in link.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {serverError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="magic-email">Email</Label>
            <Input
              id="magic-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "magic-email-error" : undefined}
              disabled={isPending}
            />
            {emailError && (
              <p id="magic-email-error" className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onBack} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? "Sending…" : "Send magic link"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function NotConfiguredNotice() {
  return (
    <Card className="w-full max-w-sm text-center">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Not configured yet</CardTitle>
        <CardDescription>
          Supabase environment variables are not set. Add{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to your{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>{" "}
          to enable sign-in.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-8 text-center">
        <p className="text-xs tracking-[0.3em] text-amber-500/80 uppercase">
          WILL-O&apos;-WISP
        </p>
      </Link>
      {children}
    </main>
  );
}
