"use client";

import { useState } from "react";
import { WillItemRow } from "@/components/will/WillItemRow";
import type { EditableWillItem } from "@/components/will/WillItemForm";
import { CATEGORY_LABELS, NO_WISH_LABEL, WISHES, WISH_META, type WillItemData } from "@/lib/will/model";
import { groupByCategory, type WishFilter } from "@/lib/will/grouping";

interface Props {
  items: WillItemData[];
  ownerId: string;
  dek: CryptoKey | null;
  /** keeper id → name, for the transfer line. */
  keeperNames: Record<string, string>;
  onEdit: (item: EditableWillItem) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}

/** The owner's list, grouped by category, with a wish filter. */
export function WillChecklist({ items, ownerId, dek, keeperNames, onEdit, onDelete, onMove }: Props) {
  const [filter, setFilter] = useState<WishFilter>("all");
  const groups = groupByCategory(items, filter);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="will-filter" className="text-sm text-muted-foreground">
          Show
        </label>
        <select
          id="will-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as WishFilter)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="all">All accounts</option>
          <option value="unset">{NO_WISH_LABEL}</option>
          {WISHES.map((w) => (
            <option key={w} value={w}>
              {WISH_META[w].label}
            </option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No accounts match this filter.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.category} aria-label={CATEGORY_LABELS[g.category]}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {CATEGORY_LABELS[g.category]}
              </h2>
              <ul className="flex flex-col gap-3">
                {g.items.map((item, index) => (
                  <WillItemRow
                    key={item.id}
                    item={item}
                    ownerId={ownerId}
                    dek={dek}
                    transferName={item.transfer_to_keeper_id ? (keeperNames[item.transfer_to_keeper_id] ?? null) : null}
                    canMoveUp={index > 0}
                    canMoveDown={index < g.items.length - 1}
                    reorderEnabled={filter === "all"}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMove={onMove}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
