/** Wire DTOs mirrored from the existing Spring Boot records. See docs/api.md. */
export type Uuid = string;
export type IsoDateTime = string;

export interface MenuModifierOptionDto {
  id: Uuid;
  name: string;
  additionalPrice: number;
  available: boolean;
}

export interface MenuModifierGroupDto {
  id: Uuid;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: MenuModifierOptionDto[];
}

export interface MenuVariantDto {
  id: Uuid;
  name: string;
  price: number | null;
  imageUrl: string | null;
  available: boolean;
}

export interface MenuProductDto {
  id: Uuid;
  name: string;
  description: string | null;
  price: number | null;
  imageUrl: string | null;
  available: boolean;
  trackStock: boolean;
  stockQuantity: number | null;
  variants: MenuVariantDto[];
  modifierGroups: MenuModifierGroupDto[];
}

export interface MenuCategoryDto {
  id: Uuid;
  name: string;
  displayOrder: number;
  products: MenuProductDto[];
}

export interface PublicMenuResponse {
  restaurantId: Uuid;
  restaurantName: string;
  slug: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  currency: string;
  categories: MenuCategoryDto[];
}

export interface ModifierSelectionRequest {
  modifierOptionId: Uuid;
  quantity: number;
}

export interface CreateOrderItemRequest {
  productId: Uuid;
  variantId?: Uuid | null;
  quantity: number;
  specialInstruction?: string | null;
  modifiers?: ModifierSelectionRequest[] | null;
}

export interface CreateQrOrderRequest {
  qrToken: string;
  items: CreateOrderItemRequest[];
}

export interface QueueInfo {
  ticketId: Uuid;
  queueNumber: number;
  displayCode: string;
  status: string;
  trackingToken: string;
}

export interface CreateOrderResponse {
  orderId: Uuid;
  orderNumber: string;
  orderType: string;
  orderChannel: string;
  status: string;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  queue: QueueInfo | null;
}

export interface QueueTrackingResponse {
  ticketId: Uuid;
  queueNumber: number;
  displayCode: string;
  queueStatus: string;
  orderNumber: string;
  orderStatus: string;
  createdAt: IsoDateTime;
  readyAt: IsoDateTime | null;
  calledAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
}

export interface MyRestaurantResponse {
  restaurantId: Uuid;
  name: string;
  slug: string | null;
  role: string;
  active: boolean;
}
