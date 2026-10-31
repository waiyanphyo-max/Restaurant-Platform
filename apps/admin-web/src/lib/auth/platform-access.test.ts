import { describe, expect, it } from "vitest";
import { ApiHttpError, ApiNetworkError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { loadPlatformAccess } from "./platform-access";

describe("platform authorization boundary", () => {
  it("requires the backend overview response before reporting platform access", async () => {
    const overview = {
      totalRestaurants: 0, activeRestaurants: 0, inactiveRestaurants: 0,
      totalOrders: 0, totalRestaurantMembers: 0,
    };
    expect(await loadPlatformAccess(async () => overview)).toEqual({ state: "authorized", overview });
  });

  it("keeps unauthenticated, forbidden and unavailable outcomes distinct", async () => {
    for (const error of [new MissingAccessTokenError(), new ApiHttpError(401, "UNAUTHORIZED")]) {
      expect(await loadPlatformAccess(async () => { throw error; })).toEqual({ state: "signed-out" });
    }
    expect(await loadPlatformAccess(async () => { throw new ApiHttpError(403, "FORBIDDEN"); }))
      .toEqual({ state: "forbidden" });
    expect(await loadPlatformAccess(async () => { throw new ApiNetworkError(); }))
      .toEqual({ state: "unavailable" });
  });
});
