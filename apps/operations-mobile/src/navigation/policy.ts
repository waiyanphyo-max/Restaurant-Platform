import type { MyRestaurantResponse } from "@restaurant-platform/shared-types";

export const OPERATIONS_ROLES = ["OWNER", "MANAGER", "STAFF", "DELIVERY_DRIVER"] as const;
export type OperationsRole = typeof OPERATIONS_ROLES[number];
export type ScreenId = "dashboard" | "orders" | "menu" | "shopping" | "sales-history"
  | "accounting" | "reports" | "team" | "settings" | "deliveries" | "profile" | "tables" | "queue" | "notifications";
export type OperationsPermission = "RESTAURANT_READ" | "ORDER_READ" | "MENU_READ"
  | "REPORT_READ" | "MEMBERS_MANAGE" | "SETTINGS_MANAGE" | "DELIVERY_READ" | "QUEUE_MANAGE";

export interface NavigationItem {
  readonly id: ScreenId;
  readonly label: string;
  readonly path: `/${ScreenId}`;
  readonly status: "ready" | "planned";
  readonly roles: readonly OperationsRole[];
  readonly requiredPermission: OperationsPermission | null;
  readonly description: string;
}

const allRoles = OPERATIONS_ROLES;
const financialRoles = ["OWNER", "MANAGER"] as const;

/**
 * UI visibility mirrors the existing Spring RestaurantRole grants. It never
 * authorizes a request: Spring validates the JWT, restaurant and permission on
 * every endpoint. Future accounting permissions must be explicit backend grants.
 */
const rolePermissions: Readonly<Record<OperationsRole, readonly OperationsPermission[]>> = {
  OWNER: ["RESTAURANT_READ", "ORDER_READ", "MENU_READ", "REPORT_READ", "MEMBERS_MANAGE", "SETTINGS_MANAGE", "DELIVERY_READ", "QUEUE_MANAGE"],
  MANAGER: ["RESTAURANT_READ", "ORDER_READ", "MENU_READ", "REPORT_READ", "SETTINGS_MANAGE", "DELIVERY_READ", "QUEUE_MANAGE"],
  STAFF: ["RESTAURANT_READ", "ORDER_READ", "MENU_READ", "DELIVERY_READ", "QUEUE_MANAGE"],
  DELIVERY_DRIVER: ["RESTAURANT_READ", "DELIVERY_READ"]
};

/** M8 boundaries remain absent from runnable navigation until real contracts exist. */
export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", status: "ready", roles: allRoles,
    requiredPermission: "RESTAURANT_READ", description: "Your restaurant workspace and available operations." },
  { id: "orders", label: "Orders", path: "/orders", status: "ready", roles: ["OWNER", "MANAGER", "STAFF"],
    requiredPermission: "ORDER_READ", description: "Current restaurant orders from the operations API." },
  { id: "menu", label: "Menu", path: "/menu", status: "ready", roles: ["OWNER", "MANAGER", "STAFF"],
    requiredPermission: "MENU_READ", description: "Restaurant products and availability." },
  { id: "shopping", label: "Shopping", path: "/shopping", status: "planned", roles: financialRoles,
    requiredPermission: null, description: "M8: persistent shopping catalog, daily purchases and inactivity suggestions." },
  { id: "sales-history", label: "Sales History", path: "/sales-history", status: "ready", roles: financialRoles,
    requiredPermission: "ORDER_READ", description: "Order history and historical item snapshots; accounting search and reconciliation await M8." },
  { id: "accounting", label: "Accounting", path: "/accounting", status: "planned", roles: financialRoles,
    requiredPermission: null, description: "M8: purchases, expenses, cashbook, suppliers, payables and audit history." },
  { id: "reports", label: "Reports", path: "/reports", status: "ready", roles: financialRoles,
    requiredPermission: "REPORT_READ", description: "Existing daily operations report; accounting revenue and profit are unavailable." },
  { id: "team", label: "Team", path: "/team", status: "ready", roles: ["OWNER"],
    requiredPermission: "MEMBERS_MANAGE", description: "Restaurant membership information." },
  { id: "settings", label: "Restaurant", path: "/settings", status: "ready", roles: ["OWNER", "MANAGER"],
    requiredPermission: "SETTINGS_MANAGE", description: "Restaurant configuration." },
  { id: "tables", label: "Tables & QR", path: "/tables", status: "ready", roles: ["OWNER", "MANAGER"],
    requiredPermission: "SETTINGS_MANAGE", description: "Tables and sensitive one-time QR generation." },
  { id: "queue", label: "Pickup queue", path: "/queue", status: "ready", roles: ["OWNER", "MANAGER", "STAFF"],
    requiredPermission: "QUEUE_MANAGE", description: "Current queue day and pickup calls." },
  { id: "notifications", label: "Updates", path: "/notifications", status: "ready", roles: allRoles,
    requiredPermission: "RESTAURANT_READ", description: "Your notifications for the configured restaurant." },
  { id: "deliveries", label: "Deliveries", path: "/deliveries", status: "ready", roles: allRoles,
    requiredPermission: "DELIVERY_READ", description: "Delivery operations; drivers see only their assigned tasks." },
  { id: "profile", label: "Profile", path: "/profile", status: "ready", roles: allRoles,
    requiredPermission: "RESTAURANT_READ", description: "Your signed-in account, restaurant membership and sign out." }
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Membership = Readonly<MyRestaurantResponse> | null | undefined;

/** Input must originate from getConfiguredMembership(), never Auth metadata or a role picker. */
export function getValidatedRole(membership: Membership, configuredRestaurantId: string): OperationsRole | null {
  if (!membership || membership.active !== true || typeof configuredRestaurantId !== "string"
      || !uuidPattern.test(configuredRestaurantId) || typeof membership.restaurantId !== "string"
      || membership.restaurantId.toLowerCase() !== configuredRestaurantId.toLowerCase()
      || !OPERATIONS_ROLES.includes(membership.role as OperationsRole)) return null;
  return membership.role as OperationsRole;
}

export function getNavigationItems(membership: Membership, configuredRestaurantId: string): readonly NavigationItem[] {
  const role = getValidatedRole(membership, configuredRestaurantId);
  if (!role) return [];
  return NAVIGATION_ITEMS.filter(item => item.status === "ready" && item.roles.includes(role)
    && item.requiredPermission !== null && rolePermissions[role].includes(item.requiredPermission));
}

/** Architecture metadata only; these items must never become runnable links in M7. */
export function getPlannedNavigationItems(membership: Membership, configuredRestaurantId: string): readonly NavigationItem[] {
  const role = getValidatedRole(membership, configuredRestaurantId);
  return role ? NAVIGATION_ITEMS.filter(item => item.status === "planned" && item.roles.includes(role)) : [];
}

/** Apply the same policy to direct/deep-link routes, not only the visible menu. */
export function canAccessScreen(screenId: string, membership: Membership, configuredRestaurantId: string): boolean {
  return getNavigationItems(membership, configuredRestaurantId).some(item => item.id === screenId);
}
