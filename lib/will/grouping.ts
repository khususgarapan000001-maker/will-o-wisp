/**
 * Pure helpers for the checklist: grouping by category, the wish filter,
 * counting accounts without a wish, and button reordering.
 */

import type { WillCategory, WillWish } from "@/lib/supabase/types";
import { CATEGORIES } from "./model";

export interface Groupable {
  id: string;
  category: WillCategory;
  wish: WillWish | null;
  sort_order: number;
}

/** "all" shows everything, "unset" shows accounts without a wish. */
export type WishFilter = "all" | "unset" | WillWish;

export function matchesFilter(item: Pick<Groupable, "wish">, filter: WishFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unset") return item.wish === null;
  return item.wish === filter;
}

/** Stable order: sort_order first, then the order the rows arrived in. */
export function sortItems<T extends Groupable>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.sort_order - b.item.sort_order || a.index - b.index)
    .map((x) => x.item);
}

export interface CategoryGroup<T> {
  category: WillCategory;
  items: T[];
}

/** Groups matching items by category, in the fixed category order; empty groups are left out. */
export function groupByCategory<T extends Groupable>(
  items: readonly T[],
  filter: WishFilter = "all"
): CategoryGroup<T>[] {
  const sorted = sortItems(items).filter((i) => matchesFilter(i, filter));
  const groups: CategoryGroup<T>[] = [];
  for (const category of CATEGORIES) {
    const inCategory = sorted.filter((i) => i.category === category);
    if (inCategory.length > 0) groups.push({ category, items: inCategory });
  }
  return groups;
}

export function countMissingWish(items: readonly Pick<Groupable, "wish">[]): number {
  return items.filter((i) => i.wish === null).length;
}

/**
 * New full order of ids after moving one item up or down among the items of its
 * OWN category. Items of other categories keep their positions. Returns the
 * original order when the move is not possible (already first/last, unknown id).
 */
export function moveWithinCategory<T extends Groupable>(
  items: readonly T[],
  id: string,
  direction: "up" | "down"
): string[] {
  const ordered = sortItems(items);
  const ids = ordered.map((i) => i.id);
  const me = ordered.find((i) => i.id === id);
  if (!me) return ids;
  const sameCategory = ordered.filter((i) => i.category === me.category);
  const pos = sameCategory.findIndex((i) => i.id === id);
  const neighbour = sameCategory[direction === "up" ? pos - 1 : pos + 1];
  if (!neighbour) return ids;
  const a = ids.indexOf(id);
  const b = ids.indexOf(neighbour.id);
  [ids[a], ids[b]] = [ids[b]!, ids[a]!];
  return ids;
}
