export type OrderSummary = {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | string;
  orderChannel: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  createdAt: string;
};

export type Page<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function listOrders(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  pageIndex = 0,
  status = "",
  pageSize = 20,
): Promise<Page<OrderSummary>> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  const normalizedRestaurantId = restaurantId.trim();
  const token = accessToken.trim();

  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!normalizedRestaurantId) throw new ApiError("Enter the restaurant ID.");
  if (!token) throw new ApiError("Enter a Supabase access token.");

  const safePage = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0;
  const safeSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.floor(pageSize)))
    : 20;
  const query = new URLSearchParams({
    page: String(safePage),
    size: String(safeSize),
  });
  const normalizedStatus = status.trim();
  if (normalizedStatus) query.set("status", normalizedStatus);

  let response: Response;
  try {
    response = await fetch(
      `${base}/api/v1/restaurants/${encodeURIComponent(normalizedRestaurantId)}/orders?${query.toString()}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
  } catch {
    throw new ApiError("Cannot reach the backend. Check the API URL and CORS configuration.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError("Authentication failed. Check that the access token is valid.", 401);
    }
    if (response.status === 403) {
      throw new ApiError("This account does not have permission to view orders for this restaurant.", 403);
    }
    if (response.status === 404) {
      throw new ApiError("Restaurant or endpoint not found.", 404);
    }
    if (response.status === 400) {
      throw new ApiError("The order filter or query parameters are invalid.", 400);
    }
    throw new ApiError(`The backend returned HTTP ${response.status}.`, response.status);
  }

  return (await response.json()) as Page<OrderSummary>;
}

export type QueueTicket = {
  ticketId: string;
  queueNumber: number;
  displayCode: string;
  status: string;
  createdAt: string | null;
  readyAt: string | null;
  calledAt: string | null;
  completedAt: string | null;
};

export type DeliveryTask = {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  status: string;
  driverUserId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  totalAmount: number;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

async function authenticatedJson<T>(
  url: string,
  accessToken: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = accessToken.trim();
  if (!token) throw new ApiError("Enter a Supabase access token.");

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Cannot reach the backend. Check the API URL and CORS configuration.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError("Authentication failed. Check that the access token is valid.", 401);
    }
    if (response.status === 403) {
      throw new ApiError("This account does not have permission to perform this operation.", 403);
    }
    if (response.status === 404) {
      throw new ApiError("The requested record was not found.", 404);
    }
    let serverMessage = "";
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object" && "message" in payload
          && typeof payload.message === "string") {
        serverMessage = payload.message;
      }
    } catch {
      // Some gateway errors do not return JSON.
    }
    throw new ApiError(serverMessage || `The backend returned HTTP ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

function restaurantApiUrl(apiBaseUrl: string, restaurantId: string, resource: string) {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  const normalizedRestaurantId = restaurantId.trim();
  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!normalizedRestaurantId) throw new ApiError("Enter the restaurant ID.");
  return `${base}/api/v1/restaurants/${encodeURIComponent(normalizedRestaurantId)}/${resource}`;
}

export async function listQueueTickets(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
): Promise<QueueTicket[]> {
  return authenticatedJson<QueueTicket[]>(
    restaurantApiUrl(apiBaseUrl, restaurantId, "queue-tickets"),
    accessToken,
  );
}

export async function callQueueTicket(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  ticketId: string,
): Promise<QueueTicket> {
  return authenticatedJson<QueueTicket>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "queue-tickets")}/${encodeURIComponent(ticketId)}/call`,
    accessToken,
    "PATCH",
  );
}

export async function listDeliveries(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  pageIndex = 0,
  status = "",
): Promise<Page<DeliveryTask>> {
  const query = new URLSearchParams({
    page: String(Math.max(0, Math.floor(pageIndex))),
    size: "20",
  });
  if (status.trim()) query.set("status", status.trim());
  return authenticatedJson<Page<DeliveryTask>>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "deliveries")}?${query.toString()}`,
    accessToken,
  );
}

export async function updateDeliveryStatus(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  deliveryId: string,
  request: {
    status: string;
    failureReason?: string;
    note?: string;
    cashCollected?: boolean;
  },
): Promise<DeliveryTask> {
  return authenticatedJson<DeliveryTask>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "deliveries")}/${encodeURIComponent(deliveryId)}/status`,
    accessToken,
    "PATCH",
    request,
  );
}

export async function assignDeliveryDriver(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  deliveryId: string,
  driverUserId: string,
): Promise<DeliveryTask> {
  return authenticatedJson<DeliveryTask>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "deliveries")}/${encodeURIComponent(deliveryId)}/assign`,
    accessToken,
    "PATCH",
    { driverUserId, note: "Assigned from the web operations dashboard." },
  );
}

