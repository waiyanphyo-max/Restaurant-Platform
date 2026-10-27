import { ApiError } from "./api";
import { apiRequest } from "@/lib/api-request";

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
  file: File,
  maxBytes = 5 * 1024 * 1024,
): Promise<T> {
  const base = apiBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
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

  return apiRequest<T>(`${base}${resourcePath}`, { method: "POST", body: form });
}

function restaurantPath(restaurantId: string): string {
  const id = restaurantId.trim();
  if (!id) throw new ApiError("Enter the restaurant ID.");
  return `/api/v1/restaurants/${encodeURIComponent(id)}`;
}

export function uploadRestaurantLogo(
  apiBaseUrl: string,
  restaurantId: string,
  file: File,
) {
  return uploadImage<{ restaurantId: string; logoUrl: string }>(
    apiBaseUrl, `${restaurantPath(restaurantId)}/logo`, file,
  );
}

export function uploadProductImage(
  apiBaseUrl: string,
  restaurantId: string,
  productId: string,
  file: File,
) {
  return uploadImage<ProductImageResponse>(
    apiBaseUrl,
    `${restaurantPath(restaurantId)}/products/${encodeURIComponent(productId)}/image`,
    file,
  );
}

export function uploadProductVariantImage(
  apiBaseUrl: string,
  restaurantId: string,
  productId: string,
  variantId: string,
  file: File,
) {
  return uploadImage<ProductVariantImageResponse>(
    apiBaseUrl,
    `${restaurantPath(restaurantId)}/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/image`,
    file,
  );
}

export function uploadCustomerAvatar(
  apiBaseUrl: string,
  file: File,
) {
  return uploadImage<CustomerAvatarResponse>(
    apiBaseUrl, "/api/v1/customer/profile/avatar", file, 2 * 1024 * 1024,
  );
}
