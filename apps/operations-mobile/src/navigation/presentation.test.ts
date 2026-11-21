import { describe, expect, it } from "vitest";
import type { MyRestaurantResponse } from "@restaurant-platform/shared-types";
import { getNavigationItems, OPERATIONS_ROLES, type OperationsRole } from "./policy";
import { primarySelected, workspaceNavigation } from "./presentation";

const tenants = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
function membership(restaurantId: string, role: OperationsRole): MyRestaurantResponse {
  return { restaurantId, role, name: "Synthetic restaurant", slug: "synthetic", active: true };
}

describe("UXI-10 role navigation presentation", () => {
  it.each(OPERATIONS_ROLES)("preserves every previously authorized %s route for two restaurants", role => {
    for (const restaurantId of tenants) {
      const authorized = getNavigationItems(membership(restaurantId, role), restaurantId);
      const navigation = workspaceNavigation(authorized, role);
      const reachable = new Set([...navigation.primary, ...navigation.groups.flatMap(group => group.items.map(item => item.id))]);
      for (const item of authorized) expect(reachable.has(item.id)).toBe(true);
      expect(new Set(navigation.groups.flatMap(group => group.items.map(item => item.id))).size).toBe(authorized.length);
      expect(navigation.primary).toEqual(role === "DELIVERY_DRIVER" ? ["deliveries", "dashboard", "notifications", "profile"] : ["dashboard", "orders", "deliveries", "more"]);
    }
  });

  it.each(["STAFF", "DELIVERY_DRIVER"] as const)("never adds finance or management routes to %s", role => {
    const navigation = workspaceNavigation(getNavigationItems(membership(tenants[0], role), tenants[0]), role);
    expect(navigation.groups.find(group => group.id === "finance")).toBeUndefined();
    const ids = navigation.groups.flatMap(group => group.items.map(item => item.id));
    for (const id of ["reports", "sales-history", "accounting", "shopping", "purchasing", "settings", "tables", "team"]) expect(ids).not.toContain(id);
    if (role === "DELIVERY_DRIVER") for (const id of ["orders", "queue", "menu"]) expect(ids).not.toContain(id);
  });

  it("has no runnable tabs or tools from a cross-tenant membership", () => {
    for (const role of OPERATIONS_ROLES) {
      expect(workspaceNavigation(getNavigationItems(membership(tenants[0], role), tenants[1]), role)).toEqual({ primary: [], groups: [] });
    }
  });

  it("keeps detail routes selected in their parent tab and management routes in More", () => {
    expect(primarySelected("orders", "/order/synthetic", false)).toBe(true);
    expect(primarySelected("deliveries", "/delivery/synthetic", false)).toBe(true);
    expect(primarySelected("more", "/accounting", false)).toBe(true);
    expect(primarySelected("more", "/queue", false)).toBe(true);
    expect(primarySelected("more", "/orders", true)).toBe(true);
    expect(primarySelected("orders", "/orders", true)).toBe(false);
    expect(primarySelected("more", "/order/synthetic", false)).toBe(false);
  });
});
