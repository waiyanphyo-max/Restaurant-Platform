import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { middleware } from "./middleware";

const mocks = vi.hoisted(() => ({ refreshGuestAuthSession: vi.fn() }));
vi.mock("./lib/auth/refresh", () => ({ refreshGuestAuthSession: mocks.refreshGuestAuthSession }));

afterEach(() => { vi.clearAllMocks(); });

describe("guest routing middleware", () => {
  it.each(["qrToken", "queueToken", "trackingToken", "token"])("rejects a credential-bearing %s query without rendering or echoing it", async key => {
    const response = await middleware(new NextRequest(`https://garden.example.test/?${key}=private-credential`));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private-credential");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.refreshGuestAuthSession).not.toHaveBeenCalled();
  });
  it("removes a client-supplied route slug from an ordinary restaurant request", async () => {
    const request = new NextRequest("https://garden.example.test/menu", {
      headers: { host: "garden.example.test", "x-guest-route-slug": "tea-house" },
    });
    const response = await middleware(request);
    expect(request.headers.get("x-guest-route-slug")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-guest-route-slug")).toBeNull();
    expect(mocks.refreshGuestAuthSession).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("overwrites a forged slug with the actual local route slug", async () => {
    const request = new NextRequest("http://localhost:3002/r/garden/menu?restaurantId=other", {
      headers: { host: "localhost:3002", "x-guest-route-slug": "tea-house" },
    });
    const response = await middleware(request);
    expect(request.headers.get("x-guest-route-slug")).toBe("garden");
    expect(response.headers.get("x-middleware-request-x-guest-route-slug")).toBe("garden");
  });

  it("preserves auth session refresh only for auth routes", async () => {
    mocks.refreshGuestAuthSession.mockResolvedValue(NextResponse.next());
    const request = new NextRequest("https://garden.example.test/auth/callback", {
      headers: { "x-guest-route-slug": "tea-house" },
    });
    await middleware(request);
    expect(mocks.refreshGuestAuthSession).toHaveBeenCalledWith(request);
    expect(request.headers.get("x-guest-route-slug")).toBeNull();
  });
});
