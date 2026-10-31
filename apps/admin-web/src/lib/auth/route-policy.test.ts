import { describe, expect, it } from "vitest";
import { ApiConfigurationError, ApiHttpError, ApiNetworkError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { classifyAdminError, isPublicAdminPath, loginPath, safeReturnTo } from "./route-policy";

describe("admin route policy", () => {
  it("keeps every admin destination protected and allows only explicit authentication/status routes", () => {
    for (const path of ["/", "/restaurants", "/provisioning", "/restaurant-details", "/settings", "/auth/anything"]) {
      expect(isPublicAdminPath(path)).toBe(false);
    }
    for (const path of ["/login", "/access", "/auth/callback", "/auth/accept-invite"]) expect(isPublicAdminPath(path)).toBe(true);
  });

  it("preserves recognized local destinations and only valid registry parameters", () => {
    expect(safeReturnTo("/restaurants?search=My%20restaurant&page=2&access_token=secret")).toBe("/restaurants?search=My+restaurant&page=2");
    expect(safeReturnTo("/restaurant-details?id=00000000-0000-4000-8000-000000000001&page=3"))
      .toBe("/restaurant-details?page=3&id=00000000-0000-4000-8000-000000000001");
    expect(safeReturnTo("/restaurant-details?id=invalid&page=-1")).toBe("/restaurant-details");
    expect(loginPath("/settings", "expired")).toBe("/login?returnTo=%2Fsettings&reason=expired");
    expect(loginPath("/")).toBe("/login");
  });

  it.each([undefined, "", "https://evil.test", "//evil.test", "/\\evil.test", "/login", "/auth/callback", "/access", "/settings#token", "/settings\n", "/%2f%2fevil.test", "javascript:alert(1)"])(
    "rejects external, recursive or malformed return targets: %s", (target) => { expect(safeReturnTo(target)).toBe("/"); },
  );

  it("distinguishes missing credentials, permission denial, configuration and service failures", () => {
    expect(classifyAdminError(new MissingAccessTokenError())).toBe("signed-out");
    expect(classifyAdminError(new ApiHttpError(401, "UNAUTHORIZED"))).toBe("signed-out");
    expect(classifyAdminError(new ApiHttpError(403, "FORBIDDEN"))).toBe("forbidden");
    expect(classifyAdminError(new ApiHttpError(404, "NOT_FOUND"))).toBe("not-found");
    expect(classifyAdminError(new ApiHttpError(503, "PLATFORM_ADMIN_NOT_CONFIGURED"))).toBe("configuration");
    expect(classifyAdminError(new ApiConfigurationError("Invalid origin"))).toBe("configuration");
    expect(classifyAdminError(new ApiNetworkError())).toBe("unavailable");
  });
});
