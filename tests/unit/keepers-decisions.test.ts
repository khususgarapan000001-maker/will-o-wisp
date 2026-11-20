import { describe, expect, it, vi } from "vitest";
import { DAY_MS } from "@/lib/heartbeat/cadence";
import type { HeartbeatMachine } from "@/lib/heartbeat/state-machine";
import { applyKeeperDecision, countConfirmations } from "@/lib/keepers/decision";
import {
  describeRelease,
  formatElapsed,
  keeperMinimumWarning,
  MIN_KEEPERS_WARNING,
} from "@/lib/keepers/release-status";
import { describeNotice, noticePrefix } from "@/lib/keepers/notifications";
import { planKeeperWraps } from "@/lib/keepers/wrap-sync";
import { processOwnerTick, type TickOwner } from "@/lib/heartbeat/tick";
import { MemoryTickStore } from "../helpers/memory-store";
import type { Mailer } from "@/lib/heartbeat/mailer";
import {
  buildFalseAlarmEmail,
  buildKeeperInviteEmail,
  buildReleasedEmail,
  buildReleasePendingEmail,
} from "@/lib/email/templates/keepers";
import { emailKeepersReleasePending } from "@/lib/keepers/release-notify";

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);

function awaiting(over: Partial<HeartbeatMachine> = {}): HeartbeatMachine {
  return {
    state: "AWAITING_KEEPERS",
    nextCheckinDue: new Date(T0),
    lastCheckinAt: new Date(T0 - 7 * DAY_MS),
    cadenceDays: 7,
    graceDays: 7,
    timeZone: "UTC",
    requiredConfirmations: 2,
    confirmations: [],
    falseAlarmFlagged: false,
    ...over,
  };
}
const AFTER_GRACE = new Date(T0 + 8 * DAY_MS);

describe("decision counting", () => {
  it("one confirmation does not release; the second distinct keeper does", () => {
    const one = applyKeeperDecision(awaiting(), "k1", "confirm", AFTER_GRACE);
    expect(one.machine.state).toBe("AWAITING_KEEPERS");
    expect(one.machine.confirmations).toEqual(["k1"]);
    const two = applyKeeperDecision(one.machine, "k2", "confirm", AFTER_GRACE);
    expect(two.machine.state).toBe("RELEASED");
    expect(two.effects).toContainEqual({ type: "MARK_RELEASED" });
  });

  it("the same keeper confirming twice never counts twice", () => {
    let m = awaiting();
    m = applyKeeperDecision(m, "k1", "confirm", AFTER_GRACE).machine;
    m = applyKeeperDecision(m, "k1", "confirm", AFTER_GRACE).machine;
    expect(m.state).toBe("AWAITING_KEEPERS");
    expect(m.confirmations).toEqual(["k1"]);
  });

  it("a false alarm cancels even after another keeper confirmed", () => {
    let m = applyKeeperDecision(awaiting(), "k1", "confirm", AFTER_GRACE).machine;
    const t = applyKeeperDecision(m, "k2", "false_alarm", AFTER_GRACE);
    m = t.machine;
    expect(m.state).toBe("ALIVE");
    expect(m.confirmations).toEqual([]);
    expect(t.effects).toContainEqual({ type: "CANCEL_RELEASE", reason: "keeper_false_alarm" });
    expect(m.nextCheckinDue.getTime()).toBeGreaterThan(AFTER_GRACE.getTime());
  });

  it("with only one accepted keeper the release waits (requirement 17)", () => {
    // Only k1 exists, so only k1 can ever confirm.
    let m = awaiting();
    for (let i = 0; i < 5; i++) m = applyKeeperDecision(m, "k1", "confirm", AFTER_GRACE).machine;
    expect(m.state).toBe("AWAITING_KEEPERS");
  });

  it("countConfirmations ignores duplicates, false alarms and non-accepted keepers", () => {
    const rows = [
      { keeperId: "a", decision: "confirm" as const },
      { keeperId: "a", decision: "confirm" as const },
      { keeperId: "b", decision: "false_alarm" as const },
      { keeperId: "c", decision: "confirm" as const },
    ];
    expect(countConfirmations(rows, new Set(["a", "b"]))).toBe(1);
    expect(countConfirmations(rows, new Set(["a", "c"]))).toBe(2);
  });
});

