import { describe, expect, it } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import { mutationFailure, safeSetupUrl } from "./lifecycle";

const id = "00000000-0000-4000-8000-000000000001";
describe("lifecycle recovery and safe setup links", () => {
  it("distinguishes duplicate slugs, existing identities, provider failures and uncertain writes", () => {
    expect(mutationFailure(new ApiHttpError(409, "RESTAURANT_SLUG_EXISTS")).fields).toHaveProperty("slug");
    expect(mutationFailure(new ApiHttpError(409, "PLATFORM_OWNER_EMAIL_ALREADY_REGISTERED")).fields).toHaveProperty("ownerUserId");
    expect(mutationFailure(new ApiHttpError(503, "PLATFORM_OWNER_INVITATION_NOT_CONFIGURED")).message).toContain("unavailable");
    expect(mutationFailure(new ApiNetworkError()).uncertain).toBe(true);
    expect(mutationFailure(new ApiHttpError(400, "VALIDATION_ERROR", [{ field: "restaurant.slug", message: "Invalid slug" }])).fields).toEqual({ slug: "Invalid slug" });
  });
  it("accepts only credential-free HTTPS or loopback setup links for this restaurant", () => {
    expect(safeSetupUrl(`https://guest.test/workspace?restaurantId=${id}&setup=qr`, id)).not.toBeNull();
    expect(safeSetupUrl(`http://localhost:3000/workspace?restaurantId=${id}`, id)).not.toBeNull();
    for (const value of ["javascript:alert(1)", `http://guest.test/workspace?restaurantId=${id}`, `https://user:pass@guest.test/workspace?restaurantId=${id}`, `https://guest.test/workspace?restaurantId=${id}#qrToken=secret`, `https://guest.test/workspace?restaurantId=${id}&token=secret`, `https://guest.test/workspace?restaurantId=${id}&setup=secret`, "https://guest.test/workspace?restaurantId=other"]) expect(safeSetupUrl(value, id)).toBeNull();
  });
});
