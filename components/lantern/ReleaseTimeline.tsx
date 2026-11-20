import { describeRelease, type ReleaseStateName } from "@/lib/keepers/release-status";

interface ReleaseTimelineProps {
  state: ReleaseStateName;
  received: number;
  required: number;
  /** Owner view only: how many keepers have accepted. */
  acceptedKeepers?: number;
}

/**
 * Release progress: confirmations received / required. Used on the owner
 * dashboard and on the keeper release page. Server-renderable (no state).
 */
export function ReleaseTimeline({ state, received, required, acceptedKeepers }: ReleaseTimelineProps) {
  const status = describeRelease({ state, received, required, acceptedKeepers });
  const steps = Array.from({ length: required }, (_, i) => i < received);
  const open = state === "awaiting_keepers";

  return (
    <section
      aria-label="Release progress"
      className="rounded-xl border border-border bg-card p-4"
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Release</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{status.headline}</p>
      {open && (
        <ol
          className="mt-3 flex items-center gap-2"
          aria-label={`${received} of ${required} keepers have confirmed`}
        >
          {steps.map((done, i) => (
            <li
              key={i}
              className={
                done
                  ? "h-3 w-12 rounded-full bg-primary"
                  : "h-3 w-12 rounded-full border border-border bg-background"
              }
            />
          ))}
        </ol>
      )}
      <p className="mt-3 text-sm text-muted-foreground">{status.detail}</p>
    </section>
  );
}
