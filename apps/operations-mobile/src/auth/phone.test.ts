import { describe, expect, it, vi } from "vitest";
import {
  createPhoneOtpFlow, createSupabasePhoneOtpPort, phoneOtpAvailability, PhoneOtpUnavailableError, type PhoneOtpCapability
} from "./phone";

const restaurantId = "b99e736d-e6a2-4510-b1e1-7460e16f5421";
const userId = "8254982b-7f82-413b-8c98-d26f558f4968";
const capability: PhoneOtpCapability = {
  restaurantId, expectedAuthUserId: userId, providerVerified: true, expiresAt: "2099-01-01T00:00:00Z"
};

describe("phone OTP extension gate", () => {
  it("stays unavailable when a build flag is set without an existing backend capability", async () => {
    const port = { request: vi.fn(), verify: vi.fn(), signOut: vi.fn() };
    const flow = createPhoneOtpFlow(port, () => phoneOtpAvailability(true, null, restaurantId));
    await expect(flow.request("+959123456789")).rejects.toBeInstanceOf(PhoneOtpUnavailableError);
    expect(port.request).not.toHaveBeenCalled();
    expect(phoneOtpAvailability(false, capability, restaurantId)).toEqual({ enabled: false, reason: "disabled" });
  });

  it("rejects unverified, expired, malformed and cross-restaurant capabilities", () => {
    for (const candidate of [
      { ...capability, providerVerified: false }, { ...capability, expiresAt: "2000-01-01T00:00:00Z" },
      { ...capability, expectedAuthUserId: "email@example.test" }, { ...capability, restaurantId: userId }
    ]) expect(phoneOtpAvailability(true, candidate, restaurantId).enabled).toBe(false);
  });

  it("uses existing-account SMS verification without automatically creating an Auth user", async () => {
    const sdk = {
      signInWithOtp: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ data: { session: { access_token: "fixture", user: { id: userId } } }, error: null })),
      signOut: vi.fn(async () => ({ error: null }))
    };
    const port = createSupabasePhoneOtpPort(sdk as unknown as Parameters<typeof createSupabasePhoneOtpPort>[0]);
    await port.request("+959123456789");
    expect(sdk.signInWithOtp).toHaveBeenCalledWith({ phone: "+959123456789", options: { shouldCreateUser: false, channel: "sms" } });
    await port.verify("+959123456789", "123456");
    expect(sdk.verifyOtp).toHaveBeenCalledWith({ phone: "+959123456789", token: "123456", type: "sms" });
  });

  it("requires a requested phone and rejects a verified session for a different Auth UUID", async () => {
    const port = {
      request: vi.fn(async () => {}),
      verify: vi.fn(async () => ({ access_token: "fixture", user: { id: restaurantId } })),
      signOut: vi.fn(async () => {})
    };
    const flow = createPhoneOtpFlow(port, () => phoneOtpAvailability(true, capability, restaurantId));
    await expect(flow.verify("+959123456789", "123456")).rejects.toThrow("Request a code");
    expect(port.verify).not.toHaveBeenCalled();
    await flow.request("+959123456789");
    await expect(flow.verify("+959123456789", "123456")).rejects.toThrow("authorized Auth identity");
    expect(port.signOut).toHaveBeenCalledTimes(1);
  });
});
