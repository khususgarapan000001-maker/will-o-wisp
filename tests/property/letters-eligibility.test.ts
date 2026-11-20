/**
 * Property-based tests for letter delivery eligibility (Spec 5). Random letter
 * and keeper states are run through the pure rule that mirrors
 * deliver_letters_on_release(), against an independent, deliberately naive
 * model. ≥100 iterations locally, ≥1,000 in CI (same as the heartbeat PBT).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  isLetterDeliverable,
  selectDeliverableLetters,
  type EligibilityKeeper,
  type EligibilityLetter,
} from "@/lib/letters/eligibility";

const NUM_RUNS = process.env.CI ? 1000 : 200;
const KEEPER_IDS = ["k1", "k2", "k3"] as const;

const keeperArb: fc.Arbitrary<EligibilityKeeper[]> = fc
  .tuple(...KEEPER_IDS.map(() => fc.constantFrom("invited", "accepted", "declined", "revoked" as const)))
  .map((statuses) => KEEPER_IDS.map((id, i) => ({ id, status: statuses[i] as EligibilityKeeper["status"] })));

const letterArb: fc.Arbitrary<EligibilityLetter> = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom("draft", "final" as const),
  recipientKeeperId: fc.constantFrom(...KEEPER_IDS, "ghost"),
  deliveredAt: fc.option(fc.constant("2026-01-01T00:00:00Z"), { nil: null }),
});

describe("letter delivery eligibility (PBT)", () => {
  it("a draft is NEVER delivered, whatever the keepers look like", () => {
    fc.assert(
      fc.property(fc.array(letterArb, { maxLength: 30 }), keeperArb, (letters, keepers) => {
        const drafts = letters.map((l) => ({ ...l, status: "draft" as const }));
        expect(selectDeliverableLetters(drafts, keepers)).toEqual([]);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("nothing goes to a keeper who is not accepted, and nothing is delivered twice", () => {
    fc.assert(
      fc.property(fc.array(letterArb, { maxLength: 30 }), keeperArb, (letters, keepers) => {
        const accepted = new Set(keepers.filter((k) => k.status === "accepted").map((k) => k.id));
        for (const l of selectDeliverableLetters(letters, keepers)) {
          expect(accepted.has(l.recipientKeeperId)).toBe(true);
          expect(l.status).toBe("final");
          expect(l.deliveredAt).toBeNull();
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("matches the naive model exactly (nothing eligible is missed)", () => {
    fc.assert(
      fc.property(fc.array(letterArb, { maxLength: 30 }), keeperArb, (letters, keepers) => {
        const expected = letters.filter(
          (l) =>
            l.status === "final" &&
            l.deliveredAt === null &&
            keepers.some((k) => k.id === l.recipientKeeperId && k.status === "accepted")
        );
        expect(selectDeliverableLetters(letters, keepers)).toEqual(expected);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("revoking a keeper never increases what is delivered", () => {
    fc.assert(
      fc.property(
        fc.array(letterArb, { maxLength: 30 }),
        keeperArb,
        fc.constantFrom(...KEEPER_IDS),
        (letters, keepers, victim) => {
          const after = keepers.map((k) => (k.id === victim ? { ...k, status: "revoked" as const } : k));
          const before = new Set(selectDeliverableLetters(letters, keepers).map((l) => l.id));
          for (const l of selectDeliverableLetters(letters, after)) expect(before.has(l.id)).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("delivery is idempotent: a second pass over the delivered set delivers nothing", () => {
    fc.assert(
      fc.property(fc.array(letterArb, { maxLength: 30 }), keeperArb, (letters, keepers) => {
        const first = new Set(selectDeliverableLetters(letters, keepers).map((l) => l.id));
        const marked = letters.map((l) => (first.has(l.id) ? { ...l, deliveredAt: "2026-02-02T00:00:00Z" } : l));
        expect(selectDeliverableLetters(marked, keepers)).toEqual([]);
        for (const l of letters) expect(isLetterDeliverable(l, keepers)).toBe(first.has(l.id));
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