export type DailyOperationsReport = {
  restaurantId: string;
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
};

export async function getDailyOperationsReport(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  reportDate = "",
): Promise<DailyOperationsReport> {
  const query = new URLSearchParams();
  if (reportDate.trim()) query.set("date", reportDate.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return authenticatedJson<DailyOperationsReport>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "reports/daily")}${suffix}`,
    accessToken,
  );
}

export async function updateOrderStatus(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  orderId: string,
  status: string,
): Promise<OrderSummary> {
  return authenticatedJson<OrderSummary>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "orders")}/${encodeURIComponent(orderId)}/status`,
    accessToken,
    "PATCH",
    { status, note: "Updated from the web operations dashboard." },
  );
}

export type MenuVariant = {
  id: string;
  name: string;
  price: number;
  available: boolean;
};

export type MenuModifierOption = {
  id: string;
  name: string;
  additionalPrice: number;
  available: boolean;
};

export type MenuModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: MenuModifierOption[];
};

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: boolean;
  trackStock: boolean;
  stockQuantity: number | null;
  variants: MenuVariant[];
  modifierGroups: MenuModifierGroup[];
};

export type MenuCategory = {
  id: string;
  name: string;
  displayOrder: number;
  products: MenuProduct[];
};

export type PublicMenu = {
  restaurantId: string;
  restaurantName: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  currency: string;
  categories: MenuCategory[];
};

export type CreateQrOrderResponse = {
  orderId: string;
  orderNumber: string;
  orderType: string;
  orderChannel: string;
  status: string;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  queue: {
    ticketId: string;
    queueNumber: number;
    displayCode: string;
    status: string;
    trackingToken: string;
  } | null;
};

export type QueueTrackingStatus = {
  ticketId: string;
  queueNumber: number;
  displayCode: string;
  queueStatus: string;
  orderNumber: string;
  orderStatus: string;
  createdAt: string;
  readyAt: string | null;
  calledAt: string | null;
  completedAt: string | null;
};

export type TicketNotification = {
  id: string;
  orderId: string | null;
  queueTicketId: string | null;
  notificationType: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  createdAt: string;
  readAt: string | null;
};

async function publicJson<T>(
  url: string,
  method = "GET",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...extraHeaders,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Cannot reach the backend. Check the API URL and CORS configuration.");
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError("Restaurant, order, or queue ticket was not found.", 404);
    }
    if (response.status === 400 || response.status === 409 || response.status === 422) {
      let message = "";
      try {
        const payload: unknown = await response.json();
        if (payload && typeof payload === "object" && "message" in payload
            && typeof payload.message === "string") {
          message = payload.message;
        }
      } catch {
        // Some proxy errors may not have a JSON body.
      }
      throw new ApiError(message || `The request could not be completed (HTTP ${response.status}).`, response.status);
    }
    throw new ApiError(`The backend returned HTTP ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

function publicApiBase(apiBaseUrl: string, restaurantId: string) {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  const normalizedRestaurantId = restaurantId.trim();
  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!normalizedRestaurantId) throw new ApiError("Enter the restaurant ID.");
  return { base, restaurantId: encodeURIComponent(normalizedRestaurantId) };
}

export async function getPublicMenu(
  apiBaseUrl: string,
  restaurantId: string,
): Promise<PublicMenu> {
  const location = publicApiBase(apiBaseUrl, restaurantId);
  return publicJson<PublicMenu>(
    `${location.base}/api/v1/public/restaurants/${location.restaurantId}/menu`,
  );
}

export async function createCommonQrOrder(
  apiBaseUrl: string,
  restaurantId: string,
  request: {
    qrToken: string;
    items: Array<{
      productId: string;
      variantId: string | null;
      quantity: number;
      specialInstruction: string | null;
      modifiers: Array<{ modifierOptionId: string; quantity: number }>;
    }>;
  },
  idempotencyKey?: string,
): Promise<CreateQrOrderResponse> {
  const location = publicApiBase(apiBaseUrl, restaurantId);
  return publicJson<CreateQrOrderResponse>(
    `${location.base}/api/v1/public/restaurants/${location.restaurantId}/orders/common-qr`,
    "POST",
    request,
    idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  );
}

export async function getQueueTrackingStatus(
  apiBaseUrl: string,
  ticketId: string,
  trackingToken: string,
): Promise<QueueTrackingStatus> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  return publicJson<QueueTrackingStatus>(
    `${base}/api/v1/public/queue-tickets/${encodeURIComponent(ticketId)}/status`,
    "GET",
    undefined,
    { "X-Queue-Token": trackingToken },
  );
}

export async function getTicketNotifications(
  apiBaseUrl: string,
  ticketId: string,
  trackingToken: string,
): Promise<TicketNotification[]> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  return publicJson<TicketNotification[]>(
    `${base}/api/v1/public/queue-tickets/${encodeURIComponent(ticketId)}/notifications`,
    "GET",
    undefined,
    { "X-Queue-Token": trackingToken },
  );
}

export type DefaultDeliveryDriverResponse = {
  restaurantId: string;
  defaultDriverUserId: string | null;
};

export async function getDefaultDeliveryDriver(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
): Promise<DefaultDeliveryDriverResponse> {
  return authenticatedJson<DefaultDeliveryDriverResponse>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "delivery-settings/default-driver")}`,
    accessToken,
  );
}

