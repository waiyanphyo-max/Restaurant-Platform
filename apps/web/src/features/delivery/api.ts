// Typed delivery API surface. Implementations remain centralized in lib/api for backwards compatibility.
export { listDeliveries, updateDeliveryStatus, assignDeliveryDriver, getDefaultDeliveryDriver, setDefaultDeliveryDriver } from "@/lib/api";
export type { DeliveryTask, DefaultDeliveryDriverResponse } from "@/lib/api";
