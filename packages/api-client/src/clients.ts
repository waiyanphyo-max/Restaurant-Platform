import type {
  AssignDeliveryDriverRequest, CreateDeliveryOrderRequest, CreateOrderResponse,
  CreateQrOrderRequest, CreateStaffOrderRequest, CreateStaffOrderResponse,
  CustomerAddressRequest, CustomerAddressResponse, CustomerProfileRequest,
  CustomerProfileResponse, DeliveryTaskDto, DeliveryZoneDto, ManagerOrderDetailDto,
  MyRestaurantResponse, NotificationResponse, OrderSummaryDto, PlatformOverviewResponse,
  PlatformRestaurantSummaryResponse, PlatformRestaurantDetailResponse,
  PlatformRestaurantProvisionRequest, PlatformRestaurantProvisionResponse,
  PlatformRestaurantConfigurationRequest, PlatformRestaurantStatusRequest,
  PublicMenuResponse, PublicModifierGroupResponse,
  QueueTicketManagerDto, QueueTrackingResponse, RestaurantResponse, SpringPage,
  UpdateDeliveryStatusRequest, UpdateOrderStatusRequest
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
    listOrders: (q: PageQuery = {}, o?: ApiRequestOptions) => read<SpringPage<OrderSummaryDto>>(transport, `${prefix}/orders`, o, pageQuery(q)),
    getOrder: async (id: string, o?: ApiRequestOptions) => checkedRestaurantResponse(
      await read<ManagerOrderDetailDto>(transport, orderPath(id), o), restaurantId, "restaurantId"),
    updateOrderStatus: (id: string, body: UpdateOrderStatusRequest, o?: ApiRequestOptions): Promise<OrderSummaryDto> =>
      transport.request({ method: "PATCH", path: `${orderPath(id)}/status`, body, options: o }),
    createStaffOrder: (body: CreateStaffOrderRequest, o?: ApiRequestOptions): Promise<CreateStaffOrderResponse> =>
      transport.request({ method: "POST", path: `${prefix}/orders/staff`, body, options: o }),
    listQueue: (status?: string, o?: ApiRequestOptions) => read<QueueTicketManagerDto[]>(transport, `${prefix}/queue-tickets`, o, { status }),
    callQueueTicket: (id: string, o?: ApiRequestOptions): Promise<QueueTicketManagerDto> =>
      transport.request({ method: "PATCH", path: `${prefix}/queue-tickets/${requireUuid(id, "ticketId")}/call`, options: o }),
    listDeliveries: (q: PageQuery = {}, o?: ApiRequestOptions) => read<SpringPage<DeliveryTaskDto>>(transport, `${prefix}/deliveries`, o, pageQuery(q)),
    listMyDeliveries: (q: PageQuery = {}, o?: ApiRequestOptions) => read<SpringPage<DeliveryTaskDto>>(transport, `${prefix}/deliveries/mine`, o, pageQuery(q)),
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
