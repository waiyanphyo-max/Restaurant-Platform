// Shared type definitions for the responsive workspace.
export type View = "overview" | "orders" | "staff-order" | "queue" | "deliveries" | "reports" | "menu" | "tables" | "settings" | "zones" | "members" | "restaurant" | "storefront" | "table-order" | "profile" | "addresses" | "my-orders" | "notifications" | "devices" | "queue-track" | "api" | "create";

// Backend response payloads are currently defensive because some endpoints return different DTO shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type Membership = { id: string; name: string; role: string };
