import type {
  AssignedDeliveryDetailDto, AssignDeliveryDriverRequest, CreateDeliveryOrderRequest, CreateOrderResponse,
  CreateQrOrderRequest, CreateStaffOrderRequest, CreateStaffOrderResponse,
  CustomerAddressRequest, CustomerAddressResponse, CustomerProfileRequest,
  CustomerProfileResponse, DeliveryTaskDto, DeliveryZoneDto, ManagerOrderDetailDto,
  CategoryResponse, DailyOperationsReportResponse, PaymentResponse, ProductManagementResponse,
  RestaurantMemberResponse, RestaurantSettingsResponse, StaffOrderOptions,
  MyRestaurantResponse, NotificationResponse, OrderSummaryDto, PlatformOverviewResponse,
  PlatformRestaurantSummaryResponse, PlatformRestaurantDetailResponse,
  PlatformRestaurantProvisionRequest, PlatformRestaurantProvisionResponse,
  PlatformRestaurantConfigurationRequest, PlatformRestaurantStatusRequest,
  PublicMenuResponse, PublicModifierGroupResponse,
  QueueTicketManagerDto, QueueTrackingResponse, RestaurantResponse, SpringPage,
  UpdateDeliveryStatusRequest, UpdateOrderStatusRequest
} from "@restaurant-platform/shared-types";
import type {
  CategoryRequest, ProductRequest, ProductVariantRequest, ProductVariantResponse,
  ModifierGroupRequest, ModifierGroupResponse, ModifierOptionRequest, ModifierOptionResponse,
  UpdateRestaurantRequest, RestaurantLogoResponse, RestaurantSettingsRequest, CommonQrTokenResponse,
  DiningTableRequest, DiningTableResponse, DiningTableQrTokenResponse, InviteRestaurantMemberRequest,
  RestaurantMemberRequest, TransferRestaurantOwnershipRequest, TransferRestaurantOwnershipResponse,
  DeliveryZoneRequest, DeliveryZoneResponse, DefaultDeliveryDriverResponse, DeliveryAssignmentOption
} from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError, TenantAccessError } from "./errors.js";
import { requireHeaderValue, requireUuid } from "./tenant.js";
import { createTransport, createAuthenticatedTransport } from "./transport.js";
import type { ApiRequestOptions, ApiTransportOptions, AuthenticatedApiTransportOptions, ApiTransport } from "./transport.js";

export interface PublicRestaurantApiClientOptions extends ApiTransportOptions { restaurantId: string; }
export interface RestaurantMemberApiClientOptions extends AuthenticatedApiTransportOptions { restaurantId: string; }
export interface CustomerApiClientOptions extends AuthenticatedApiTransportOptions { restaurantId: string; }
export interface PageQuery { page?: number; size?: number; status?: string; }
export interface PlatformRestaurantQuery { page?: number; size?: number; search?: string; }

function pageQuery(query: PageQuery) {
  const page = query.page ?? 0, size = query.size ?? 20;
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) {
    throw new ApiConfigurationError("page must be nonnegative and size must be from 1 to 100");
  }
  return { page, size, status: query.status };
}

function read<T>(transport: ApiTransport, path: string, options?: ApiRequestOptions,
  query?: Record<string, string | number | undefined>): Promise<T> {
  return transport.request({ method: "GET", path, query, options, retryTransient: true });
}

function checkedRestaurantResponse<T>(value: T, expected: string, key: "restaurantId" | "id"): T {
  const actual = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  if (typeof actual !== "string" || actual.toLowerCase() !== expected) throw new ApiProtocolError();
  return value;
}

function reportDateQuery(date?: string): { date?: string } {
  if (date === undefined) return {};
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ApiConfigurationError("Report date must be a valid YYYY-MM-DD calendar date");
  }
  // Spring applies the restaurant timezone and rejects future report dates.
  return { date };
}

