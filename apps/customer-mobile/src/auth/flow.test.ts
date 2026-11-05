import { describe, expect, it, vi } from "vitest";
import { createCustomerAuthFlow, type CustomerAuthView } from "./flow";
import type { AuthSnapshot, NativeSessionController } from "./session";

const userId = "b99e736d-e6a2-4510-b1e1-7460e16f5421";
function fixture(initial: AuthSnapshot = { status: "signed_out" }) {
  let state = initial;
  let listener: (snapshot: AuthSnapshot) => void = () => {};
  const publish = (snapshot: AuthSnapshot) => { state = snapshot; listener(snapshot); };
  const auth: NativeSessionController = {
    getSnapshot: () => state,
    restore: vi.fn(async () => state),
    signInWithPassword: vi.fn(async () => { publish({ status: "signed_in", userId }); return state; }),
    signUpWithPassword: vi.fn(async () => { publish({ status: "signed_in", userId }); return { authenticated: true }; }),
    phoneOtpEnabled: vi.fn(async () => false),
    requestPhoneOtp: vi.fn(async () => {}), verifyPhoneOtp: vi.fn(async () => { publish({ status: "signed_in", userId }); return state; }),
    signOut: vi.fn(async () => { publish({ status: "signed_out" }); }),
    getAccessToken: vi.fn(async () => "private-access-token"), refreshAccessToken: vi.fn(async () => "private-access-token"),
    subscribe: vi.fn(callback => { listener = callback; return () => { listener = () => {}; }; }), dispose: vi.fn()
  };
  const cleanup = vi.fn(async () => {});
  const flow = createCustomerAuthFlow(auth, cleanup);
  const views: CustomerAuthView[] = [];
  flow.subscribe(view => views.push(view));
  return { auth, flow, cleanup, publish, views, latest: () => views[views.length - 1] };
}
describe("customer auth provider lifecycle", () => {
  it("restores account identity without requesting staff membership or exposing a token", async () => {
    const { auth, flow, latest, views } = fixture({ status: "signed_in", userId });
    await flow.start();
    expect(latest().state).toEqual({ status: "signed_in", userId });
    expect(auth.restore).toHaveBeenCalledOnce();
    expect(JSON.stringify(views)).not.toContain("private-access-token");
    flow.dispose();
  });

  it("makes an authenticated email signup available immediately for first address onboarding", async () => {
    const { auth, flow, latest } = fixture();
    await flow.start();
    expect(await flow.signUpWithPassword("customer@example.test", "password-fixture")).toEqual({ authenticated: true });
    expect(auth.signUpWithPassword).toHaveBeenCalledWith("customer@example.test", "password-fixture");
    expect(latest().state).toEqual({ status: "signed_in", userId });
    flow.dispose();
  });

  it("keeps email confirmation signup signed out until later authenticated login", async () => {
    const { auth, flow, latest } = fixture();
    auth.signUpWithPassword = vi.fn(async () => ({ authenticated: false }));
    await flow.start();
    expect(await flow.signUpWithPassword("customer@example.test", "password-fixture")).toEqual({ authenticated: false });
    expect(latest().state).toEqual({ status: "signed_out" });
    await flow.signInWithPassword("customer@example.test", "password-fixture");
    expect(latest().state).toEqual({ status: "signed_in", userId });
    flow.dispose();
  });

  it("shows a recoverable restoration error and retries the session", async () => {
    const { auth, flow, latest } = fixture();
    vi.mocked(auth.restore).mockRejectedValueOnce(new Error("offline"));
    await flow.start();
    expect(latest().state.status).toBe("error");
    await flow.retry();
    expect(latest().state).toEqual({ status: "signed_out" });
    flow.dispose();
  });

  it("does not let a stale restoration error replace a newly authenticated account", async () => {
    const { auth, flow, latest } = fixture();
    let fail!: (reason: Error) => void;
    auth.restore = vi.fn(() => new Promise<AuthSnapshot>((_resolve, reject) => { fail = reject; }));
    const restoring = flow.start();
    await flow.signInWithPassword("customer@example.test", "password-fixture");
    fail(new Error("stale restoration request failed"));
    await restoring;
    expect(latest().state).toEqual({ status: "signed_in", userId });
    flow.dispose();
  });

  it("deactivates the device before logout and still clears Auth when cleanup is offline", async () => {
    const { auth, flow, cleanup, latest } = fixture({ status: "signed_in", userId });
    await flow.start();
    cleanup.mockImplementation(async () => {
      expect(auth.signOut).not.toHaveBeenCalled();
      throw new Error("device cleanup offline");
    });
    await flow.signOut();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(latest().state).toEqual({ status: "signed_out" });
    flow.dispose();
  });

  it("reports secure logout failure and allows retry", async () => {
    const { auth, flow, latest } = fixture({ status: "signed_in", userId });
    await flow.start();
    vi.mocked(auth.signOut).mockRejectedValueOnce(new Error("secure deletion failed"));
    await expect(flow.signOut()).rejects.toThrow("secure deletion failed");
    expect(latest().state.status).toBe("error");
    await flow.signOut();
    expect(latest().state).toEqual({ status: "signed_out" });
    flow.dispose();
  });

  it("updates phone availability and does not publish after the provider unmounts", async () => {
    const { auth, flow, views, latest, publish } = fixture();
    auth.phoneOtpEnabled = vi.fn(async () => true);
    await flow.start();
    await vi.waitFor(() => expect(latest().phoneEnabled).toBe(true));
    flow.dispose();
    const count = views.length;
    publish({ status: "signed_in", userId });
    expect(views).toHaveLength(count);
  });
});
