/**
 * Property-based tests for the digital-will checklist (Spec 6): grouping,
 * filtering and button reordering over random item lists, against independent
 * naive models. ≥100 iterations locally, ≥1,000 in CI (same as the other PBTs).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CATEGORIES, WISHES } from "@/lib/will/model";
import {
  countMissingWish,
  groupByCategory,
  matchesFilter,
  moveWithinCategory,
  type Groupable,
  type WishFilter,
} from "@/lib/will/grouping";
import { checkWillDraft } from "@/lib/will/validation";

const NUM_RUNS = process.env.CI ? 1000 : 200;

const itemsArb: fc.Arbitrary<Groupable[]> = fc
  .array(
    fc.record({
      category: fc.constantFrom(...CATEGORIES),
      wish: fc.option(fc.constantFrom(...WISHES), { nil: null }),
      sort_order: fc.integer({ min: 0, max: 20 }),
    }),
    { maxLength: 30 }
  )
  .map((rows) => rows.map((r, i) => ({ id: `id-${i}`, ...r })));

const filterArb: fc.Arbitrary<WishFilter> = fc.constantFrom<WishFilter>("all", "unset", ...WISHES);

describe("will grouping (PBT)", () => {
  it("every matching item appears exactly once, in a group of its own category", () => {
    fc.assert(
      fc.property(itemsArb, filterArb, (items, filter) => {
        const groups = groupByCategory(items, filter);
        const out = groups.flatMap((g) => g.items.map((i) => i.id));
        const expected = items.filter((i) => matchesFilter(i, filter)).map((i) => i.id);
        expect([...out].sort()).toEqual([...expected].sort());
        for (const g of groups) for (const i of g.items) expect(i.category).toBe(g.category);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("groups follow the fixed category order, are never empty, and are sorted by sort_order", () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const groups = groupByCategory(items);
        const order = groups.map((g) => CATEGORIES.indexOf(g.category));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(new Set(order).size).toBe(order.length);
        for (const g of groups) {
          expect(g.items.length).toBeGreaterThan(0);
          const so = g.items.map((i) => i.sort_order);
          expect(so).toEqual([...so].sort((a, b) => a - b));
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("the 'unset' filter returns exactly countMissingWish items", () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const n = groupByCategory(items, "unset").reduce((acc, g) => acc + g.items.length, 0);
        expect(n).toBe(countMissingWish(items));
        expect(n).toBe(items.filter((i) => i.wish === null).length);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("moving an item is a permutation that changes only two positions and keeps categories apart", () => {
    fc.assert(
      fc.property(itemsArb, fc.nat(), fc.constantFrom("up" as const, "down" as const), (items, pick, dir) => {
        fc.pre(items.length > 0);
        const target = items[pick % items.length]!;
        const before = groupByCategory(items).flatMap((g) => g.items.map((i) => i.id));
        const ids = moveWithinCategory(items, target.id, dir);
        // Same set of ids as the sorted list.
        const sortedIds = [...items]
          .map((item, index) => ({ item, index }))
          .sort((a, b) => a.item.sort_order - b.item.sort_order || a.index - b.index)
          .map((x) => x.item.id);
        expect([...ids].sort()).toEqual([...sortedIds].sort());
        // At most two positions differ from the starting order.
        const changed = ids.filter((id, i) => id !== sortedIds[i]).length;
        expect(changed === 0 || changed === 2).toBe(true);
        expect(before.length).toBe(ids.length);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("moving an item up and then down restores the order (when the first move was possible)", () => {
    fc.assert(
      fc.property(itemsArb, fc.nat(), (items, pick) => {
        fc.pre(items.length > 0);
        const target = items[pick % items.length]!;
        const sortedIds = moveWithinCategory(items, "__none__", "up"); // unknown id: the plain sorted order
        const up = moveWithinCategory(items, target.id, "up");
        fc.pre(up.join() !== sortedIds.join());
        // Re-number as the API does (sort_order = position) before the second move.
        const renumbered = up.map((id, i) => ({ ...items.find((x) => x.id === id)!, sort_order: i }));
        expect(moveWithinCategory(renumbered, target.id, "down")).toEqual(sortedIds);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

describe("transfer-requires-keeper (PBT)", () => {
  it("a draft is valid exactly when a keeper is present iff the wish is transfer", () => {
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom(...WISHES), { nil: null }),
        fc.option(fc.uuid(), { nil: null }),
        (wish, keeper) => {
          const ok = checkWillDraft({
            serviceName: "Gmail",
            category: "email",
            wish,
            transferKeeperId: keeper,
            notes: "",
          }).ok;
          expect(ok).toBe((wish === "transfer") === (keeper !== null));
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
