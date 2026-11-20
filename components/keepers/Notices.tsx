import Link from "next/link";
import { describeNotice } from "@/lib/keepers/notifications";

export interface NoticeRow {
  id: string;
  kind: string;
  payload: unknown;
  created_at: string;
}

/** Gentle in-app notices (server-rendered). Renders nothing when empty. */
export function Notices({ rows, audience }: { rows: NoticeRow[]; audience: "owner" | "keeper" }) {
  const items = rows
    .map((r) => ({
      id: r.id,
      view: describeNotice(
        r.kind,
        r.payload && typeof r.payload === "object" ? (r.payload as Record<string, unknown>) : null,
        audience
      ),
    }))
    .filter((r) => r.view !== null);
  if (items.length === 0) return null;

  return (
    <section aria-label="Notices" className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Notices
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map(({ id, view }) => (
          <li key={id} className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">
            {view!.href ? (
              <Link href={view!.href} className="hover:underline">
                {view!.text}
              </Link>
            ) : (
              view!.text
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
