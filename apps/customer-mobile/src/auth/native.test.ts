import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeSession, NativeSessionController } from "./session";

const sdk = vi.hoisted(() => ({
  create: vi.fn(), lock: vi.fn(), values: new Map<string, string>(),
  get: vi.fn(), set: vi.fn(), remove: vi.fn(),
  session: null as NativeSession | null,
  listener: undefined as undefined | ((event: string, session: NativeSession | null) => void),
  signIn: vi.fn(), signUp: vi.fn(), resend: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
  start: vi.fn(), stop: vi.fn(), unsubscribe: vi.fn(), removeLifecycle: vi.fn(),
  resetEmail: vi.fn(), verifyRecovery: vi.fn(), updatePassword: vi.fn(), recoverySignOut: vi.fn()
}));
vi.mock("react-native-url-polyfill/auto", () => ({}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  AppState: { currentState: "active", addEventListener: () => ({ remove: sdk.removeLifecycle }) }
}));
vi.mock("expo-secure-store", () => ({ getItemAsync: sdk.get, setItemAsync: sdk.set, deleteItemAsync: sdk.remove }));
vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.create, processLock: sdk.lock }));
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => ({
  environment: "development", restaurantId: "restaurant-fixture", phoneOtpRequested: false
}) }));

const email = "customer@example.test";
const password = "Test-password-123!";
const session: NativeSession = {
  access_token: "test-access-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "d7695964-9b50-455a-9065-620e49a9b947" }
};
let controller: NativeSessionController | undefined;

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); sdk.values.clear(); sdk.session = null; sdk.listener = undefined;
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://auth-fixture.supabase.co");
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture12345678");
  vi.stubEnv("EXPO_PUBLIC_CUSTOMER_EMAIL_OTP_RECOVERY_ENABLED", "true");
  vi.stubEnv("EXPO_PUBLIC_CUSTOMER_PASSWORD_MIN_LENGTH", "8");
  vi.stubEnv("EXPO_PUBLIC_CUSTOMER_PASSWORD_REQUIREMENTS", "");
  sdk.get.mockImplementation(async (key: string) => sdk.values.get(key) ?? null);
  sdk.set.mockImplementation(async (key: string, value: string) => { sdk.values.set(key, value); });
  sdk.remove.mockImplementation(async (key: string) => { sdk.values.delete(key); });
  sdk.signIn.mockResolvedValue({ data: { session }, error: null });
  sdk.signUp.mockResolvedValue({ data: { session: null }, error: null });
  for (const action of [sdk.resend, sdk.signOut, sdk.resetEmail, sdk.updatePassword, sdk.recoverySignOut]) {
    action.mockResolvedValue({ error: null });
  }
  sdk.verifyRecovery.mockResolvedValue({ data: { session, user: session.user }, error: null });
  sdk.create.mockImplementation((_url: string, _key: string, options: { auth: { persistSession: boolean } }) => ({
    auth: options.auth.persistSession ? {
      getSession: async () => ({ data: { session: sdk.session }, error: null }),
      signInWithPassword: sdk.signIn, signUp: sdk.signUp, resend: sdk.resend,
      signOut: sdk.signOut, refreshSession: sdk.refresh, startAutoRefresh: sdk.start, stopAutoRefresh: sdk.stop,
      onAuthStateChange: (listener: typeof sdk.listener) => {
        sdk.listener = listener;
        return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
      }
    } : {
      resetPasswordForEmail: sdk.resetEmail, verifyOtp: sdk.verifyRecovery,
      updateUser: sdk.updatePassword, signOut: sdk.recoverySignOut
    }
  }));
});
afterEach(() => { controller?.dispose(); controller = undefined; vi.unstubAllEnvs(); });
async function auth() {
  controller = (await import("./native")).getCustomerAuth();
  return controller;
}

