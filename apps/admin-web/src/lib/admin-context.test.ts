import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminContext } from "./auth/admin-session";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./auth/server", () => ({ serverAuth: vi.fn() }));
vi.mock("./auth/admin-session", () => ({ resolveAdminContext: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireAdmin } from "./admin-context";

beforeEach(() => {
  mocks.resolve.mockReset();
  mocks.redirect.mockReset().mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("protected server route guard", () => {
  it("returns only a context explicitly authorized by Spring", async () => {
    const context = { state: "authorized", userId: "verified-id", overview: {}, api: {} } as AdminContext;
    mocks.resolve.mockResolvedValue(context);
    expect(await requireAdmin("/restaurants")).toBe(context);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["/", "/restaurants", "/provisioning", "/restaurant-details", "/settings"])(
    "redirects a missing or expired identity before returning page data for %s", async (path) => {
      mocks.resolve.mockResolvedValue({ state: "signed-out" });
      await expect(requireAdmin(path)).rejects.toThrow("REDIRECT:/login?");
      const target = new URL(mocks.redirect.mock.calls[0][0], "https://admin.test");
      expect(target.searchParams.get("reason")).toBe("expired");
      if (path !== "/") expect(target.searchParams.get("returnTo")).toBe(path);
    },
  );

  it.each(["forbidden", "configuration", "unavailable"])(
    "does not expose the admin shell for a %s result", async (state) => {
      mocks.resolve.mockResolvedValue({ state, issues: [] });
      await expect(requireAdmin("/settings")).rejects.toThrow("REDIRECT:/access");
      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/access");
    },
  );
});
