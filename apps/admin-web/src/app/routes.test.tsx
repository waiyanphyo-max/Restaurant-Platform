import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import type { PlatformRestaurantSummaryResponse, SpringPage } from "@restaurant-platform/shared-types";
import { Registry } from "@/components/Registry";
import type { SearchParams } from "@/components/restaurant-query";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), listRestaurants: vi.fn(), redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-admin-return-path": "/restaurants?search=Selected" }) }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import OverviewPage from "./(admin)/page";
import RestaurantsPage from "./(admin)/restaurants/page";
import RestaurantDetailsPage from "./(admin)/restaurant-details/page";
import ProvisioningPage from "./(admin)/provisioning/page";
import SettingsPage from "./(admin)/settings/page";
import AdminLayout from "./(admin)/layout";

const userId = "00000000-0000-4000-8000-000000000001";
const restaurantId = "00000000-0000-4000-8000-000000000002";
const selected: PlatformRestaurantSummaryResponse = {
  id: restaurantId, name: "Selected restaurant", slug: "selected-restaurant", city: "Yangon", township: "Bahan",
  active: true, createdAt: "2026-10-01T10:00:00Z", ownerFullName: "Selected owner", ownerEmail: "selected@example.test",
  memberCount: 27, orderCount: 1538,
};
const other: PlatformRestaurantSummaryResponse = {
  ...selected, id: "00000000-0000-4000-8000-000000000003", name: "Other restaurant", ownerEmail: "other@example.test",
};
const overview = { totalRestaurants: 1428, activeRestaurants: 1172, inactiveRestaurants: 256, totalOrders: 43210, totalRestaurantMembers: 8903 };

function page(content = [selected, other]): SpringPage<PlatformRestaurantSummaryResponse> {
  return { content, totalElements: content.length, totalPages: content.length ? 1 : 0, size: 20, number: 0,
    first: true, last: true, empty: content.length === 0, numberOfElements: content.length };
}
const params = (value: SearchParams = {}) => ({ searchParams: Promise.resolve(value) });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ state: "authorized", userId, overview, api: { listRestaurants: mocks.listRestaurants } });
  mocks.listRestaurants.mockReset().mockResolvedValue(page());
  mocks.redirect.mockReset().mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

/** Resolve the real async directory component that Next normally renders beneath its route. */
async function renderRestaurantRoute(search: SearchParams) {
  const route = await RestaurantsPage(params(search)) as ReactElement<{ children: ReactNode }>;
  const children = Children.toArray(route.props.children);
  const registry = children.find((child) => isValidElement(child) && child.type === Registry);
  expect(registry).toBeDefined();
  const directory = await Registry((registry as ReactElement<{ params: SearchParams }>).props);
  return renderToStaticMarkup(<>{children.map((child, index) => <div key={index}>{child === registry ? directory : child}</div>)}</>);
}