describe("customer Supabase native adapter", () => {
  it("keeps the existing scoped secure storage and SDK session options across repeated access", async () => {
    const current = await auth();
    expect((await import("./native")).getCustomerAuth()).toBe(current);
    expect(sdk.create).toHaveBeenCalledOnce();
    const options = sdk.create.mock.calls[0][2];
    expect(options.auth).toMatchObject({
      storageKey: "sb-auth-fixture-auth-token", lock: sdk.lock,
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: "pkce"
    });
    await options.auth.storage.setItem("sb-auth-fixture-auth-token", "opaque-session-fixture");
    expect([...sdk.values.keys()]).toEqual([
      "rp.customer.development.restaurant-fixture.auth-fixture.supabase.co.443.sb-auth-fixture-auth-token"
    ]);
    expect(sdk.start).toHaveBeenCalledOnce();
  });

  it("keeps a confirmation-required signup signed out and passes only normalized email/password to Auth", async () => {
    const current = await auth();
    await expect(current.signUpWithPassword(" Customer@Example.test ", password)).resolves.toEqual({ authenticated: false });
    expect(sdk.signUp).toHaveBeenCalledExactlyOnceWith({ email, password });
    expect(current.getSnapshot()).toEqual({ status: "signed_out" });
  });

  it("preserves the provider signup error code for safe presentation and diagnostics", async () => {
    const error = Object.assign(new Error("private provider details"), { code: "over_email_send_rate_limit", status: 429 });
    sdk.signUp.mockResolvedValue({ data: { session: null }, error });
    const current = await auth();
    await expect(current.signUpWithPassword(email, password)).rejects.toBe(error);
    expect(current.getSnapshot().status).toBe("signed_out");
  });

  it("accepts a valid password session without exposing credentials in its snapshot", async () => {
    const current = await auth();
    await current.signInWithPassword(email, password);
    expect(sdk.signIn).toHaveBeenCalledExactlyOnceWith({ email, password });
    expect(current.getSnapshot()).toEqual({ status: "signed_in", userId: session.user.id });
  });

  it("leaves startup restoration authoritative while still honoring an explicit SDK sign-out event", async () => {
    const current = await auth();
    const publish = vi.fn(); current.subscribe(publish);
    // auth-js may emit a null INITIAL_SESSION when a startup refresh fails.
    sdk.listener?.("INITIAL_SESSION", null);
    expect(publish).not.toHaveBeenCalled();
    await current.signInWithPassword(email, password);
    sdk.listener?.("SIGNED_OUT", null);
    expect(current.getSnapshot()).toEqual({ status: "signed_out" });
    expect(publish).toHaveBeenLastCalledWith({ status: "signed_out" });
  });

  it("uses nonpersisted recovery clients and never publishes a recovery identity as a shopping session", async () => {
    const current = await auth();
    const publish = vi.fn(); current.subscribe(publish);
    await current.requestPasswordReset(email);
    await current.resetPassword(email, "123456", password);
    expect(sdk.resetEmail).toHaveBeenCalledExactlyOnceWith(email);
    expect(sdk.verifyRecovery).toHaveBeenCalledExactlyOnceWith({ email, token: "123456", type: "recovery" });
    expect(sdk.updatePassword).toHaveBeenCalledExactlyOnceWith({ password });
    expect(sdk.recoverySignOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(sdk.create.mock.calls.slice(1).map(call => call[2].auth)).toEqual([
      { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    ]);
    expect(publish).not.toHaveBeenCalled();
    expect(current.getSnapshot()).toEqual({ status: "signed_out" });
    expect(sdk.set).not.toHaveBeenCalled();
    expect(sdk.signIn).not.toHaveBeenCalled();
  });

  it("does not update a password after failed verification and clears the isolated recovery client", async () => {
    const error = Object.assign(new Error("expired code fixture"), { code: "otp_expired" });
    sdk.verifyRecovery.mockResolvedValue({ data: { session: null, user: null }, error });
    const current = await auth();
    await expect(current.resetPassword(email, "123456", password)).rejects.toBe(error);
    expect(sdk.updatePassword).not.toHaveBeenCalled();
    expect(sdk.recoverySignOut).toHaveBeenCalledOnce();
    expect(current.getSnapshot().status).toBe("signed_out");
  });

  it("fails closed before recovery email when its reviewed email-template gate is disabled", async () => {
    vi.stubEnv("EXPO_PUBLIC_CUSTOMER_EMAIL_OTP_RECOVERY_ENABLED", "false");
    const current = await auth();
    await expect(current.requestPasswordReset(email)).rejects.toMatchObject({ code: "recovery_unavailable" });
    expect(sdk.resetEmail).not.toHaveBeenCalled();
    expect(sdk.create).toHaveBeenCalledOnce();
  });

  it("uses the supported signup resend API while remaining signed out", async () => {
    const current = await auth();
    await current.resendConfirmation(email);
    expect(sdk.resend).toHaveBeenCalledExactlyOnceWith({ type: "signup", email });
    expect(current.getSnapshot().status).toBe("signed_out");
  });
});
