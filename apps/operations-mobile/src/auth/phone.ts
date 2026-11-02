import type { SupabaseClient } from "@supabase/supabase-js";
import type { NativeSession } from "./session";

/** Proposed future server capability. No existing Spring endpoint issues it in M7. */
export interface PhoneOtpCapability {
  restaurantId: string;
  expectedAuthUserId: string;
  providerVerified: boolean;
  expiresAt: string;
}

export type PhoneOtpAvailability =
  | { enabled: false; reason: "disabled" | "backend_unavailable" | "provider_unverified" | "invalid_capability" }
  | { enabled: true; expectedAuthUserId: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function phoneOtpAvailability(
  requested: boolean,
  capability: PhoneOtpCapability | null,
  restaurantId: string,
  now = Date.now()
): PhoneOtpAvailability {
  if (!requested) return { enabled: false, reason: "disabled" };
  if (!capability) return { enabled: false, reason: "backend_unavailable" };
  if (!capability.providerVerified) return { enabled: false, reason: "provider_unverified" };
  const expiresAt = Date.parse(capability.expiresAt);
  if (capability.restaurantId.toLowerCase() !== restaurantId.toLowerCase() ||
      !uuidPattern.test(capability.expectedAuthUserId) || !Number.isFinite(expiresAt) || expiresAt <= now) {
    return { enabled: false, reason: "invalid_capability" };
  }
  return { enabled: true, expectedAuthUserId: capability.expectedAuthUserId };
}

export class PhoneOtpUnavailableError extends Error {
  constructor() { super("Phone sign-in is unavailable for this build and restaurant"); }
}

export interface PhoneOtpPort {
  request(phone: string): Promise<void>;
  verify(phone: string, token: string): Promise<NativeSession>;
  signOut(): Promise<void>;
}

/** Real SDK calls; this adapter is not installed into the live M7 authentication path. */
export function createSupabasePhoneOtpPort(auth: SupabaseClient["auth"]): PhoneOtpPort {
  return {
    async request(phone) {
      const { error } = await auth.signInWithOtp({ phone, options: { shouldCreateUser: false, channel: "sms" } });
      if (error) throw error;
    },
    async verify(phone, token) {
      const { data, error } = await auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw error;
      if (!data.session) throw new Error("Supabase did not return a verified session");
      return data.session;
    },
    async signOut() {
      const { error } = await auth.signOut({ scope: "local" });
      if (error) throw error;
    }
  };
}

/**
 * Extension point only. M8 must supply a real server capability, integrate SDK
 * event suppression during verification, and then run the membership gate again.
 * No phone/email string can create or transfer a restaurant membership.
 */
export function createPhoneOtpFlow(port: PhoneOtpPort, availability: () => PhoneOtpAvailability) {
  let requestedPhone: string | null = null;
  function requireEnabled() {
    const current = availability();
    if (!current.enabled) throw new PhoneOtpUnavailableError();
    return current;
  }
  return {
    async request(phone: string) {
      requireEnabled();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Use an international phone number");
      requestedPhone = null;
      await port.request(phone);
      requestedPhone = phone;
    },
    async verify(phone: string, token: string) {
      const capability = requireEnabled();
      if (phone !== requestedPhone || !/^\d{6}$/.test(token)) throw new Error("Request a code before verifying");
      const session = await port.verify(phone, token);
      requestedPhone = null;
      const latest = availability();
      if (!latest.enabled || latest.expectedAuthUserId.toLowerCase() !== capability.expectedAuthUserId.toLowerCase() ||
          session.user.id.toLowerCase() !== capability.expectedAuthUserId.toLowerCase()) {
        await port.signOut();
        throw new Error("Verified phone does not belong to the authorized Auth identity");
      }
      return session;
    }
  };
}