describe("release status copy", () => {
  it("shows confirmations received / required while waiting", () => {
    const s = describeRelease({ state: "awaiting_keepers", received: 1, required: 2, acceptedKeepers: 2 });
    expect(s.headline).toBe("1 of 2 confirmations");
    expect(s.blockedByKeeperCount).toBe(false);
  });

  it("explains the wait when fewer keepers accepted than required", () => {
    const s = describeRelease({ state: "awaiting_keepers", received: 1, required: 2, acceptedKeepers: 1 });
    expect(s.blockedByKeeperCount).toBe(true);
    expect(s.detail).toContain("Only 1 keeper has accepted");
  });

  it("describes closed states calmly", () => {
    expect(describeRelease({ state: "released", received: 2, required: 2 }).tone).toBe("done");
    expect(describeRelease({ state: "cancelled_false_alarm", received: 1, required: 2 }).headline).toMatch(
      /false alarm/i
    );
  });

  it("warns below two accepted keepers and not at two", () => {
    expect(keeperMinimumWarning(0)).toBe(MIN_KEEPERS_WARNING);
    expect(keeperMinimumWarning(1)).toBe("You need 2 keepers for the release to work.");
    expect(keeperMinimumWarning(2)).toBeNull();
  });

  it("formats time since last check-in", () => {
    const to = new Date("2026-11-20T12:00:00Z");
    expect(formatElapsed(new Date("2026-11-20T11:40:00Z"), to)).toBe("less than an hour");
    expect(formatElapsed(new Date("2026-11-20T09:00:00Z"), to)).toBe("3 hours");
    expect(formatElapsed(new Date("2026-11-10T12:00:00Z"), to)).toBe("10 days");
  });
});

describe("in-app notices", () => {
  it("recognises the kinds written by the SQL functions", () => {
    expect(noticePrefix("release_pending_0123abcd")).toBe("release_pending");
    expect(noticePrefix("released_0123abcd")).toBe("released");
    expect(noticePrefix("keeper_accepted_ff")).toBe("keeper_accepted");
    expect(noticePrefix("checkin_reminder_3d")).toBeNull();
  });

  it("links a pending release to the keeper decision page", () => {
    const v = describeNotice("release_pending_x", { release_id: "r1" }, "keeper");
    expect(v?.href).toBe("/keeper/release/r1");
    expect(describeNotice("overdue_day_1", null, "owner")).toBeNull();
  });
});

