import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError } from "@restaurant-platform/api-client";
import { provisionRestaurant, updateRestaurantConfiguration, updateRestaurantStatus } from "./(admin)/actions";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), provision: vi.fn(), configuration: vi.fn(), status: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin-context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
const id = "00000000-0000-4000-8000-000000000001";
const request = { ownerEmail: "owner@example.test", ownerUserId: id, restaurant: { name: "Test", slug: "test", city: "Yangon", township: "Bahan", timezone: "Asia/Yangon", currency: "MMK" } };
const configuration = { name: "Test", slug: "test", logoUrl: null, configuration: { primaryColor: null, secondaryColor: null, guestDomains: { staging: [], production: [] }, android: { operations: { displayName: null, stagingApplicationId: null, productionApplicationId: null, iconPath: null }, customer: { displayName: null, stagingApplicationId: null, productionApplicationId: null, iconPath: null } } } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ api: { provisionRestaurant: mocks.provision, updateRestaurantConfiguration: mocks.configuration, updateRestaurantStatus: mocks.status } });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("authorized platform mutations", () => {
  it("requires backend admin access before each write", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("DENIED"));
    for (const action of [() => provisionRestaurant(request), () => updateRestaurantConfiguration(id, configuration), () => updateRestaurantStatus(id, false)]) await expect(action()).rejects.toThrow("DENIED");
    expect(mocks.provision).not.toHaveBeenCalled(); expect(mocks.configuration).not.toHaveBeenCalled(); expect(mocks.status).not.toHaveBeenCalled();
  });
  it("submits once and returns only the created restaurant and invitation status", async () => {
    mocks.provision.mockResolvedValue({ restaurant: { id, name: "Test" }, invitationSent: true, ownerInvitationStatus: "INVITED", ownerUserId: id, ownerEmail: "owner@example.test", ownerWorkspaceUrl: "https://example.test", commonQrToken: null, commonQrUrl: null });
    expect(await provisionRestaurant(request)).toEqual({ ok: true, data: { id, name: "Test", invitationSent: true, ownerInvitationStatus: "INVITED" } });
    expect(mocks.provision).toHaveBeenCalledExactlyOnceWith(request);
  });
  it.each([[409, "RESTAURANT_SLUG_EXISTS"], [502, "PLATFORM_OWNER_INVITATION_PROVIDER_ERROR"], [400, "PLATFORM_OWNER_IDENTITY_UNVERIFIED"]])("returns a recoverable provisioning HTTP %s", async (status, code) => {
    mocks.provision.mockRejectedValue(new ApiHttpError(status as number, code as string));
    expect(await provisionRestaurant(request)).toMatchObject({ ok: false, message: expect.any(String) });
    expect(mocks.provision).toHaveBeenCalledTimes(1);
  });
  it("uses the selected restaurant UUID for configuration and status writes", async () => {
    expect(await updateRestaurantConfiguration(id, configuration)).toEqual({ ok: true, data: null });
    expect(mocks.configuration).toHaveBeenCalledExactlyOnceWith(id, configuration);
    expect(await updateRestaurantStatus(id, false)).toEqual({ ok: true, data: null });
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith(id, { active: false });
  });
  it.each([401, 403])("redirects mutation HTTP %s to the session/access recovery route", async status => {
    mocks.status.mockRejectedValue(new ApiHttpError(status, "FORBIDDEN"));
    await expect(updateRestaurantStatus(id, false)).rejects.toThrow(status === 403 ? "REDIRECT:/access" : "REDIRECT:/login");
  });
});
