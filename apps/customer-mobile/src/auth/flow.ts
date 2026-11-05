import type { AuthSnapshot, NativeSessionController } from "./session";

export type CustomerAuthState = AuthSnapshot | { status: "loading" | "unconfigured" | "error"; message?: string };
export interface CustomerAuthView { state: CustomerAuthState; phoneEnabled: boolean }

/** Customer authentication has no staff-membership prerequisite. */
export function createCustomerAuthFlow(auth: NativeSessionController, cleanupDevice: () => Promise<void>) {
  let view: CustomerAuthView = { state: { status: "loading" }, phoneEnabled: false };
  let active = true;
  let signingOut = false;
  let revision = 0;
  let attempt = 0;
  let stop: (() => void) | undefined;
  const listeners = new Set<(value: CustomerAuthView) => void>();
  function publish(state: CustomerAuthState) {
    if (!active) return;
    view = { ...view, state };
    listeners.forEach(listener => listener(view));
  }
  async function checkPhone() {
    const enabled = await auth.phoneOtpEnabled().catch(() => false);
    if (!active) return;
    view = { ...view, phoneEnabled: enabled };
    listeners.forEach(listener => listener(view));
  }
  async function retry() {
    const current = ++attempt;
    const previousRevision = revision;
    publish({ status: "loading" });
    try {
      const snapshot = await auth.restore();
      if (current === attempt && previousRevision === revision) publish(snapshot);
      void checkPhone();
    } catch {
      if (current === attempt && previousRevision === revision) publish({ status: "error", message: "Your saved session could not be restored. Check your connection and retry, or sign out." });
    }
  }
  return {
    subscribe(listener: (value: CustomerAuthView) => void) {
      listeners.add(listener);
      listener(view);
      return () => { listeners.delete(listener); };
    },
    async start() {
      if (stop || !active) return;
      stop = auth.subscribe(snapshot => {
        revision++;
        if (!signingOut) publish(snapshot);
      });
      await retry();
    },
    retry,
    async signInWithPassword(email: string, password: string) { await auth.signInWithPassword(email, password); },
    signUpWithPassword(email: string, password: string) { return auth.signUpWithPassword(email, password); },
    async requestPhoneOtp(phone: string) {
      try { await auth.requestPhoneOtp(phone); }
      catch (error) { await checkPhone(); throw error; }
    },
    async verifyPhoneOtp(phone: string, token: string) { await auth.verifyPhoneOtp(phone, token); },
    async signOut() {
      if (signingOut) return;
      signingOut = true;
      attempt++;
      publish({ status: "loading" });
      // Device cleanup uses the still-valid bearer session and is bounded by its adapter.
      try { await cleanupDevice(); } catch { /* Secure logout must continue after remote cleanup fails. */ }
      try {
        await auth.signOut();
        publish({ status: "signed_out" });
      } catch (error) {
        publish({ status: "error", message: "Secure session cleanup failed. Retry sign out before closing the app." });
        throw error;
      } finally { signingOut = false; }
    },
    dispose() { active = false; attempt++; stop?.(); listeners.clear(); }
  };
}
export type CustomerAuthFlow = ReturnType<typeof createCustomerAuthFlow>;
