import type {
  CreateOrderResponse,
  CreateQrOrderRequest,
  MyRestaurantResponse,
  PublicMenuResponse,
  QueueTrackingResponse
} from "@restaurant-platform/shared-types";

export interface RestaurantApiClientOptions {
  /** API origin only. Tokens are never sent to a different origin. */
  baseUrl: string;
  /** Build-time tenant ID for guest or restaurant-specific apps. */
  restaurantId: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null | Promise<string | null>;
}

export class ApiHttpError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with HTTP ${status}`);
    this.name = "ApiHttpError";
  }
}

export class MissingAccessTokenError extends Error {
  constructor() {
    super("An authenticated API request requires a current Supabase access token");
    this.name = "MissingAccessTokenError";
  }
}

function checkedOrigin(baseUrl: string): URL {
  const url = new URL(baseUrl);
  const localHost = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("API baseUrl must be a trusted HTTPS origin or a loopback development origin");
  }
  return url;
}

function checkedUuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
  return value;
}

function checkedHeaderValue(value: string, label: string): string {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`${label} must be a non-empty single-line value`);
  }
  return value;
}

/**
 * A restaurant-scoped transport. Public methods never attach a Supabase bearer
 * token; private methods request a fresh token from the caller at call time.
 */
export function createRestaurantApiClient(options: RestaurantApiClientOptions) {
  const origin = checkedOrigin(options.baseUrl);
  const restaurantId = checkedUuid(options.restaurantId, "restaurantId");
  const fetchImpl = options.fetchImpl ?? fetch;
  const prefix = `/api/v1/public/restaurants/${restaurantId}`;

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetchImpl(new URL(path, origin), {
      ...init,
      cache: "no-store"
    });
    if (!response.ok) {
      throw new ApiHttpError(response.status);
    }
    return (await response.json()) as T;
  }

  async function createQrOrder(
    kind: "common-qr" | "table-qr",
    payload: CreateQrOrderRequest,
    idempotencyKey?: string
  ): Promise<CreateOrderResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = checkedHeaderValue(idempotencyKey, "Idempotency-Key");
    }
    return request<CreateOrderResponse>(`${prefix}/orders/${kind}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  }

  return {
    restaurantId,
    getPublicMenu(): Promise<PublicMenuResponse> {
      return request<PublicMenuResponse>(`${prefix}/menu`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });
    },
    createCommonQrOrder(payload: CreateQrOrderRequest, idempotencyKey?: string) {
      return createQrOrder("common-qr", payload, idempotencyKey);
    },
    createTableQrOrder(payload: CreateQrOrderRequest, idempotencyKey?: string) {
      return createQrOrder("table-qr", payload, idempotencyKey);
    },
    getQueueStatus(ticketId: string, trackingToken: string): Promise<QueueTrackingResponse> {
      checkedUuid(ticketId, "ticketId");
      return request<QueueTrackingResponse>(`/api/v1/public/queue-tickets/${ticketId}/status`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Queue-Token": checkedHeaderValue(trackingToken, "X-Queue-Token")
        }
      });
    },
    async getMyRestaurants(): Promise<MyRestaurantResponse[]> {
      const token = await options.getAccessToken?.();
      if (!token) {
        throw new MissingAccessTokenError();
      }
      return request<MyRestaurantResponse[]>("/api/v1/my/restaurants", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${checkedHeaderValue(token, "access token")}`
        }
      });
    }
  };
}
