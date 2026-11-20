/** Gentle, plain-language mapping of database guard errors for /api/will. */

export const SEALED_WILL_MESSAGE =
  "Your lantern has already been passed on, so your wishes can no longer be added or changed.";

export function willWriteError(dbMessage: string): { status: number; message: string } {
  if (dbMessage.includes("release has already happened")) {
    return { status: 409, message: SEALED_WILL_MESSAGE };
  }
  if (dbMessage.includes("transfer target must be")) {
    return {
      status: 400,
      message: "Please choose one of your keepers who has accepted their invitation.",
    };
  }
  return { status: 500, message: "We couldn't save that just now. Please try again." };
}