describe("actual protected admin routes", () => {
  it.each([
    ["Overview", () => OverviewPage()],
    ["Restaurants", () => RestaurantsPage(params({ search: "secret" }))],
    ["Restaurant Details", () => RestaurantDetailsPage(params({ id: restaurantId }))],
    ["Provisioning", () => ProvisioningPage()],
    ["Settings", () => SettingsPage()],
    ["Dashboard layout", () => AdminLayout({ children: <p>Private content</p> })],
  ])("stops %s at the denied guard before returning content or requesting records", async (_name, render) => {
    mocks.requireAdmin.mockRejectedValue(new Error("DENIED_BY_PLATFORM_GUARD"));
    await expect((render as () => Promise<ReactNode>)()).rejects.toThrow("DENIED_BY_PLATFORM_GUARD");
    expect(mocks.listRestaurants).not.toHaveBeenCalled();
  });

  it("renders actual backend overview counts including zero without substituted business data", async () => {
    let html = renderToStaticMarkup(await OverviewPage());
    for (const count of ["1,428", "1,172", "8,903", "43,210", "256"]) expect(html).toContain(`>${count}<`);
    mocks.requireAdmin.mockResolvedValueOnce({ overview: { totalRestaurants: 0, activeRestaurants: 0, inactiveRestaurants: 0, totalOrders: 0, totalRestaurantMembers: 0 } });
    html = renderToStaticMarkup(await OverviewPage());
    expect(html).toContain('class="metric-value">0<');
    expect(html).not.toContain("43,210");
    expect(mocks.listRestaurants).not.toHaveBeenCalled();
  });

  it("checks the layout using the actual request destination before exposing the dashboard shell", async () => {
    const layout = await AdminLayout({ children: <p>Private content</p> });
    expect(mocks.requireAdmin).toHaveBeenCalledExactlyOnceWith("/restaurants?search=Selected");
    expect(layout.props.userId).toBe(userId);
    expect(mocks.listRestaurants).not.toHaveBeenCalled();
  });

  it("renders the real Registry and requests only the sanitized server query", async () => {
    const html = await renderRestaurantRoute({ search: "  Selected  ", page: "-10" });
    expect(mocks.requireAdmin).toHaveBeenCalledWith("/restaurants?search=Selected");
    expect(mocks.listRestaurants).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 20, search: "Selected" });
    expect(html).toContain("Selected restaurant");
    expect(html).toContain("selected@example.test");
    expect(html).toContain(`/restaurant-details?search=Selected&amp;id=${restaurantId}`);
  });

  it("renders a usable empty directory instead of invented rows", async () => {
    mocks.listRestaurants.mockResolvedValue(page([]));
    const html = await renderRestaurantRoute({});
    expect(html).toContain("No restaurants");
    expect(html).not.toContain("Selected restaurant");
    expect(html).toContain("Search restaurants");
  });

  it.each([401, 403])("handles a directory HTTP %s after a successful layout check", async status => {
    mocks.listRestaurants.mockRejectedValue(new ApiHttpError(status, status === 401 ? "UNAUTHORIZED" : "FORBIDDEN"));
    await expect(renderRestaurantRoute({ search: "Selected", page: "2" })).rejects.toThrow("REDIRECT:");
    const target = mocks.redirect.mock.calls[0][0] as string;
    if (status === 403) expect(target).toBe("/access");
    else {
      const url = new URL(target, "https://admin.test");
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("reason")).toBe("expired");
      expect(url.searchParams.get("returnTo")).toBe("/restaurants?search=Selected&page=2");
    }
  });

  it("returns a retry state when the directory is unreachable", async () => {
    mocks.listRestaurants.mockRejectedValue(new ApiNetworkError());
    const html = await renderRestaurantRoute({});
    expect(html).toContain("Restaurant directory unavailable");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Selected restaurant");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([{}, { id: "invalid" }, { id: [restaurantId, other.id] }])(
    "requires a valid restaurant selection before requesting its current directory page", async search => {
      const html = renderToStaticMarkup(await RestaurantDetailsPage(params(search)));
      expect(mocks.requireAdmin).toHaveBeenCalledWith("/restaurant-details");
      expect(mocks.listRestaurants).not.toHaveBeenCalled();
      expect(html).toContain("Choose a restaurant");
    },
  );

  it("shows only the selected restaurant from the authorized directory response", async () => {
    const html = renderToStaticMarkup(await RestaurantDetailsPage(params({ id: restaurantId.toUpperCase(), page: "3", search: "  Selected  " })));
    expect(mocks.listRestaurants).toHaveBeenCalledExactlyOnceWith({ page: 3, size: 20, search: "Selected" });
    for (const value of ["Selected restaurant", "Selected owner", "selected@example.test", "Yangon", "Bahan", "1,538"]) expect(html).toContain(value);
    expect(html).not.toContain("Other restaurant");
    expect(html).not.toContain("other@example.test");
    expect(html).toContain("Directory summary");
  });

  it("does not fabricate detail data when the selected record is absent from the current page", async () => {
    mocks.listRestaurants.mockResolvedValue(page([other]));
    const html = renderToStaticMarkup(await RestaurantDetailsPage(params({ id: restaurantId })));
    expect(html).toContain("Restaurant selection is no longer available");
    expect(html).not.toContain("selected@example.test");
    expect(html).not.toContain("other@example.test");
  });

  it.each([401, 403])("handles a detail HTTP %s without returning a restaurant record", async status => {
    mocks.listRestaurants.mockRejectedValue(new ApiHttpError(status, status === 401 ? "UNAUTHORIZED" : "FORBIDDEN"));
    await expect(RestaurantDetailsPage(params({ id: restaurantId, page: "2", search: "Selected" }))).rejects.toThrow("REDIRECT:");
    const target = mocks.redirect.mock.calls[0][0] as string;
    if (status === 403) expect(target).toBe("/access");
    else {
      const url = new URL(target, "https://admin.test");
      expect(url.searchParams.get("reason")).toBe("expired");
      const returnTo = new URL(url.searchParams.get("returnTo")!, "https://admin.test");
      expect(returnTo.pathname).toBe("/restaurant-details");
      expect(returnTo.searchParams.get("id")).toBe(restaurantId);
      expect(returnTo.searchParams.get("page")).toBe("2");
    }
  });

  it("renders guarded provisioning as an explicit preparation preview", async () => {
    const html = renderToStaticMarkup(await ProvisioningPage());
    expect(mocks.requireAdmin).toHaveBeenCalledWith("/provisioning");
    expect(html).toContain("Onboarding preview");
    expect(html).toContain("Creating restaurants and sending owner invitations are not available yet");
    expect(mocks.listRestaurants).not.toHaveBeenCalled();
  });

  it("renders the verified UUID in settings only after authorization", async () => {
    const html = renderToStaticMarkup(await SettingsPage());
    expect(mocks.requireAdmin).toHaveBeenCalledWith("/settings");
    expect(html).toContain(userId);
    expect(html).toContain("Platform Admin verified");
    expect(html).not.toContain("selected@example.test");
    expect(mocks.listRestaurants).not.toHaveBeenCalled();
  });
});
