"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Landing page for the check-in link in reminder emails. The check-in is
 * recorded by a POST from the browser (not by a GET), so email link scanners
 * that prefetch the URL cannot check someone in by accident.
 */
export default function CheckInLandingPage() {
  const started = useRef(false);
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "magic_link" }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("done");
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "We couldn't record that just now.");
          setStatus("error");
        }
      })
      .catch(() => {
        setError("We couldn't reach the server. Please try again.");
        setStatus("error");
      });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-3xl text-foreground">
        {status === "done" ? "Thank you." : status === "error" ? "Not quite." : "One moment…"}
      </h1>
      <p role={status === "error" ? "alert" : "status"} className="text-muted-foreground">
        {status === "done"
          ? "Your lantern is bright again. Your next check-in date has been updated."
          : status === "error"
            ? error
            : "Letting your lantern know you're here."}
      </p>
      <Link href="/app" className="text-primary underline-offset-4 hover:underline">
        Go to your lantern
      </Link>
    </main>
  );
}
