/** Gentle, plain-language mapping of database guard errors for /api/letters. */

export const DELIVERED_LETTER_MESSAGE =
  "This letter has already been delivered and read, so it can't be changed or removed.";

export function letterWriteError(dbMessage: string): { status: number; message: string } {
  if (dbMessage.includes("delivered letter")) {
    return { status: 409, message: DELIVERED_LETTER_MESSAGE };
  }
  if (dbMessage.includes("release has already happened")) {
    return {
      status: 409,
      message: "Your lantern has already been passed on, so letters can no longer be added or changed.",
    };
  }
  if (dbMessage.includes("recipient must be")) {
    return {
      status: 400,
      message: "Please choose one of your keepers who has accepted their invitation.",
    };
  }
  return { status: 500, message: "We couldn't save that just now. Please try again." };
}
