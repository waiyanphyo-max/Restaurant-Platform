import { describe, expect, it } from "vitest";
import { resolveLegacyIntent, toUrlSearchParams } from "./legacy-route";

const restaurantId = "1e83cd39-8ec3-46bd-b75b-13d09dfe291b";
const otherRestaurantId = "88471380-469f-40e2-9138-5a485c10302a";

describe("legacy guest and owner routes", () => {
  it("accepts the documented Common QR, Table QR, and owner URL shapes", () => {
    expect(
      resolveLegacyIntent(
        "/",
        new URLSearchParams({ view: "customer-pickup", restaurantId }),
        restaurantId,
      ).kind,
    ).toBe("common-qr");
    expect(
      resolveLegacyIntent(
        "/workspace",
        new URLSearchParams({ view: "table-order", restaurantId }),
        restaurantId,
      ).kind,
    ).toBe("table-qr");
    expect(
      resolveLegacyIntent("/workspace", new URLSearchParams({ restaurantId }), restaurantId)
        .kind,
    ).toBe("owner");
  });

  it("rejects a QR or owner link for another restaurant on this domain", () => {
    for (const pathname of ["/", "/workspace"] as const) {
      const view = pathname === "/" ? "customer-pickup" : "table-order";
      expect(
        resolveLegacyIntent(
          pathname,
          new URLSearchParams({ view, restaurantId: otherRestaurantId }),
          restaurantId,
        ).kind,
      ).toBe("invalid");
    }
    expect(
      resolveLegacyIntent(
        "/workspace",
        new URLSearchParams({ restaurantId: otherRestaurantId }),
        restaurantId,
      ).kind,
    ).toBe("invalid");
  });

  it("rejects duplicate or missing restaurant IDs instead of guessing", () => {
    const duplicate = toUrlSearchParams({
      view: "table-order",
      restaurantId: [restaurantId, otherRestaurantId],
    });
    expect(resolveLegacyIntent("/workspace", duplicate, restaurantId).kind).toBe("invalid");
    expect(
      resolveLegacyIntent(
        "/",
        new URLSearchParams({ view: "customer-pickup" }),
        restaurantId,
      ).kind,
    ).toBe("invalid");
    expect(
      resolveLegacyIntent(
        "/workspace",
        new URLSearchParams({ view: "", restaurantId }),
        restaurantId,
      ).kind,
    ).toBe("invalid");
  });
});
