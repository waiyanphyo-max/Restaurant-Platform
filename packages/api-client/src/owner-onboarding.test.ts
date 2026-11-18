import { describe, expect, it, vi } from "vitest";
import { ApiConfigurationError, ApiProtocolError, createOwnerOnboardingApiClient, createPlatformAdminApiClient } from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const requestedAt = "2026-11-12T00:00:00Z";
const nextAllowedAt = "2026-11-12T00:01:00Z";
const requested = { restaurantId, ownerUserId, onboardingStatus: "UNKNOWN", emailStatus: "REQUESTED", requestedAt, nextAllowedAt };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("owner invitation and completion contracts", () => {
  it("resends only to the route-scoped owner, with no recipient body or automatic retry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(requested));
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(client.resendOwnerInvitation(restaurantId, ownerUserId)).resolves.toEqual(requested);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/platform/restaurants/${restaurantId}/owners/${ownerUserId}/invitation`);
    expect(init).toMatchObject({ method: "POST", body: undefined, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer admin");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(["../other", "owner@example.test"])("rejects arbitrary owner identity %s before requesting email", async owner => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(client.resendOwnerInvitation(restaurantId, owner)).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { ...requested, restaurantId: ownerUserId }, { ...requested, ownerUserId: restaurantId },
    { ...requested, emailStatus: "DELIVERED" }, { ...requested, onboardingStatus: "COMPLETE" },
  ])("fails closed on mismatched or untruthful resend responses", async response => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(response));
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(client.resendOwnerInvitation(restaurantId, ownerUserId)).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it.each([401, 403, 409, 429, 502, 503])("preserves resend failure %s without repeating email requests", async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "OWNER_INVITATION_FAILED" }, status));
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(client.resendOwnerInvitation(restaurantId, ownerUserId)).rejects.toMatchObject({ status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("completes with the current verified owner bearer and no role, email or identity body", async () => {
    const result = { onboardingStatus: "COMPLETE", completedAt: requestedAt };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(result));
    const client = createOwnerOnboardingApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "fresh-password-jwt", fetchImpl });
    await expect(client.complete()).resolves.toEqual(result);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.example.test/api/v1/owner-onboarding/complete");
    expect(init).toMatchObject({ method: "POST", body: undefined, cache: "no-store" });
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer fresh-password-jwt");
  });

  it("rejects an incomplete completion acknowledgement", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ onboardingStatus: "UNKNOWN" }));
    const client = createOwnerOnboardingApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "jwt", fetchImpl });
    await expect(client.complete()).rejects.toBeInstanceOf(ApiProtocolError);
  });
});
