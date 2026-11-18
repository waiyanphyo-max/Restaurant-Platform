import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeOwnerOnboarding } from "./actions";

const mocks = vi.hoisted(() => ({ serverAuth: vi.fn(), createClient: vi.fn(), complete: vi.fn(), getClaims: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ serverAuth: mocks.serverAuth }));
vi.mock("@restaurant-platform/api-client", () => ({ createOwnerOnboardingApiClient: mocks.createClient }));
const userId = "00000000-0000-4000-8000-000000000001";
const completedAt = "2026-11-11T00:00:00Z";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClaims.mockResolvedValue({ data: { claims: { sub: userId } }, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: userId }, access_token: "fresh-password-token" } }, error: null });
  mocks.serverAuth.mockResolvedValue({ getClaims: mocks.getClaims, getSession: mocks.getSession });
  mocks.createClient.mockReturnValue({ complete: mocks.complete });
  mocks.complete.mockResolvedValue({ onboardingStatus: "COMPLETE", completedAt, token: "never-return-this" });
});

describe("public authenticated owner onboarding completion", () => {
  it("uses a verified cookie token and returns only completion evidence", async () => {
    expect(await completeOwnerOnboarding(userId)).toEqual({ ok: true, completedAt });
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith();
    const options = mocks.createClient.mock.calls[0][0];
    expect(await options.getAccessToken()).toBe("fresh-password-token");
    expect(options).not.toHaveProperty("userId");
    expect(options).not.toHaveProperty("role");
  });

  it("does not call the backend for a missing or switched identity", async () => {
    expect(await completeOwnerOnboarding("different-user")).toEqual({ ok: false });
    mocks.getClaims.mockResolvedValue({ data: null, error: { message: "invalid" } });
    expect(await completeOwnerOnboarding(userId)).toEqual({ ok: false });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rechecks identity before forwarding a token", async () => {
    await completeOwnerOnboarding(userId);
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "00000000-0000-4000-8000-000000000002" } }, error: null });
    expect(await mocks.createClient.mock.calls[0][0].getAccessToken()).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("reports backend membership/proof errors or outages without false completion", async () => {
    mocks.complete.mockRejectedValue(new Error("OWNER_PASSWORD_PROOF_REQUIRED"));
    expect(await completeOwnerOnboarding(userId)).toEqual({ ok: false });
    mocks.serverAuth.mockResolvedValue(null);
    expect(await completeOwnerOnboarding(userId)).toEqual({ ok: false });
  });
});
