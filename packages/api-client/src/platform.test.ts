import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type {
  PlatformRestaurantConfigurationRequest, PlatformRestaurantDetailResponse,
  PlatformRestaurantProvisionRequest, PlatformRestaurantProvisionResponse,
} from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError, createPlatformAdminApiClient } from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const configuration: PlatformRestaurantDetailResponse["configuration"] = {
  primaryColor: "#24563B", secondaryColor: "#F8F8F0",
  guestDomains: { staging: ["staging.example.test"], production: ["restaurant.example.test"] },
  android: {
    operations: { displayName: "Restaurant operations", stagingApplicationId: "test.restaurant.ops.staging", productionApplicationId: "test.restaurant.ops", iconPath: null },
    customer: { displayName: "Restaurant", stagingApplicationId: "test.restaurant.customer.staging", productionApplicationId: "test.restaurant.customer", iconPath: null },
  },
};
const detail: PlatformRestaurantDetailResponse = {
  restaurant: {
    id: restaurantId, name: "Restaurant", slug: "restaurant", description: null, phone: "+9591234567",
    address: "1 Example street", houseNo: null, street: null, ward: null, township: "Bahan", city: "Yangon",
    latitude: null, longitude: null, logoUrl: null, active: true,
    createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z",
  },
  currency: "MMK", timezone: "Asia/Yangon", memberCount: 1, orderCount: 0,
  owners: [{ userId: ownerUserId, email: "owner@example.test", fullName: "Owner", invitationStatus: "INVITED" }],
  configuration, ownerWorkspaceUrl: `https://guest.example.test/workspace?restaurantId=${restaurantId}`,
  qrSetupUrl: `https://guest.example.test/workspace?restaurantId=${restaurantId}&setup=qr`,
  setupInstructions: ["Accept the email invitation, then sign in to configure QR ordering."],
};
const provisioning: PlatformRestaurantProvisionRequest = {
  ownerEmail: "owner@example.test", ownerFullName: "Owner", ownerUserId,
  restaurant: { name: "Restaurant", slug: "restaurant", city: "Yangon", township: "Bahan", currency: "MMK", timezone: "Asia/Yangon" },
  configuration,
};
const provisioned: PlatformRestaurantProvisionResponse = {
  ownerUserId, ownerEmail: provisioning.ownerEmail, invitationSent: true, ownerRole: "OWNER",
  restaurant: detail.restaurant, ownerWorkspaceUrl: detail.ownerWorkspaceUrl,
  commonQrUrl: null, commonQrToken: null, ownerInvitationStatus: "INVITED", qrSetupUrl: detail.qrSetupUrl,
};
const configRequest: PlatformRestaurantConfigurationRequest = {
  name: "New restaurant name", slug: "new-restaurant", logoUrl: "https://images.example.test/logo.png", configuration,
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("platform lifecycle contracts", () => {
  it("calls exact platform routes with current bearer, configuration body and private request policy", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(provisioned))
      .mockResolvedValueOnce(json(detail)).mockResolvedValueOnce(json(detail)).mockResolvedValueOnce(json(detail));
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "verified-admin", fetchImpl });
    await expect(client.provisionRestaurant(provisioning)).resolves.toEqual(provisioned);
    await expect(client.getRestaurant(restaurantId.toUpperCase())).resolves.toEqual(detail);
    await client.updateRestaurantStatus(restaurantId, { active: false });
    await client.updateRestaurantConfiguration(restaurantId, configRequest);
    const calls = fetchImpl.mock.calls;
    expect(calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method])).toEqual([
      ["/api/v1/platform/restaurants", "POST"],
      [`/api/v1/platform/restaurants/${restaurantId}`, "GET"],
      [`/api/v1/platform/restaurants/${restaurantId}/status`, "PATCH"],
      [`/api/v1/platform/restaurants/${restaurantId}/configuration`, "PUT"],
    ]);
    expect(JSON.parse(calls[0][1]?.body as string)).toEqual(provisioning);
    expect(JSON.parse(calls[2][1]?.body as string)).toEqual({ active: false });
    expect(JSON.parse(calls[3][1]?.body as string)).toEqual(configRequest);
    for (const [, init] of calls) {
      expect((init?.headers as Headers).get("authorization")).toBe("Bearer verified-admin");
      expect(init).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
    }
  });

  it.each(["detail", "status", "configuration"])("rejects another restaurant in the %s response", async kind => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...detail, restaurant: { ...detail.restaurant, id: otherId } }));
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    const request = kind === "detail" ? client.getRestaurant(restaurantId) : kind === "status"
      ? client.updateRestaurantStatus(restaurantId, { active: false }) : client.updateRestaurantConfiguration(restaurantId, configRequest);
    await expect(request).rejects.toBeInstanceOf(ApiProtocolError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed route IDs before any request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(client.getRestaurant("../another")).rejects.toBeInstanceOf(ApiConfigurationError);
    await expect(client.provisionRestaurant({ ...provisioning, ownerUserId: "invalid" })).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { ...provisioned, ownerUserId: otherId },
    { ...provisioned, commonQrToken: "legacy-raw-secret" },
    { ...provisioned, commonQrUrl: "https://guest.example.test/#qrToken=legacy-raw-secret" },
    { ...provisioned, restaurant: { ...detail.restaurant, id: "invalid" } },
  ])("fails closed against incompatible provisioning responses", async response => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(response));
    await expect(createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl })
      .provisionRestaurant(provisioning)).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it.each([
    [400, "VALIDATION_FAILED"], [401, "UNAUTHORIZED"], [403, "FORBIDDEN"],
    [409, "RESTAURANT_SLUG_EXISTS"], [502, "PLATFORM_OWNER_INVITATION_PROVIDER_ERROR"],
    [503, "PLATFORM_OWNER_INVITATION_NOT_CONFIGURED"],
  ])("preserves provisioning HTTP %s/%s without replaying an invitation", async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code, errors: [] }, status as number));
    await expect(createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl })
      .provisionRestaurant(provisioning)).rejects.toMatchObject({ status, code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry status or configuration writes on provider failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "SERVICE_UNAVAILABLE" }, 503));
    const client = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(client.updateRestaurantStatus(restaurantId, { active: false })).rejects.toMatchObject({ status: 503 });
    await expect(client.updateRestaurantConfiguration(restaurantId, configRequest)).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("platform HTTP transport integration", () => {
  it("uses real fetch across a loopback server for provisioning, detail, writes, conflicts and denial", async () => {
    const seen: { method: string; path: string; authorization: string | undefined; body: unknown }[] = [];
    async function handler(request: IncomingMessage, response: ServerResponse) {
      let input = "";
      for await (const chunk of request) input += chunk.toString();
      const body: unknown = input ? JSON.parse(input) : null;
      const path = request.url ?? "/";
      seen.push({ method: request.method ?? "", path, authorization: request.headers.authorization, body });
      response.setHeader("Content-Type", "application/json");
      let result: unknown = detail;
      if (request.headers.authorization !== "Bearer allowlisted-admin") {
        response.statusCode = 403; result = { code: "FORBIDDEN", errors: [] };
      } else if (request.method === "POST") {
        if ((body as PlatformRestaurantProvisionRequest).restaurant.slug === "duplicate") {
          response.statusCode = 409; result = { code: "RESTAURANT_SLUG_EXISTS", errors: [] };
        } else { response.statusCode = 201; result = provisioned; }
      } else if (request.method === "PATCH") result = { ...detail, restaurant: { ...detail.restaurant, active: false } };
      else if (request.method === "PUT") result = { ...detail, restaurant: { ...detail.restaurant, name: configRequest.name }, configuration };
      response.end(JSON.stringify(result));
    }
    const server = createServer((request, response) => { void handler(request, response).catch(() => { response.statusCode = 500; response.end("{}"); }); });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Loopback server did not bind a TCP port");
      let accessToken = "allowlisted-admin";
      const client = createPlatformAdminApiClient({ baseUrl: `http://127.0.0.1:${address.port}`, getAccessToken: () => accessToken });
      await expect(client.provisionRestaurant(provisioning)).resolves.toMatchObject({ ownerUserId, invitationSent: true });
      await expect(client.getRestaurant(restaurantId)).resolves.toMatchObject({ restaurant: { id: restaurantId } });
      await expect(client.updateRestaurantStatus(restaurantId, { active: false })).resolves.toMatchObject({ restaurant: { active: false } });
      await expect(client.updateRestaurantConfiguration(restaurantId, configRequest)).resolves.toMatchObject({ restaurant: { name: configRequest.name } });
      await expect(client.provisionRestaurant({ ...provisioning, restaurant: { ...provisioning.restaurant, slug: "duplicate" } }))
        .rejects.toMatchObject({ status: 409, code: "RESTAURANT_SLUG_EXISTS" });
      accessToken = "ordinary-owner";
      await expect(client.getRestaurant(restaurantId)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      expect(seen).toHaveLength(6);
      expect(seen[0]).toMatchObject({ path: "/api/v1/platform/restaurants", method: "POST", authorization: "Bearer allowlisted-admin", body: provisioning });
      expect(seen[2].body).toEqual({ active: false });
      expect(seen[3].body).toEqual(configRequest);
      expect(seen[5].authorization).toBe("Bearer ordinary-owner");
      expect(seen.every(request => !request.path.includes("token"))).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