/** No session provider is accepted: every request omits cookies and bearer credentials. */
export function createPublicRestaurantApiClient(options: PublicRestaurantApiClientOptions) {
  const restaurantId = requireUuid(options.restaurantId, "restaurantId");
  const transport = createTransport(options);
  const prefix = `/api/v1/public/restaurants/${restaurantId}`;
  const queuePath = (ticketId: string) => `/api/v1/public/queue-tickets/${requireUuid(ticketId, "ticketId")}`;
  const queueHeaders = (token: string) => ({ "X-Queue-Token": requireHeaderValue(token, "X-Queue-Token") });
  function qr(kind: string, body: CreateQrOrderRequest, key?: string, requestOptions?: ApiRequestOptions): Promise<CreateOrderResponse> {
    const headers = key === undefined ? undefined : { "Idempotency-Key": requireHeaderValue(key, "Idempotency-Key") };
    return transport.request({ method: "POST", path: `${prefix}/orders/${kind}`, body, headers,
      options: requestOptions, retryTransient: headers !== undefined });
  }
  return {
    restaurantId,
    getPublicMenu: async (o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<PublicMenuResponse>(transport, `${prefix}/menu`, o), restaurantId, "restaurantId"),
    getProductModifierGroups: (id: string, o?: ApiRequestOptions) =>
      read<PublicModifierGroupResponse[]>(transport, `${prefix}/products/${requireUuid(id, "productId")}/modifier-groups`, o),
    createCommonQrOrder: (body: CreateQrOrderRequest, key?: string, o?: ApiRequestOptions) => qr("common-qr", body, key, o),
    createTableQrOrder: (body: CreateQrOrderRequest, key?: string, o?: ApiRequestOptions) => qr("table-qr", body, key, o),
    getQueueStatus: (id: string, token: string, o?: ApiRequestOptions): Promise<QueueTrackingResponse> =>
      transport.request({ method: "GET", path: `${queuePath(id)}/status`, headers: queueHeaders(token), options: o, retryTransient: true }),
    getQueueNotifications: (id: string, token: string, o?: ApiRequestOptions): Promise<NotificationResponse[]> =>
      transport.request({ method: "GET", path: `${queuePath(id)}/notifications`, headers: queueHeaders(token), options: o, retryTransient: true }),
    markQueueNotificationRead: (id: string, notificationId: string, token: string, o?: ApiRequestOptions): Promise<NotificationResponse> =>
      transport.request({ method: "PATCH", path: `${queuePath(id)}/notifications/${requireUuid(notificationId, "notificationId")}/read`,
        headers: queueHeaders(token), options: o })
  };
}

/** The backend UUID allowlist authorizes access; no frontend role claim grants it. */
export function createPlatformAdminApiClient(options: AuthenticatedApiTransportOptions) {
  const transport = createAuthenticatedTransport(options);
  const prefix = "/api/v1/platform/restaurants";
  const restaurantPath = (id: string) => `${prefix}/${requireUuid(id, "restaurantId")}`;
  function checkedDetail(value: PlatformRestaurantDetailResponse, id: string) {
    checkedRestaurantResponse(value?.restaurant, requireUuid(id, "restaurantId"), "id");
    return value;
  }
  return {
    getOverview: (o?: ApiRequestOptions) => read<PlatformOverviewResponse>(transport, "/api/v1/platform/overview", o),
    listRestaurants(query: PlatformRestaurantQuery = {}, o?: ApiRequestOptions): Promise<SpringPage<PlatformRestaurantSummaryResponse>> {
      const { page, size } = pageQuery(query);
      return read(transport, prefix, o, { page, size, search: query.search ?? "" });
    },
    async getRestaurant(id: string, o?: ApiRequestOptions): Promise<PlatformRestaurantDetailResponse> {
      return checkedDetail(await read(transport, restaurantPath(id), o), id);
    },
    async provisionRestaurant(body: PlatformRestaurantProvisionRequest, o?: ApiRequestOptions): Promise<PlatformRestaurantProvisionResponse> {
      if (body.ownerUserId != null) requireUuid(body.ownerUserId, "ownerUserId");
      const response = await transport.request<PlatformRestaurantProvisionResponse>({ method: "POST", path: prefix, body, options: o });
      // Fail closed against an older backend that still returns reusable QR credentials.
      if (response?.commonQrToken != null || response?.commonQrUrl != null || !response?.restaurant?.id || !response.ownerUserId) {
        throw new ApiProtocolError();
      }
      try {
        requireUuid(response.restaurant.id, "restaurantId");
        requireUuid(response.ownerUserId, "ownerUserId");
      } catch { throw new ApiProtocolError(); }
      if (body.ownerUserId && response.ownerUserId.toLowerCase() !== body.ownerUserId.toLowerCase()) throw new ApiProtocolError();
      return response;
    },
    async updateRestaurantStatus(id: string, body: PlatformRestaurantStatusRequest, o?: ApiRequestOptions): Promise<PlatformRestaurantDetailResponse> {
      return checkedDetail(await transport.request({ method: "PATCH", path: `${restaurantPath(id)}/status`, body, options: o }), id);
    },
    async updateRestaurantConfiguration(id: string, body: PlatformRestaurantConfigurationRequest, o?: ApiRequestOptions): Promise<PlatformRestaurantDetailResponse> {
      return checkedDetail(await transport.request({ method: "PUT", path: `${restaurantPath(id)}/configuration`, body, options: o }), id);
    },
  };
}

