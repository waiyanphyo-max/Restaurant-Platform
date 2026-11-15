import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestPasswordRecovery } from "./actions";

const mocks = vi.hoisted(() => ({ serverAuth: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ serverAuth: mocks.serverAuth }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_INVITE_REDIRECT_URL", "https://owner.example.test/auth/accept-invite");
  mocks.serverAuth.mockResolvedValue({ resetPasswordForEmail: mocks.resetPasswordForEmail });
  mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("public password recovery", () => {
  it("uses only the server-configured HTTPS handler and returns no account details", async () => {
    expect(await requestPasswordRecovery(" owner@example.test ")).toEqual({ ok: true });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("owner@example.test", { redirectTo: "https://owner.example.test/auth/accept-invite" });
  });

  it.each([
    "", "http://localhost:3000/auth/accept-invite", "https://localhost/auth/accept-invite", "https://127.0.0.1/auth/accept-invite", "https://[::1]/auth/accept-invite", "https://owner.example.test/", "https://owner.example.test/auth/accept-invite?next=https://evil.test",
    "https://owner.example.test/auth/accept-invite#token", "https://user:password@owner.example.test/auth/accept-invite",
  ])("fails closed for incorrect redirect configuration: %s", async redirect => {
    vi.stubEnv("SUPABASE_INVITE_REDIRECT_URL", redirect);
    expect(await requestPasswordRecovery("owner@example.test")).toEqual({ ok: false });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("does not contact the provider for invalid email input", async () => {
    expect(await requestPasswordRecovery("not-an-address")).toEqual({ ok: false });
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("gives the same safe failure for provider rate limits and delivery failures", async () => {
    for (const message of ["over_email_send_rate_limit", "smtp provider failed"]) {
      mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: { message } });
      expect(await requestPasswordRecovery("owner@example.test")).toEqual({ ok: false });
    }
    mocks.resetPasswordForEmail.mockRejectedValueOnce(new Error("network failed"));
    expect(await requestPasswordRecovery("owner@example.test")).toEqual({ ok: false });
  });
});
