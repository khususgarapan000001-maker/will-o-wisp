import type { HeartbeatState } from "@/lib/heartbeat/state-machine";

/**
 * The lantern flame, keyed to the heartbeat state (pure SVG + CSS, so the first
 * paint needs no JavaScript). Animations are declared in globals.css and are
 * switched off under `prefers-reduced-motion`.
 *
 *   ALIVE            bright, steady
 *   OVERDUE          flickering
 *   AWAITING_KEEPERS guttering (low, unsteady)
 *   RELEASED         shared flames: several small teal wisps
 */
const LABELS: Record<HeartbeatState, string> = {
  ALIVE: "Your lantern is burning brightly",
  OVERDUE: "Your lantern is flickering",
  AWAITING_KEEPERS: "Your lantern is guttering",
  RELEASED: "Your light has been shared",
};

const FLAME_PATH = "M32 6 C40 20 52 30 52 46 C52 58 43 66 32 66 C21 66 12 58 12 46 C12 30 24 20 32 6 Z";
const INNER_PATH = "M32 30 C37 38 43 44 43 52 C43 59 38 63 32 63 C26 63 21 59 21 52 C21 44 27 38 32 30 Z";

export function LanternFlame({
  state,
  className,
}: {
  state: HeartbeatState;
  className?: string;
}) {
  if (state === "RELEASED") {
    return (
      <svg
        role="img"
        aria-label={LABELS.RELEASED}
        viewBox="0 0 160 90"
        className={className ?? "h-28 w-44"}
        data-flame-state={state}
      >
        {[
          { x: 30, s: 0.5, d: "0s" },
          { x: 80, s: 0.75, d: "0.4s" },
          { x: 130, s: 0.5, d: "0.8s" },
        ].map((f) => (
          <g
            key={f.x}
            transform={`translate(${f.x - 32 * f.s} ${86 - 66 * f.s}) scale(${f.s})`}
            className="wow-flame wow-flame-shared"
            style={{ animationDelay: f.d }}
          >
            <path d={FLAME_PATH} fill="#5eead4" fillOpacity="0.55" />
            <path d={INNER_PATH} fill="#ccfbf1" fillOpacity="0.9" />
          </g>
        ))}
      </svg>
    );
  }

  const palette = {
    ALIVE: { outer: "#f59e0b", inner: "#fde68a", glow: "rgba(245,158,11,0.45)", scale: 1 },
    OVERDUE: { outer: "#ea580c", inner: "#fdba74", glow: "rgba(234,88,12,0.35)", scale: 0.92 },
    AWAITING_KEEPERS: { outer: "#c2410c", inner: "#fb923c", glow: "rgba(194,65,12,0.25)", scale: 0.6 },
  }[state];
  const animation = {
    ALIVE: "wow-flame-steady",
    OVERDUE: "wow-flame-flicker",
    AWAITING_KEEPERS: "wow-flame-gutter",
  }[state];

  return (
    <svg
      role="img"
      aria-label={LABELS[state]}
      viewBox="0 0 64 72"
      className={className ?? "h-28 w-24"}
      data-flame-state={state}
      style={{ filter: `drop-shadow(0 0 18px ${palette.glow})` }}
    >
      <g
        className={`wow-flame ${animation}`}
        style={{ transformOrigin: "32px 66px", transform: `scale(${palette.scale})` }}
      >
        <path d={FLAME_PATH} fill={palette.outer} fillOpacity="0.85" />
        <path d={INNER_PATH} fill={palette.inner} />
      </g>
    </svg>
  );
}