/** One configured restaurant; Spring validates membership and permissions for each request. */
export function createRestaurantMemberApiClient(options: RestaurantMemberApiClientOptions) {
  const restaurantId = requireUuid(options.restaurantId, "restaurantId");
  const transport = createAuthenticatedTransport(options);
  const prefix = `/api/v1/restaurants/${restaurantId}`;
  const orderPath = (id: string) => `${prefix}/orders/${requireUuid(id, "orderId")}`;
  const deliveryPath = (id: string) => `${prefix}/deliveries/${requireUuid(id, "deliveryId")}`;
  const productPath = (id: string) => `${prefix}/products/${requireUuid(id, "productId")}`;
  const groupPath = (id: string) => `${prefix}/modifier-groups/${requireUuid(id, "groupId")}`;
  const tablePath = (id: string) => `${prefix}/tables/${requireUuid(id, "tableId")}`;
  const memberPath = (id: string) => `${prefix}/members/${requireUuid(id, "memberId")}`;
  const write = <T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, o?: ApiRequestOptions): Promise<T> =>
    transport.request({ method, path, body, options: o });
  const upload = <T>(path: string, multipartBody: FormData, o?: ApiRequestOptions): Promise<T> =>
    transport.request({ method: "POST", path, multipartBody, options: o });
  return {
    restaurantId,
    async getConfiguredMembership(o?: ApiRequestOptions): Promise<MyRestaurantResponse> {
      const memberships = await read<MyRestaurantResponse[]>(transport, "/api/v1/my/restaurants", o);
      if (!Array.isArray(memberships) || memberships.some(item => !item || typeof item.restaurantId !== "string" || typeof item.active !== "boolean")) {
        throw new ApiProtocolError();
      }
      const match = memberships.find(item => item.restaurantId.toLowerCase() === restaurantId && item.active);
      if (!match) throw new TenantAccessError();
      return match;
    },
    getRestaurant: async (o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<RestaurantResponse>(transport, prefix, o), restaurantId, "id"),
    getDailyReport: async (date?: string, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<DailyOperationsReportResponse>(transport, `${prefix}/reports/daily`, o, reportDateQuery(date)), restaurantId, "restaurantId"),
    listProducts: (o?: ApiRequestOptions) => read<ProductManagementResponse[]>(transport, `${prefix}/products`, o),
    listCategories: (o?: ApiRequestOptions) => read<CategoryResponse[]>(transport, `${prefix}/categories`, o),
    async listMembers(o?: ApiRequestOptions): Promise<RestaurantMemberResponse[]> {
      const members = await read<RestaurantMemberResponse[]>(transport, `${prefix}/members`, o);
      if (!Array.isArray(members)) throw new ApiProtocolError();
      return members.map(member => checkedRestaurantResponse(member, restaurantId, "restaurantId"));
    },
    getSettings: async (o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<RestaurantSettingsResponse>(transport, `${prefix}/settings`, o), restaurantId, "restaurantId"),
    updateRestaurantProfile: async (body: UpdateRestaurantRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<RestaurantResponse>("PUT", `${prefix}/profile`, body, o), restaurantId, "id"),
    uploadRestaurantLogo: async (formData: FormData, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await upload<RestaurantLogoResponse>(`${prefix}/logo`, formData, o), restaurantId, "restaurantId"),
    updateSettings: async (body: RestaurantSettingsRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<RestaurantSettingsResponse>("PUT", `${prefix}/settings`, body, o), restaurantId, "restaurantId"),
    rotateCommonQrToken: async (o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<CommonQrTokenResponse>("POST", `${prefix}/settings/common-qr-token/rotate`, undefined, o), restaurantId, "restaurantId"),
    listTables: async (o?: ApiRequestOptions) => (await read<DiningTableResponse[]>(transport, `${prefix}/tables`, o))
      .map(table => checkedRestaurantResponse(table, restaurantId, "restaurantId")),
    createTable: (body: DiningTableRequest, o?: ApiRequestOptions) => write<DiningTableQrTokenResponse>("POST", `${prefix}/tables`, body, o),
    updateTable: async (id: string, body: DiningTableRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<DiningTableResponse>("PUT", tablePath(id), body, o), restaurantId, "restaurantId"),
    rotateTableQrToken: (id: string, o?: ApiRequestOptions) => write<DiningTableQrTokenResponse>("POST", `${tablePath(id)}/qr-token/rotate`, undefined, o),
    inviteMember: async (body: InviteRestaurantMemberRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<RestaurantMemberResponse>("POST", `${prefix}/members/invitations`, body, o), restaurantId, "restaurantId"),
    updateMember: async (id: string, body: RestaurantMemberRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<RestaurantMemberResponse>("PUT", memberPath(id), { ...body, userId: requireUuid(body.userId, "userId") }, o), restaurantId, "restaurantId"),
    removeMember: (id: string, o?: ApiRequestOptions) => write<void>("DELETE", memberPath(id), undefined, o),
    transferOwnership: async (body: TransferRestaurantOwnershipRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<TransferRestaurantOwnershipResponse>("POST", `${prefix}/members/transfer-ownership`,
        { newOwnerUserId: requireUuid(body.newOwnerUserId, "newOwnerUserId") }, o), restaurantId, "restaurantId"),
    createCategory: (body: CategoryRequest, o?: ApiRequestOptions) => write<CategoryResponse>("POST", `${prefix}/categories`, body, o),
    updateCategory: (id: string, body: CategoryRequest, o?: ApiRequestOptions) => write<CategoryResponse>("PUT", `${prefix}/categories/${requireUuid(id, "categoryId")}`, body, o),
    createProduct: (body: ProductRequest, o?: ApiRequestOptions) => write<ProductManagementResponse>("POST", `${prefix}/products`,
      { ...body, categoryId: requireUuid(body.categoryId, "categoryId") }, o),
    updateProduct: (id: string, body: ProductRequest, o?: ApiRequestOptions) => write<ProductManagementResponse>("PUT", productPath(id),
      { ...body, categoryId: requireUuid(body.categoryId, "categoryId") }, o),
    listVariants: (id: string, o?: ApiRequestOptions) => read<ProductVariantResponse[]>(transport, `${productPath(id)}/variants`, o),
    createVariant: (id: string, body: ProductVariantRequest, o?: ApiRequestOptions) => write<ProductVariantResponse>("POST", `${productPath(id)}/variants`, body, o),
    updateVariant: (id: string, variantId: string, body: ProductVariantRequest, o?: ApiRequestOptions) => write<ProductVariantResponse>("PUT", `${productPath(id)}/variants/${requireUuid(variantId, "variantId")}`, body, o),
    listModifierGroups: (o?: ApiRequestOptions) => read<ModifierGroupResponse[]>(transport, `${prefix}/modifier-groups`, o),
    createModifierGroup: (body: ModifierGroupRequest, o?: ApiRequestOptions) => write<ModifierGroupResponse>("POST", `${prefix}/modifier-groups`, body, o),
    updateModifierGroup: (id: string, body: ModifierGroupRequest, o?: ApiRequestOptions) => write<ModifierGroupResponse>("PUT", groupPath(id), body, o),
    createModifierOption: (id: string, body: ModifierOptionRequest, o?: ApiRequestOptions) => write<ModifierOptionResponse>("POST", `${groupPath(id)}/options`, body, o),
    updateModifierOption: (id: string, optionId: string, body: ModifierOptionRequest, o?: ApiRequestOptions) => write<ModifierOptionResponse>("PUT", `${groupPath(id)}/options/${requireUuid(optionId, "optionId")}`, body, o),
    getProductModifierGroups: (id: string, o?: ApiRequestOptions) => read<ModifierGroupResponse[]>(transport, `${productPath(id)}/modifier-groups`, o),
    linkProductModifierGroup: (id: string, groupId: string, o?: ApiRequestOptions) => write<void>("PUT", `${productPath(id)}/modifier-groups/${requireUuid(groupId, "groupId")}`, undefined, o),
    unlinkProductModifierGroup: (id: string, groupId: string, o?: ApiRequestOptions) => write<void>("DELETE", `${productPath(id)}/modifier-groups/${requireUuid(groupId, "groupId")}`, undefined, o),
    uploadProductImage: (id: string, formData: FormData, o?: ApiRequestOptions) => upload<ProductManagementResponse>(`${productPath(id)}/image`, formData, o),
    uploadVariantImage: (id: string, variantId: string, formData: FormData, o?: ApiRequestOptions) => upload<ProductVariantResponse>(`${productPath(id)}/variants/${requireUuid(variantId, "variantId")}/image`, formData, o),
    listDeliveryZones: async (o?: ApiRequestOptions) => (await read<DeliveryZoneResponse[]>(transport, `${prefix}/delivery-zones`, o))
      .map(zone => checkedRestaurantResponse(zone, restaurantId, "restaurantId")),
    createDeliveryZone: async (body: DeliveryZoneRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<DeliveryZoneResponse>("POST", `${prefix}/delivery-zones`, body, o), restaurantId, "restaurantId"),
    updateDeliveryZone: async (id: string, body: DeliveryZoneRequest, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<DeliveryZoneResponse>("PUT", `${prefix}/delivery-zones/${requireUuid(id, "zoneId")}`, body, o), restaurantId, "restaurantId"),
    getDefaultDriver: async (o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<DefaultDeliveryDriverResponse>(transport, `${prefix}/delivery-settings/default-driver`, o), restaurantId, "restaurantId"),
    setDefaultDriver: async (body: { driverUserId: string }, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await write<DefaultDeliveryDriverResponse>("PATCH", `${prefix}/delivery-settings/default-driver`,
        { driverUserId: requireUuid(body.driverUserId, "driverUserId") }, o), restaurantId, "restaurantId"),
    listDeliveryAssignmentOptions: (o?: ApiRequestOptions) => read<DeliveryAssignmentOption[]>(transport, `${prefix}/delivery-settings/assignment-options`, o),
    listNotifications: (status?: string, o?: ApiRequestOptions) => read<NotificationResponse[]>(transport, `${prefix}/notifications`, o, { status }),
    markNotificationRead: (id: string, o?: ApiRequestOptions) => write<NotificationResponse>("PATCH", `${prefix}/notifications/${requireUuid(id, "notificationId")}/read`, undefined, o),
    collectPayment: async (id: string, paymentId: string, o?: ApiRequestOptions) => {
      const payment = await write<PaymentResponse>("PATCH", `${orderPath(id)}/payments/${requireUuid(paymentId, "paymentId")}/collect`, undefined, o);
      if (payment?.orderId?.toLowerCase() !== requireUuid(id, "orderId") || payment?.id?.toLowerCase() !== requireUuid(paymentId, "paymentId")) throw new ApiProtocolError();
      return payment;
    },
    async listOrderPayments(id: string, o?: ApiRequestOptions): Promise<PaymentResponse[]> {
      const orderId = requireUuid(id, "orderId");
      const payments = await read<PaymentResponse[]>(transport, `${orderPath(orderId)}/payments`, o);
      if (!Array.isArray(payments) || payments.some(payment => !payment || typeof payment.orderId !== "string"
          || payment.orderId.toLowerCase() !== orderId)) throw new ApiProtocolError();
      return payments;
    },
    listOrders: (q: PageQuery = {}, o?: ApiRequestOptions) => read<SpringPage<OrderSummaryDto>>(transport, `${prefix}/orders`, o, pageQuery(q)),
    getOrder: async (id: string, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<ManagerOrderDetailDto>(transport, orderPath(id), o), restaurantId, "restaurantId"),
    updateOrderStatus: (id: string, body: UpdateOrderStatusRequest, o?: ApiRequestOptions): Promise<OrderSummaryDto> =>
      transport.request({ method: "PATCH", path: `${orderPath(id)}/status`, body, options: o }),
    getStaffOrderOptions: (o?: ApiRequestOptions) => read<StaffOrderOptions>(transport, `${prefix}/orders/staff/options`, o),
    createStaffOrder: (body: CreateStaffOrderRequest, o?: ApiRequestOptions): Promise<CreateStaffOrderResponse> =>
      transport.request({ method: "POST", path: `${prefix}/orders/staff`, body, options: o }),
    listQueue: (status?: string, o?: ApiRequestOptions) => read<QueueTicketManagerDto[]>(transport, `${prefix}/queue-tickets`, o, { status }),
    callQueueTicket: (id: string, o?: ApiRequestOptions): Promise<QueueTicketManagerDto> =>
      transport.request({ method: "PATCH", path: `${prefix}/queue-tickets/${requireUuid(id, "ticketId")}/call`, options: o }),
    listDeliveries: (q: PageQuery = {}, o?: ApiRequestOptions) => read<SpringPage<DeliveryTaskDto>>(transport, `${prefix}/deliveries`, o, pageQuery(q)),
    listMyDeliveries: (q: PageQuery = {}, o?: ApiRequestOptions) => read<SpringPage<DeliveryTaskDto>>(transport, `${prefix}/deliveries/mine`, o, pageQuery(q)),
    getMyDelivery: (id: string, o?: ApiRequestOptions) => read<AssignedDeliveryDetailDto>(
      transport, `${prefix}/deliveries/mine/${requireUuid(id, "deliveryId")}`, o),
    getDelivery: (id: string, o?: ApiRequestOptions) => read<DeliveryTaskDto>(transport, deliveryPath(id), o),
    assignDriver: (id: string, body: AssignDeliveryDriverRequest, o?: ApiRequestOptions): Promise<DeliveryTaskDto> =>
      transport.request({ method: "PATCH", path: `${deliveryPath(id)}/assign`, body, options: o }),
    updateDeliveryStatus: (id: string, body: UpdateDeliveryStatusRequest, o?: ApiRequestOptions): Promise<DeliveryTaskDto> =>
      transport.request({ method: "PATCH", path: `${deliveryPath(id)}/status`, body, options: o })
  };
}

