import type { DeliveryTaskDto, ManagerOrderDetailDto, OrderSummaryDto, UpdateOrderStatusRequest } from "@restaurant-platform/shared-types";
export const ORDER_STATUSES = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as const;
export const DELIVERY_STATUSES = ["WAITING_ASSIGNMENT", "ASSIGNED", "PICKED_UP", "DELIVERED", "FAILED", "CANCELLED"] as const;
/** Mirrors ManagerOrderService. Delivery progress uses its own API for COD confirmation. */
export function orderActions(order: Pick<ManagerOrderDetailDto, "status" | "orderType">, role: string): UpdateOrderStatusRequest["status"][] {
  if (!["OWNER", "MANAGER", "STAFF"].includes(role)) return [];
  const next: UpdateOrderStatusRequest["status"][] = order.status === "PENDING" ? ["ACCEPTED"] : order.status === "ACCEPTED" ? ["PREPARING"] : order.status === "PREPARING" ? ["READY"] : order.status === "READY" && order.orderType !== "DELIVERY" ? ["COMPLETED"] : [];
  if (["OWNER", "MANAGER"].includes(role) && ["PENDING", "ACCEPTED", "PREPARING"].includes(order.status)) next.push("CANCELLED");
  return next;
}
export function deliveryActions(delivery: DeliveryTaskDto, role: string, userId: string): string[] {
  const management = ["OWNER", "MANAGER"].includes(role);
  if (!management && (!["STAFF", "DELIVERY_DRIVER"].includes(role) || delivery.driverUserId !== userId)) return [];
  const readyForPickup = delivery.status === "ASSIGNED" && delivery.orderStatus === "READY";
  const outForDelivery = delivery.status === "PICKED_UP" && delivery.orderStatus === "OUT_FOR_DELIVERY";
  const actions: string[] = [];
  if (readyForPickup) actions.push("PICKED_UP");
  if (outForDelivery) actions.push("DELIVERED");
  if (readyForPickup || outForDelivery) actions.push("FAILED");
  if (management && delivery.orderStatus === "READY" && ["WAITING_ASSIGNMENT", "ASSIGNED"].includes(delivery.status)) actions.push("CANCELLED");
  return actions;
}
export function canAssignDelivery(delivery: Pick<DeliveryTaskDto, "orderStatus" | "status">): boolean {
  if (delivery.orderStatus === "READY") {
    return ["WAITING_ASSIGNMENT", "ASSIGNED", "FAILED", "CANCELLED"].includes(delivery.status);
  }
  return delivery.orderStatus === "OUT_FOR_DELIVERY" && delivery.status === "FAILED";
}
export function searchOrders(orders: readonly OrderSummaryDto[], text: string, channel: string): OrderSummaryDto[] {
  const term = text.trim().toLowerCase();
  return orders.filter(order => (!term || `${order.orderNumber} ${order.id} ${order.orderType}`.toLowerCase().includes(term)) && (!channel || order.orderChannel === channel));
}
export function canCollectPayment(payment: { method: string; status: string }, orderStatus: string): boolean {
  return payment.method === "CASH_AT_COUNTER" && payment.status === "PENDING" && orderStatus !== "CANCELLED";
}
