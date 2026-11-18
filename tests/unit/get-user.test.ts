import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// vi.hoisted runs before the vi.mock factory, so the spy is available inside
// the factory without triggering the "top-level variable" TDZ error.
// ---------------------------------------------------------------------------
const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Import AFTER mocks are established.
import { getUser } from "@/lib/auth/get-user";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getUser", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns the user when a valid session exists", async () => {
    const user = makeUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });

    const result = await getUser();

    expect(result).toEqual(user);
  });

  it("returns null when no session exists (AuthSessionMissingError)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    });

    const result = await getUser();

    expect(result).toBeNull();
  });

  it("returns null when getUser returns a non-session error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", message: "Invalid JWT" },
    });

    const result = await getUser();

    expect(result).toBeNull();
  });

  it("returns null when the Supabase client throws unexpectedly", async () => {
    mockGetUser.mockRejectedValue(new Error("network error"));

    const result = await getUser();

    expect(result).toBeNull();
  });

  it("returns null when getUser resolves with a null user and no error", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getUser();

    expect(result).toBeNull();
  });
});
