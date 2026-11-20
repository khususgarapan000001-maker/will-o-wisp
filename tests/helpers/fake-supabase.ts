/**
 * Tiny in-memory stand-in for the Supabase query builder, covering exactly the
 * calls lib/heartbeat/service.ts makes: select / insert / update with eq
 * filters, order, limit, maybeSingle. Enforces the unique keys the real schema
 * has (notifications, one open release per owner).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Record<string, unknown>;

export class FakeDb {
  tables: Record<string, Row[]> = {
    profiles: [],
    heartbeat_settings: [],
    checkins: [],
    notifications: [],
    release_processes: [],
  };
  private seq = 0;

  client(): SupabaseClient<Database> {
    return { from: (t: string) => new Builder(this, t) } as unknown as SupabaseClient<Database>;
  }

  nextId(): string {
    return `id-${++this.seq}`;
  }
}

class Builder {
  private mode: "select" | "insert" | "update" = "select";
  private filters: [string, unknown][] = [];
  private patch: Row = {};
  private newRow: Row = {};
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select() {
    return this;
  }
  insert(row: Row) {
    this.mode = "insert";
    this.newRow = row;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }

  private matching(): Row[] {
    let rows = this.db.tables[this.table].filter((r) =>
      this.filters.every(([c, v]) => r[c] === v)
    );
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    return this.max === null ? rows : rows.slice(0, this.max);
  }

  private run(): { data: Row[] | null; error: { message: string; code?: string } | null } {
    const rows = this.db.tables[this.table];
    if (this.mode === "insert") {
      const row: Row = { id: this.db.nextId(), attempts: 0, sent_at: null, ...this.newRow };
      if (this.table === "notifications" &&
          rows.some((r) => r.owner_id === row.owner_id && r.kind === row.kind && r.due_date === row.due_date)) {
        return { data: null, error: { message: "duplicate", code: "23505" } };
      }
      if (this.table === "release_processes" &&
          rows.some((r) => r.owner_id === row.owner_id && r.state === "awaiting_keepers") &&
          row.state === "awaiting_keepers") {
        return { data: null, error: { message: "duplicate", code: "23505" } };
      }
      rows.push(row);
      return { data: [row], error: null };
    }
    if (this.mode === "update") {
      const hit = this.matching();
      hit.forEach((r) => Object.assign(r, this.patch));
      return { data: hit, error: null };
    }
    return { data: this.matching(), error: null };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    return { data: data?.[0] ?? null, error };
  }
  async single() {
    return this.maybeSingle();
  }
  then<T>(resolve: (v: ReturnType<Builder["run"]>) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}
