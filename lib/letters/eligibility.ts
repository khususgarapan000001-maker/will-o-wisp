/**
 * Who gets which letter at release time. Pure TypeScript mirror of the SQL in
 * deliver_letters_on_release() (20261121100100): the tested specification of
 * the rule, while SQL is its transactional persistence.
 *
 *   deliver  <=>  letter is `final`
 *                 AND not already delivered
 *                 AND its recipient keeper is STILL `accepted`
 */

import type { KeeperStatus, LetterStatus } from "@/lib/supabase/types";

export interface EligibilityLetter {
  id: string;
  status: LetterStatus;
  recipientKeeperId: string;
  deliveredAt: string | null;
}

export interface EligibilityKeeper {
  id: string;
  status: KeeperStatus;
}

export function isLetterDeliverable(
  letter: EligibilityLetter,
  keepers: readonly EligibilityKeeper[]
): boolean {
  if (letter.status !== "final") return false;
  if (letter.deliveredAt !== null) return false;
  const keeper = keepers.find((k) => k.id === letter.recipientKeeperId);
  return keeper !== undefined && keeper.status === "accepted";
}

export function selectDeliverableLetters<L extends EligibilityLetter>(
  letters: readonly L[],
  keepers: readonly EligibilityKeeper[]
): L[] {
  return letters.filter((l) => isLetterDeliverable(l, keepers));
}

/** Letters per recipient keeper, for the notification payload. */
export function countByRecipient(letters: readonly EligibilityLetter[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of letters) {
    counts.set(l.recipientKeeperId, (counts.get(l.recipientKeeperId) ?? 0) + 1);
  }
  return counts;
}
