import type { CreateOrderItemRequest, IsoDateTime, Uuid } from "./api.js";

export interface OrderSummaryDto {
  id: Uuid;
  orderNumber: string;
  orderType: string;
  orderChannel: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  createdAt: IsoDateTime;
}

export interface OrderItemModifierDto {
  id: Uuid;
  modifierOptionId: Uuid;
  name: string;
  additionalPrice: number;
  quantity: number;
}

export interface OrderItemDetailDto {
  id: Uuid;
  productId: Uuid;
  variantId: Uuid | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  specialInstruction: string | null;
  modifiers: OrderItemModifierDto[];
}

export interface OrderStatusHistoryDto {
  id: Uuid;
  status: string;
  changedByUserId: Uuid | null;
  note: string | null;
  createdAt: IsoDateTime;
}

export interface ManagerOrderDetailDto {
  id: Uuid;
  restaurantId: Uuid;
  orderNumber: string;
  customerId: Uuid | null;
  createdByUserId: Uuid | null;
  tableId: Uuid | null;
  queueTicketId: Uuid | null;
  deliveryZoneId: Uuid | null;
  orderType: string;
  orderChannel: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  deliveryName: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  items: OrderItemDetailDto[];
  statusHistory: OrderStatusHistoryDto[];
}

export interface CreateStaffOrderRequest {
  orderType: "DINE_IN" | "TAKEAWAY";
  tableId?: Uuid | null;
  items: CreateOrderItemRequest[];
  note?: string | null;
}

export interface CreateStaffOrderResponse {
  orderId: Uuid;
  orderNumber: string;
  orderType: string;
  orderChannel: string;
  status: string;
  currency: string;
  subtotal: number;
  totalAmount: number;
  queueTicketId: Uuid | null;
  queueNumber: number | null;
  queueDisplayCode: string | null;
  paymentStatus: string;
}

export interface UpdateOrderStatusRequest {
  status: "ACCEPTED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";
  note?: string | null;
}

export interface QueueTicketManagerDto {
  ticketId: Uuid;
  queueNumber: number;
  displayCode: string;
  status: string;
  createdAt: IsoDateTime;
  readyAt: IsoDateTime | null;
  calledAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

export interface DeliveryTaskDto {
  id: Uuid;
  orderId: Uuid;
  orderNumber: string;
  orderStatus: string;
  status: string;
  driverUserId: Uuid | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  totalAmount: number;
  assignedAt: IsoDateTime | null;
  pickedUpAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  failureReason: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AssignDeliveryDriverRequest {
  driverUserId: Uuid;
  note?: string | null;
}

export interface UpdateDeliveryStatusRequest {
  status: string;
  failureReason?: string | null;
  note?: string | null;
  cashCollected?: boolean | null;
}