export async function setDefaultDeliveryDriver(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  driverUserId: string,
): Promise<DefaultDeliveryDriverResponse> {
  return authenticatedJson<DefaultDeliveryDriverResponse>(
    `${restaurantApiUrl(apiBaseUrl, restaurantId, "delivery-settings/default-driver")}`,
    accessToken,
    "PATCH",
    { driverUserId },
  );
}


export type RestaurantProfile = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  houseNo: string | null;
  street: string | null;
  ward: string | null;
  township: string;
  city: string;
  logoUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type CreateRestaurantRequest = {
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  houseNo: string | null;
  street: string | null;
  ward: string | null;
  township: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
};

export type RestaurantOnboardingResponse = {
  restaurant: RestaurantProfile;
  initialRole: string;
  currency: string;
  timezone: string;
  commonQrToken: string;
};

export type UpdateRestaurantProfileRequest = {
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  houseNo: string | null;
  street: string | null;
  ward: string | null;
  township: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
};

export type RestaurantLogoUploadResponse = {
  restaurantId: string;
  logoUrl: string;
};

export async function createRestaurant(
  apiBaseUrl: string,
  accessToken: string,
  request: CreateRestaurantRequest,
): Promise<RestaurantOnboardingResponse> {
  const base = apiBaseUrl.trim().replace(/\\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  return authenticatedJson<RestaurantOnboardingResponse>(
    `${base}/api/v1/restaurants`,
    accessToken,
    "POST",
    request,
  );
}

export async function getRestaurantProfile(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
): Promise<RestaurantProfile> {
  const base = apiBaseUrl.trim().replace(/\\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!restaurantId.trim()) throw new ApiError("Enter the restaurant ID.");
  return authenticatedJson<RestaurantProfile>(
    `${base}/api/v1/restaurants/${encodeURIComponent(restaurantId.trim())}`,
    accessToken,
  );
}

export async function updateRestaurantProfile(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  request: UpdateRestaurantProfileRequest,
): Promise<RestaurantProfile> {
  const base = apiBaseUrl.trim().replace(/\\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!restaurantId.trim()) throw new ApiError("Enter the restaurant ID.");
  return authenticatedJson<RestaurantProfile>(
    `${base}/api/v1/restaurants/${encodeURIComponent(restaurantId.trim())}/profile`,
    accessToken,
    "PUT",
    request,
  );
}

export async function uploadRestaurantLogo(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  file: File,
): Promise<RestaurantLogoUploadResponse> {
  const base = apiBaseUrl.trim().replace(/\\/+$/, "");
  const id = restaurantId.trim();
  const token = accessToken.trim();
  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!id) throw new ApiError("Enter the restaurant ID.");
  if (!token) throw new ApiError("Enter a Supabase access token.");

  const formData = new FormData();
  formData.append("file", file);
  let response: Response;
  try {
    response = await fetch(
      `${base}/api/v1/restaurants/${encodeURIComponent(id)}/logo`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        cache: "no-store",
      },
    );
  } catch {
    throw new ApiError("Cannot reach the backend. Check the API URL and CORS configuration.");
  }

  if (!response.ok) {
    let serverMessage = "";
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object" && "message" in payload
          && typeof payload.message === "string") {
        serverMessage = payload.message;
      }
    } catch {
      // Some gateway errors do not return JSON.
    }
    if (response.status === 401) {
      throw new ApiError("Authentication failed. Check that the access token is valid.", 401);
    }
    if (response.status === 403) {
      throw new ApiError(serverMessage || "Only the restaurant owner can update its logo.", 403);
    }
    if (response.status === 413) {
      throw new ApiError(serverMessage || "The logo must be 5 MB or smaller.", 413);
    }
    if (response.status === 415) {
      throw new ApiError(serverMessage || "Choose a PNG, JPEG, or WebP image.", 415);
    }
    throw new ApiError(serverMessage || `The backend returned HTTP ${response.status}.`, response.status);
  }

  return (await response.json()) as RestaurantLogoUploadResponse;
}
