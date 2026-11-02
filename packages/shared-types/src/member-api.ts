import type { CreateOrderItemRequest, IsoDateTime, Uuid } from "./api.js";

/** Existing Java wire contract; order totals and collected payments use different time windows. */
export interface DailyOperationsReportResponse {
  restaurantId: Uuid;
  reportDate: string;
  timezone: string;
  totalOrders: number;
  pendingOrders: number;
  acceptedOrders: number;
  preparingOrders: number;
  readyOrders: number;
  outForDeliveryOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  orderAmountExcludingCancelled: number;
  paidAmount: number;
}

/** Existing menu/category records, not inventory valuation or a purchase catalog. */
export interface CategoryResponse {
  id: Uuid;
  name: string;
  displayOrder: number;
  active: boolean;
}

export interface ProductManagementResponse {
  id: Uuid;
  categoryId: Uuid;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  trackStock: boolean;
  stockQuantity: number | null;
  available: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface RestaurantMemberResponse {
  id: Uuid;
  restaurantId: Uuid;
  userId: Uuid;
  email: string | null;
  fullName: string | null;
  role: string;
  createdAt: IsoDateTime;
}

/** GET settings omits the common QR secret. */
export interface RestaurantSettingsResponse {
  restaurantId: Uuid;
  currency: string;
  timezone: string;
  minimumOrder: number;
  defaultDeliveryFee: number;
  acceptsOrders: boolean;
  allowQrOrder: boolean;
  allowDelivery: boolean;
  allowTakeaway: boolean;
  defaultDeliveryDriverUserId: Uuid | null;
}

export interface PaymentResponse {
  id: Uuid;
  orderId: Uuid;
  method: string;
  status: string;
  amount: number;
  paidAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

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
