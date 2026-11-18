import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookies";

describe("Auth cookie transport", () => {
  it("uses Secure on the actual HTTPS browser transport", () => {
    expect(authCookieOptions({}, "https:")).toEqual({ secure: true, sameSite: "lax", path: "/" });
  });
  it("uses Secure for configured HTTPS and nonlocal deployment stages", () => {
    expect(authCookieOptions({ ADMIN_WEB_ORIGIN: "https://owner.example.test" }).secure).toBe(true);
    for (const APP_STAGE of ["staging", "production"]) expect(authCookieOptions({ APP_STAGE }).secure).toBe(true);
  });
  it("preserves HTTP development without deriving security from request headers", () => {
    expect(authCookieOptions({ APP_STAGE: "local", ADMIN_WEB_ORIGIN: "http://localhost:3001" }, "http:").secure).toBe(false);
    expect(authCookieOptions({}).secure).toBe(false);
  });
});
