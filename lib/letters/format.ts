/** "12 March 2026" in UTC, so server and browser always render the same text. */
export function formatLetterDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(d);
}
