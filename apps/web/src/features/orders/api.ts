// Typed order/report API surface. Implementations remain centralized in lib/api for backwards compatibility.
export { listOrders, updateOrderStatus, getDailyOperationsReport } from "@/lib/api";
export type { OrderSummary, Page, DailyOperationsReport } from "@/lib/api";
