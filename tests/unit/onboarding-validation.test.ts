import { describe, it, expect } from "vitest";
import {
  validateDisplayName,
  validateTimezone,
  validateStepA,
  scorePassphrase,
  validatePassphrase,
  validatePassphraseConfirm,
  validateStepC,
  VALID_CADENCE_DAYS,
  VALID_GRACE_DAYS,
} from "@/lib/onboarding/validation";

// ---------------------------------------------------------------------------
// validateDisplayName
// ---------------------------------------------------------------------------
describe("validateDisplayName", () => {
  it("accepts a normal name", () => {
    expect(validateDisplayName("Ahmad Rizki").valid).toBe(true);
  });

  it("rejects an empty string", () => {
    const r = validateDisplayName("");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("rejects a whitespace-only string", () => {
    const r = validateDisplayName("   ");
    expect(r.valid).toBe(false);
  });

  it("rejects names over 80 characters", () => {
    const r = validateDisplayName("a".repeat(81));
    expect(r.valid).toBe(false);
  });

  it("accepts a name of exactly 80 characters", () => {
    expect(validateDisplayName("a".repeat(80)).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTimezone
// ---------------------------------------------------------------------------
describe("validateTimezone", () => {
  it("accepts a valid IANA timezone", () => {
    expect(validateTimezone("Asia/Jakarta").valid).toBe(true);
    expect(validateTimezone("UTC").valid).toBe(true);
    expect(validateTimezone("America/New_York").valid).toBe(true);
  });

  it("rejects an empty string", () => {
    const r = validateTimezone("");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("rejects a clearly invalid timezone", () => {
    const r = validateTimezone("Not/A/Valid/Zone");
    expect(r.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateStepA
// ---------------------------------------------------------------------------
describe("validateStepA", () => {
  it("passes with valid fields", () => {
    const r = validateStepA({ displayName: "Ahmad", timezone: "Asia/Jakarta" });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it("collects errors from both fields", () => {
    const r = validateStepA({ displayName: "", timezone: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.displayName).toBeTruthy();
    expect(r.errors.timezone).toBeTruthy();
  });

  it("reports only the failing field", () => {
    const r = validateStepA({ displayName: "Ahmad", timezone: "" });
    expect(r.valid).toBe(false);
    expect(r.errors.displayName).toBeUndefined();
    expect(r.errors.timezone).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// scorePassphrase
// ---------------------------------------------------------------------------
describe("scorePassphrase", () => {
  it("returns score 0 for a very short passphrase", () => {
    const r = scorePassphrase("hi");
    expect(r.score).toBe(0);
  });

  it("returns score 4 for a long complex passphrase", () => {
    const r = scorePassphrase("Correct-Horse-Battery!42");
    expect(r.score).toBe(4);
  });

  it("includes a human-readable label", () => {
    const r = scorePassphrase("short");
    expect(typeof r.label).toBe("string");
    expect(r.label.length).toBeGreaterThan(0);
  });

  it("score is always between 0 and 4", () => {
    const cases = ["", "a", "abcdefghijkl", "Abc123!", "!A1b2C3d4E5f6G7h"];
    for (const c of cases) {
      const { score } = scorePassphrase(c);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// validatePassphrase
// ---------------------------------------------------------------------------
describe("validatePassphrase", () => {
  it("rejects an empty passphrase", () => {
    const r = validatePassphrase("");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("rejects a passphrase shorter than 12 characters", () => {
    const r = validatePassphrase("short");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("rejects a passphrase of exactly 11 characters", () => {
    const r = validatePassphrase("a".repeat(11));
    expect(r.valid).toBe(false);
  });

  it("accepts a passphrase of exactly 12 characters", () => {
    const r = validatePassphrase("a".repeat(12));
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("includes strength info when valid", () => {
    const r = validatePassphrase("a".repeat(12));
    expect(r.strength).toBeDefined();
    expect(typeof r.strength?.score).toBe("number");
  });

  it("includes strength info even when too short", () => {
    const r = validatePassphrase("short");
    expect(r.strength).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validatePassphraseConfirm
// ---------------------------------------------------------------------------
describe("validatePassphraseConfirm", () => {
  it("passes when passphrases match", () => {
    const r = validatePassphraseConfirm("correct-horse-battery", "correct-horse-battery");
    expect(r.valid).toBe(true);
  });

  it("fails when passphrases don't match", () => {
    const r = validatePassphraseConfirm("correct-horse-battery", "wrong");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("fails when confirm is empty", () => {
    const r = validatePassphraseConfirm("correct-horse-battery", "");
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// validateStepC
// ---------------------------------------------------------------------------
describe("validateStepC", () => {
  it("passes with default values (14 / 14)", () => {
    const r = validateStepC({ cadenceDays: 14, graceDays: 14 });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
  });

  it.each(VALID_CADENCE_DAYS.flatMap(c => VALID_GRACE_DAYS.map(g => [c, g])))(
    "passes for cadence=%i grace=%i",
    (cadence, grace) => {
      const r = validateStepC({ cadenceDays: cadence, graceDays: grace });
      expect(r.valid).toBe(true);
    }
  );

  it("rejects an invalid cadence value", () => {
    const r = validateStepC({ cadenceDays: 10, graceDays: 14 });
    expect(r.valid).toBe(false);
    expect(r.errors.cadenceDays).toBeTruthy();
  });

  it("rejects an invalid grace value", () => {
    const r = validateStepC({ cadenceDays: 14, graceDays: 1 });
    expect(r.valid).toBe(false);
    expect(r.errors.graceDays).toBeTruthy();
  });

  it("reports both errors when both values are invalid", () => {
    const r = validateStepC({ cadenceDays: 0, graceDays: 0 });
    expect(r.valid).toBe(false);
    expect(r.errors.cadenceDays).toBeTruthy();
    expect(r.errors.graceDays).toBeTruthy();
  });
});
