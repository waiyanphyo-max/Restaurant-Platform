import { describe, expect, it, vi } from "vitest";
import type { UpdateFeaturedProductRequest } from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError, MissingAccessTokenError,
  createPublicRestaurantApiClient, createRestaurantMemberApiClient } from "./index.js";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const productA = "33333333-3333-4333-8333-333333333333";
const productB = "44444444-4444-4444-8444-444444444444";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const client = (fetchImpl: typeof fetch, restaurantId = a) => createRestaurantMemberApiClient({
  restaurantId, baseUrl: "https://api.example.test", getAccessToken: () => "verified-member-token", fetchImpl
});
const saved = { restaurantId: a, productId: productA, status: "AVAILABLE", revision: 1 };

describe("Owner-curated Featured contract", () => {
  it("reads the server's truthful NONE/available/unavailable selection, with no popularity inference", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ restaurantId: a, productId: null, status: "NONE", revision: 0 }))
      .mockResolvedValueOnce(json(saved))
      .mockResolvedValueOnce(json({ ...saved, status: "UNAVAILABLE" }));
    const member = client(fetchImpl);
    expect(await member.getFeaturedProduct()).toEqual({ restaurantId: a, productId: null, status: "NONE", revision: 0 });
    expect(await member.getFeaturedProduct()).toEqual(saved);
    expect(await member.getFeaturedProduct()).toEqual({ ...saved, status: "UNAVAILABLE" });
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`https://api.example.test/api/v1/restaurants/${a}/featured-product`);
  });

  it("selects, replaces and explicitly clears through one bound route, projecting only editorial fields", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ...saved, ownerUserId: "private", bootstrapReceipt: {} }))
      .mockResolvedValueOnce(json({ ...saved, productId: productB, revision: 2 }))
      .mockResolvedValueOnce(json({ restaurantId: a, productId: null, status: "NONE", revision: 3 }));
    const member = client(fetchImpl);
    const selected = await member.updateFeaturedProduct({ productId: productA, expectedRevision: 0, restaurantId: b,
      actorUserId: "private", imageUrl: "https://images.example.test/ignored.jpg" } as UpdateFeaturedProductRequest);
    expect(selected).toEqual(saved);
    expect(await member.updateFeaturedProduct({ productId: productB, expectedRevision: 1 })).toMatchObject({ productId: productB, revision: 2 });
    expect(await member.updateFeaturedProduct({ productId: null, expectedRevision: 2 })).toMatchObject({ productId: null, status: "NONE", revision: 3 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/restaurants/${a}/featured-product`);
    expect(init).toMatchObject({ method: "PUT", cache: "no-store", credentials: "omit" });
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer verified-member-token");
    expect(JSON.parse(init?.body as string)).toEqual({ productId: productA, expectedRevision: 0 });
  });

  it.each([{ productId: "name", expectedRevision: 0 }, { expectedRevision: 0 }, { productId: null },
    { productId: null, expectedRevision: -1 }, { productId: null, expectedRevision: 0.5 },
    { productId: null, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }])("rejects invalid intent before any request: %j", async request => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(client(fetchImpl).updateFeaturedProduct(request as UpdateFeaturedProductRequest)).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([{ ...saved, restaurantId: b }, { ...saved, productId: null }, { ...saved, status: "BEST_SELLER" },
    { ...saved, status: "NONE" }, { ...saved, productId: "name" }, { ...saved, revision: 0 },
    { ...saved, revision: -1 }, { ...saved, revision: 1.5 }, { ...saved, revision: Number.MAX_SAFE_INTEGER + 1 }])(
    "rejects malformed or foreign saved/read state: %j", async response => {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(response));
      await expect(client(fetchImpl).getFeaturedProduct()).rejects.toBeInstanceOf(ApiProtocolError);
      await expect(client(fetchImpl).updateFeaturedProduct({ productId: productA, expectedRevision: 0 })).rejects.toBeInstanceOf(ApiProtocolError);
    }
  );

  it.each([{ ...saved, productId: productB }, { ...saved, revision: 3 }])("does not claim success for mismatched or stale confirmations", async response => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(response));
    await expect(client(fetchImpl).updateFeaturedProduct({ productId: productA, expectedRevision: 3 })).rejects.toBeInstanceOf(ApiProtocolError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 409, 422, 503])("retains HTTP %s and never automatically retries a save", async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "FEATURED_SAVE_REJECTED", message: "Rejected" }, status));
    await expect(client(fetchImpl).updateFeaturedProduct({ productId: productA, expectedRevision: 0 })).rejects.toMatchObject({ status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requires the current bearer and never derives write authority from a client role", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const member = createRestaurantMemberApiClient({ restaurantId: a, baseUrl: "https://api.example.test", getAccessToken: () => null, fetchImpl });
    await expect(member.updateFeaturedProduct({ productId: null, expectedRevision: 0 })).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps different tenant selections independent", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async url => json(String(url).includes(b)
      ? { ...saved, restaurantId: b, productId: productB } : saved));
    expect((await client(fetchImpl).getFeaturedProduct()).productId).toBe(productA);
    expect((await client(fetchImpl, b).getFeaturedProduct()).productId).toBe(productB);
  });

  it("serves older public fixtures without Featured metadata and keeps current prices/options intact", async () => {
    const categories = [{ id: b, name: "Fixture category", displayOrder: 0, products: [{ id: productA, name: "Fixture food", price: 123,
      imageUrl: null, available: true, variants: [{ id: productB, name: "Large", price: 234, available: true }], modifierGroups: [] }] }];
    const old = { restaurantId: a, restaurantName: "Fixture A", categories };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(old))
      .mockResolvedValueOnce(json({ ...old, featuredProduct: { productId: productA, status: "AVAILABLE" } }));
    const guest = createPublicRestaurantApiClient({ restaurantId: a, baseUrl: "https://api.example.test", fetchImpl });
    expect(await guest.getPublicMenu()).toEqual(old);
    expect(await guest.getPublicMenu()).toEqual({ ...old, featuredProduct: { productId: productA, status: "AVAILABLE" } });
    expect((fetchImpl.mock.calls[0][1]?.headers as Headers).has("authorization")).toBe(false);
  });
});
