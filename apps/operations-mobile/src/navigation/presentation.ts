import type { NavigationItem, OperationsRole, ScreenId } from "./policy";

export type PrimaryDestination = ScreenId | "more";
export interface WorkspaceNavigation {
  primary: PrimaryDestination[];
  groups: { id: "operations" | "management" | "finance" | "account"; items: readonly NavigationItem[] }[];
}

/** Partition only already-authorized items; this presentation helper grants no access. */
export function workspaceNavigation(items: readonly NavigationItem[], role: OperationsRole): WorkspaceNavigation {
  const primary: PrimaryDestination[] = role === "DELIVERY_DRIVER"
    ? ["deliveries", "dashboard", "notifications", "profile"].filter(id => items.some(item => item.id === id)) as ScreenId[]
    : ["dashboard", "orders", "deliveries"].filter(id => items.some(item => item.id === id)) as ScreenId[];
  if (role !== "DELIVERY_DRIVER" && items.length) primary.push("more");
  const groupFor = (item: NavigationItem) => item.requiredPermission === "FINANCE_READ" ? "finance"
    : ["menu", "tables", "settings", "team"].includes(item.id) ? "management"
    : ["profile", "notifications"].includes(item.id) ? "account" : "operations";
  return { primary, groups: (["operations", "management", "finance", "account"] as const)
    .map(id => ({ id, items: items.filter(item => groupFor(item) === id) })).filter(group => group.items.length > 0) };
}

export function primarySelected(destination: PrimaryDestination, pathname: string, moreOpen: boolean): boolean {
  if (moreOpen) return destination === "more";
  if (destination === "orders") return pathname === "/orders" || pathname.startsWith("/order/");
  if (destination === "deliveries") return pathname === "/deliveries" || pathname.startsWith("/delivery/");
  if (destination === "more") return !["/dashboard", "/orders", "/deliveries"].includes(pathname)
    && !pathname.startsWith("/order/") && !pathname.startsWith("/delivery/");
  return pathname === `/${destination}`;
}
