import { describe, expect, it } from "vitest";
import type { MyRestaurantResponse } from "@restaurant-platform/shared-types";
import { canAccessScreen, getNavigationItems, getPlannedNavigationItems, getValidatedRole, OPERATIONS_ROLES } from "./policy";

const restaurantId = "12345678-1234-1234-1234-123456789abc";
const otherRestaurantId = "12345678-1234-1234-1234-123456789def";
const member = (role: string, overrides: Partial<MyRestaurantResponse> = {}): MyRestaurantResponse => ({
  restaurantId, name: "Restaurant", slug: "restaurant", role, active: true, ...overrides
});
const ids = (role: string) => getNavigationItems(member(role), restaurantId).map(item => item.id);

describe("operations navigation policy", () => {
  it("matches the Owner and Manager supported navigation in the requested order", () => {
    expect(ids("OWNER")).toEqual(["dashboard", "orders", "menu", "shopping", "sales-history", "accounting", "reports", "team", "settings", "tables", "queue", "notifications", "deliveries", "profile"]);
    expect(ids("MANAGER")).toEqual(["dashboard", "orders", "menu", "shopping", "sales-history", "accounting", "reports", "settings", "tables", "queue", "notifications", "deliveries", "profile"]);
  });

  it("restricts staff and drivers to operational screens", () => {
    expect(ids("STAFF")).toEqual(["dashboard", "orders", "menu", "queue", "notifications", "deliveries", "profile"]);
    expect(ids("DELIVERY_DRIVER")).toEqual(["dashboard", "notifications", "deliveries", "profile"]);
    for (const role of ["STAFF", "DELIVERY_DRIVER"]) {
      for (const screen of ["reports", "sales-history", "accounting", "shopping", "team", "settings", "tables"]) {
        expect(canAccessScreen(screen, member(role), restaurantId)).toBe(false);
      }
      expect(getPlannedNavigationItems(member(role), restaurantId)).toEqual([]);
    }
  });

  it("never exposes a route while membership is absent, inactive, malformed, or for another restaurant", () => {
    for (const membership of [undefined, null, member("CUSTOMER"), member("manager"), member("OWNER", { active: false }),
      member("OWNER", { restaurantId: otherRestaurantId })]) {
      expect(getNavigationItems(membership, restaurantId)).toEqual([]);
      expect(canAccessScreen("dashboard", membership, restaurantId)).toBe(false);
      expect(getPlannedNavigationItems(membership, restaurantId)).toEqual([]);
    }
    expect(getNavigationItems(member("OWNER"), "not-a-uuid")).toEqual([]);
  });

  it("allows UUID case differences without weakening the exact tenant match", () => {
    expect(getValidatedRole(member("MANAGER", { restaurantId: restaurantId.toUpperCase() }), restaurantId)).toBe("MANAGER");
  });

  it("blocks deep links to unknown screens for every role", () => {
    for (const role of OPERATIONS_ROLES) {
      for (const screen of ["admin", "../reports", "REPORTS"]) {
        expect(canAccessScreen(screen, member(role), restaurantId)).toBe(false);
      }
    }
  });

  it("gives Owner and Manager the same financial routes and rejects cross-restaurant deep links", () => {
    const financeRoutes = ["reports", "sales-history", "shopping", "accounting"];
    const financialNavigation = (role: string) => getNavigationItems(member(role), restaurantId)
      .filter(item => item.requiredPermission === "FINANCE_READ");
    expect(financialNavigation("MANAGER")).toEqual(financialNavigation("OWNER"));
    for (const role of ["OWNER", "MANAGER"]) {
      expect(getPlannedNavigationItems(member(role), restaurantId)).toEqual([]);
      for (const route of financeRoutes) {
        expect(canAccessScreen(route, member(role), restaurantId)).toBe(true);
        expect(canAccessScreen(route, member(role), otherRestaurantId)).toBe(false);
      }
      expect(getNavigationItems(member(role), restaurantId).every(item => item.status === "ready")).toBe(true);
    }
  });

  it("denies Manager deep links to Owner team administration", () => {
    expect(canAccessScreen("team", member("OWNER"), restaurantId)).toBe(true);
    expect(canAccessScreen("team", member("MANAGER"), restaurantId)).toBe(false);
  });
});
