"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
import { signUpAction } from "@/lib/auth/actions";

const isConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://");

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isConfigured) {
    return <NotConfiguredNotice />;
  }

  if (needsConfirmation) {
    return <ConfirmationSent email={email} />;
  }

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    startTransition(async () => {
      const result = await signUpAction(email, password);
      if (result?.error) {
        setServerError(result.error);
      } else if (result?.needsConfirmation) {
        setNeedsConfirmation(true);
      }
      // On success + immediate session, the server action redirects to
      // /app/onboarding — no client-side navigation needed.
    });
  }

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Light your lantern</CardTitle>
          <CardDescription>Create your WILL-O&apos;-WISP account.</CardDescription>
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
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                disabled={isPending}
              />
              {fieldErrors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                disabled={isPending}
              />
              {fieldErrors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {fieldErrors.password}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
            </div>

            <Button type="submit" className="mt-2 w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}

function ConfirmationSent({ email }: { email: string }) {
  return (
    <AuthLayout>
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Check your inbox</CardTitle>
          <CardDescription>
            We sent a confirmation link to <strong>{email}</strong>. Open it to
            activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t get it? Check your spam folder, or{" "}
            <Link href="/auth/sign-up" className="text-primary underline-offset-4 hover:underline">
              try again
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

function NotConfiguredNotice() {
  return (
    <AuthLayout>
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
            to your <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> to enable sign-up.
          </CardDescription>
        </CardHeader>
      </Card>
    </AuthLayout>
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
