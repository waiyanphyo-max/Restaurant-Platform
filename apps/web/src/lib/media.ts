import { ApiError } from "./api";

export type ProductImageResponse = {
  id: string;
  imageUrl: string;
};

export type ProductVariantImageResponse = {
  id: string;
  productId: string;
  imageUrl: string;
};

export type CustomerAvatarResponse = {
  id: string;
  avatarUrl: string | null;
};

async function uploadImage<T>(
  apiBaseUrl: string,
  resourcePath: string,
  accessToken: string,
  file: File,
  maxBytes = 5 * 1024 * 1024,
): Promise<T> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  const token = accessToken.trim();

  if (!base) throw new ApiError("Enter the backend API URL.");
  if (!token) throw new ApiError("Enter a valid Supabase access token.");
  if (!file) throw new ApiError("Choose an image file.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new ApiError("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size <= 0 || file.size > maxBytes) {
    const maxMegabytes = maxBytes / (1024 * 1024);
    throw new ApiError(`The image must be non-empty and ${maxMegabytes} MB or smaller.`);
  }

  const form = new FormData();
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${base}${resourcePath}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Cannot reach the backend. Check the API URL and CORS configuration.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object" && "message" in payload
          && typeof payload.message === "string") {
        detail = payload.message;
      }
    } catch {
      // A gateway may return a non-JSON error response.
    }
    throw new ApiError(detail || `Image upload failed with HTTP ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

function restaurantPath(restaurantId: string): string {
  const id = restaurantId.trim();
  if (!id) throw new ApiError("Enter the restaurant ID.");
  return `/api/v1/restaurants/${encodeURIComponent(id)}`;
}

export function uploadRestaurantLogo(
  apiBaseUrl: string,
  restaurantId: string,
  accessToken: string,
  file: File,
) {
  return uploadImage<{ restaurantId: string; logoUrl: string }>(
    apiBaseUrl, `${restaurantPath(restaurantId)}/logo`, accessToken, file,
  );
}

export function uploadProductImage(
  apiBaseUrl: string,
  restaurantId: string,
  productId: string,
  accessToken: string,
  file: File,
) {
  return uploadImage<ProductImageResponse>(
    apiBaseUrl,
    `${restaurantPath(restaurantId)}/products/${encodeURIComponent(productId)}/image`,
    accessToken,
    file,
  );
}

export function uploadProductVariantImage(
  apiBaseUrl: string,
  restaurantId: string,
  productId: string,
  variantId: string,
  accessToken: string,
  file: File,
) {
  return uploadImage<ProductVariantImageResponse>(
    apiBaseUrl,
    `${restaurantPath(restaurantId)}/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/image`,
    accessToken,
    file,
  );
}

export function uploadCustomerAvatar(
  apiBaseUrl: string,
  accessToken: string,
  file: File,
) {
  return uploadImage<CustomerAvatarResponse>(
    apiBaseUrl, "/api/v1/customer/profile/avatar", accessToken, file, 2 * 1024 * 1024,
  );
}
