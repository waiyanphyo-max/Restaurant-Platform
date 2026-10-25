import type { Row } from "@/types/workspace";

export const rid = (id: string, suffix: string) => "/api/v1/restaurants/" + encodeURIComponent(id) + (suffix ? "/" + suffix.replace(/^\/+/, "") : "");
export const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : (Array.isArray(record(value).content) ? record(value).content.map(record) : Array.isArray(record(value).items) ? record(value).items.map(record) : Array.isArray(record(value).data) ? record(value).data.map(record) : []);
export const label = (row: Row) => String(row.name || row.fullName || row.orderNumber || row.displayCode || row.tableNumber || row.label || row.email || row.id || "Record");
export const asMoney = (value: unknown, currency = "MMK") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "MMK", maximumFractionDigits: 0 }).format(Number(value || 0));
export const messageOf = (payload: unknown, fallback: string) => String(record(payload).message || record(payload).error || fallback);

export function nextStates(status: string, type: string): string[] {
  if (status === "PENDING") return ["ACCEPTED", "CANCELLED"];
  if (status === "ACCEPTED") return ["PREPARING", "CANCELLED"];
  if (status === "PREPARING") return ["READY", "CANCELLED"];
  if (status === "READY") return type === "DELIVERY" ? ["OUT_FOR_DELIVERY"] : ["COMPLETED"];
  if (status === "OUT_FOR_DELIVERY") return ["COMPLETED"];
  return [];
}

export function nextDeliveryStates(status: string): string[] {
  if (status === "ASSIGNED") return ["PICKED_UP", "CANCELLED"];
  if (status === "PICKED_UP") return ["DELIVERED", "FAILED"];
  if (status === "FAILED") return ["ASSIGNED"];
  if (status === "WAITING_ASSIGNMENT") return ["ASSIGNED"];
  return [];
}
