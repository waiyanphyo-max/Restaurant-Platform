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
): Promise<Page<OrderSummary>> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!restaurantId.trim()) throw new ApiError("Enter the restaurant ID.");
  if (!accessToken.trim()) throw new ApiError("Enter a Supabase access token.");

  let response: Response;
  try {
    response = await fetch(
      `${base}/api/v1/restaurants/${encodeURIComponent(restaurantId.trim())}/orders?page=0&size=20`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
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
    throw new ApiError(`The backend returned HTTP ${response.status}.`, response.status);
  }

  return (await response.json()) as Page<OrderSummary>;
}
