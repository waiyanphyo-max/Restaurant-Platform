import { describe, expect, it, vi } from "vitest";
import { createPublicRestaurantApiClient, createRestaurantMemberApiClient } from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";

describe("variant description transport", () => {
  it("sends optional Unicode descriptions for create, update and explicit clearing", async () => {
    const requests: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      requests.push(init!);
      return new Response(JSON.stringify({ id: variantId, productId, ...JSON.parse(init!.body as string) }), {
        headers: { "Content-Type": "application/json" }
      });
    });
    const api = createRestaurantMemberApiClient({ baseUrl: "https://api.example.test", restaurantId,
      getAccessToken: () => "test-access-token", fetchImpl: fetchImpl as typeof fetch });
    const body = { name: "Small", price: 1500, available: true, description: "လူတစ်ယောက်အတွက်\nSingle serving." };
    expect((await api.createVariant(productId, body)).description).toBe(body.description);
    expect((await api.updateVariant(productId, variantId, { ...body, description: null })).description).toBeNull();
    expect(requests.map(request => JSON.parse(request.body as string).description)).toEqual([body.description, null]);
  });

  it("preserves optional descriptions in public menu responses", async () => {
    const variant = { id: variantId, name: "Large", price: 2500, imageUrl: null, available: true,
      description: "Family-sized serving." };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ restaurantId,
      categories: [{ products: [{ variants: [variant] }] }] }), { headers: { "Content-Type": "application/json" } }));
    const api = createPublicRestaurantApiClient({ baseUrl: "https://api.example.test", restaurantId, fetchImpl: fetchImpl as typeof fetch });
    expect((await api.getPublicMenu()).categories[0].products[0].variants[0].description).toBe(variant.description);
  });
});