describe("vault key wrapping plan", () => {
  const t = (id: string, k = `pk-${id}`) => ({ id, publicKeyB64: k });

  it("wraps for accepted keepers with no entry yet", () => {
    const plan = planKeeperWraps([], [t("a"), t("b")]);
    expect(plan.toWrap.map((x) => x.id)).toEqual(["a", "b"]);
    expect(plan.keep).toEqual([]);
  });

  it("keeps up-to-date entries and drops entries for keepers no longer accepted", () => {
    const entries = [
      { keeper_id: "a", keeper_public_key: "pk-a" },
      { keeper_id: "gone", keeper_public_key: "pk-gone" },
    ];
    const plan = planKeeperWraps(entries, [t("a"), t("b")]);
    expect(plan.keep).toEqual([entries[0]]);
    expect(plan.toWrap.map((x) => x.id)).toEqual(["b"]);
  });

  it("re-wraps when the keeper's public key changed", () => {
    const plan = planKeeperWraps([{ keeper_id: "a", keeper_public_key: "old" }], [t("a", "new")]);
    expect(plan.keep).toEqual([]);
    expect(plan.toWrap.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("release-opened hook in the tick", () => {
  const ownerAtGraceEnd = (): TickOwner => ({
    ownerId: "o1",
    email: "owner@example.com",
    displayName: "Dewi",
    machine: awaiting({ state: "OVERDUE" }),
    reminderDaysBefore: [3, 1],
    demoTimeOffset: null,
  });
  const mailer: Mailer = { provider: "log", async send() { return { ok: true, delivery: "logged" }; } };
  const deps = (onReleaseOpened: (o: TickOwner, at: Date) => Promise<void>) => ({
    store: new MemoryTickStore(),
    mailer,
    demoMode: false,
    buildEmail: async () => null,
    onReleaseOpened,
  });

  it("calls the hook exactly once when the release opens", async () => {
    const hook = vi.fn(async () => {});
    const out = await processOwnerTick(ownerAtGraceEnd(), deps(hook), AFTER_GRACE);
    expect(out.releaseOpened).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("does not call the hook when nothing opens", async () => {
    const hook = vi.fn(async () => {});
    const owner = { ...ownerAtGraceEnd(), machine: awaiting({ state: "ALIVE", nextCheckinDue: new Date(T0 + 30 * DAY_MS) }) };
    await processOwnerTick(owner, deps(hook), new Date(T0));
    expect(hook).not.toHaveBeenCalled();
  });

  it("a failing hook cannot undo the state change", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new MemoryTickStore();
    const out = await processOwnerTick(
      ownerAtGraceEnd(),
      { ...deps(async () => { throw new Error("mail down"); }), store },
      AFTER_GRACE
    );
    expect(out.after).toBe("AWAITING_KEEPERS");
    expect(store.machines.get("o1")?.state).toBe("AWAITING_KEEPERS");
    err.mockRestore();
  });
});

describe("keeper emails", () => {
  const all = () => [
    buildKeeperInviteEmail({
      to: "k@x.co", keeperName: "Sari", ownerName: "Dewi", inviteUrl: "https://x/keeper/invite/t", expiresInDays: 7,
    }),
    buildReleasePendingEmail({
      to: "k@x.co", keeperName: "Sari", ownerName: "Dewi", lastCheckinLabel: "1 January 2026", releaseUrl: "https://x/keeper/release/r",
    }),
    buildReleasedEmail({ to: "k@x.co", recipientName: "Sari", ownerName: "Dewi", audience: "keeper", url: "https://x/k" }),
    buildReleasedEmail({ to: "o@x.co", recipientName: "Dewi", ownerName: "Dewi", audience: "owner", url: "https://x/app" }),
    buildFalseAlarmEmail({ to: "o@x.co", recipientName: "Dewi", ownerName: "Dewi", audience: "owner", note: "Spoke to her", url: "https://x/app" }),
    buildFalseAlarmEmail({ to: "k@x.co", recipientName: "Sari", ownerName: "Dewi", audience: "keeper", note: null, url: "https://x/app" }),
  ];

  it("every template has a plain-text and an HTML version with its link", () => {
    for (const m of all()) {
      expect(m.text.length).toBeGreaterThan(40);
      expect(m.html).toContain("<p>");
      expect(m.subject.length).toBeGreaterThan(5);
    }
    expect(all()[0].text).toContain("https://x/keeper/invite/t");
    expect(all()[1].text).toContain("https://x/keeper/release/r");
  });

  it("stays calm: no alarmist words", () => {
    for (const m of all()) {
      expect(`${m.subject} ${m.text}`).not.toMatch(/urgent|emergency|death|dead|died|immediately|alert|warning/i);
    }
  });

  it("escapes HTML in names and notes", () => {
    const m = buildFalseAlarmEmail({
      to: "o@x.co", recipientName: "<b>D</b>", ownerName: "D", audience: "owner", note: "<script>x</script>", url: "https://x",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("emails each accepted keeper once and counts failures", async () => {
    const sent: string[] = [];
    const flaky: Mailer = {
      provider: "log",
      async send(msg) {
        if (msg.to === "bad@x.co") return { ok: false, delivery: "failed" };
        sent.push(msg.to);
        return { ok: true, delivery: "sent" };
      },
    };
    const r = await emailKeepersReleasePending({
      mailer: flaky,
      ownerName: "Dewi",
      lastCheckinLabel: null,
      releaseUrl: "https://x/keeper/release/r",
      keepers: [
        { name: "A", email: "a@x.co" },
        { name: "B", email: "bad@x.co" },
      ],
    });
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(sent).toEqual(["a@x.co"]);
  });
});
