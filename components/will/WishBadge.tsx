import type { WillWish } from "@/lib/supabase/types";
import { NO_WISH_LABEL, WISH_META } from "@/lib/will/model";

/** A wish as icon + label (requirement 5). Shared by the owner's and the keeper's checklist. */
export function WishBadge({ wish }: { wish: WillWish | null }) {
  if (wish === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
        <span aria-hidden="true">·</span>
        {NO_WISH_LABEL}
      </span>
    );
  }
  const meta = WISH_META[wish];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