/** Account data is UUID-scoped; delivery requests use only the immutable configured restaurant. */
export function createCustomerApiClient(options: CustomerApiClientOptions) {
  const restaurantId = requireUuid(options.restaurantId, "restaurantId");
  const transport = createAuthenticatedTransport(options);
  const prefix = "/api/v1/customer";
  const addressPath = (id: string) => `${prefix}/addresses/${requireUuid(id, "addressId")}`;
  return {
    restaurantId,
    getProfile: (o?: ApiRequestOptions) => read<CustomerProfileResponse>(transport, `${prefix}/profile`, o),
    updateProfile: (body: CustomerProfileRequest, o?: ApiRequestOptions): Promise<CustomerProfileResponse> =>
      transport.request({ method: "PUT", path: `${prefix}/profile`, body, options: o }),
    listAddresses: (o?: ApiRequestOptions) => read<CustomerAddressResponse[]>(transport, `${prefix}/addresses`, o),
    createAddress: (body: CustomerAddressRequest, o?: ApiRequestOptions): Promise<CustomerAddressResponse> =>
      transport.request({ method: "POST", path: `${prefix}/addresses`, body, options: o }),
    updateAddress: (id: string, body: CustomerAddressRequest, o?: ApiRequestOptions): Promise<CustomerAddressResponse> =>
      transport.request({ method: "PUT", path: addressPath(id), body, options: o }),
    setDefaultAddress: (id: string, o?: ApiRequestOptions): Promise<CustomerAddressResponse> =>
      transport.request({ method: "PATCH", path: `${addressPath(id)}/default`, options: o }),
    deleteAddress: (id: string, o?: ApiRequestOptions): Promise<void> =>
      transport.request({ method: "DELETE", path: addressPath(id), options: o }),
    getDeliveryZones: (o?: ApiRequestOptions) => read<DeliveryZoneDto[]>(transport, `${prefix}/restaurants/${restaurantId}/delivery-zones`, o),
    createDeliveryOrder: (body: CreateDeliveryOrderRequest, o?: ApiRequestOptions): Promise<CreateOrderResponse> =>
      transport.request({ method: "POST", path: `${prefix}/restaurants/${restaurantId}/orders/delivery`, body, options: o })
  };
}
