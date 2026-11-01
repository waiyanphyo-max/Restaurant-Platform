import {
  ApiConfigurationError,
  ApiHttpError,
  ApiProtocolError,
  createPublicRestaurantApiClient,
} from "@restaurant-platform/api-client";
import type {
  MenuCategoryDto,
  MenuModifierGroupDto,
  MenuModifierOptionDto,
  MenuProductDto,
  MenuVariantDto,
  PublicMenuResponse,
  RestaurantConfig,
} from "@restaurant-platform/shared-types";

export type GuestMenuResult =
  | { kind: "ready"; menu: PublicMenuResponse }
  | { kind: "unavailable" | "configuration-error" | "error" };

interface GuestMenuOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiProtocolError();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new ApiProtocolError();
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function uuid(value: unknown): string {
  const id = text(value);
  if (!uuidPattern.test(id)) throw new ApiProtocolError();
  return id.toLowerCase();
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ApiProtocolError();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ApiProtocolError();
  return value;
}

function nullableInteger(value: unknown): number | null {
  return value === null ? null : integer(value);
}

function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new ApiProtocolError();
  return value.map(parse);
}

function option(value: unknown): MenuModifierOptionDto {
  const item = record(value);
  return {
    id: uuid(item.id), name: text(item.name),
    additionalPrice: integer(item.additionalPrice), available: boolean(item.available),
  };
}

function modifierGroup(value: unknown): MenuModifierGroupDto {
  const item = record(value);
  const minSelections = integer(item.minSelections);
  const maxSelections = integer(item.maxSelections);
  if (minSelections > maxSelections) throw new ApiProtocolError();
  return {
    id: uuid(item.id), name: text(item.name), required: boolean(item.required),
    minSelections, maxSelections, options: list(item.options, option),
  };
}

function variant(value: unknown): MenuVariantDto {
  const item = record(value);
  return {
    id: uuid(item.id), name: text(item.name), price: nullableInteger(item.price),
    imageUrl: safeImageUrl(nullableText(item.imageUrl)) ?? null,
    available: boolean(item.available),
  };
}

function product(value: unknown): MenuProductDto {
  const item = record(value);
  return {
    id: uuid(item.id), name: text(item.name), description: nullableText(item.description),
    price: nullableInteger(item.price), imageUrl: safeImageUrl(nullableText(item.imageUrl)) ?? null,
    available: boolean(item.available), trackStock: boolean(item.trackStock),
    stockQuantity: nullableInteger(item.stockQuantity), variants: list(item.variants, variant),
    modifierGroups: list(item.modifierGroups, modifierGroup),
  };
}

function category(value: unknown): MenuCategoryDto {
  const item = record(value);
  // Spring permits signed display ordering values.
  if (typeof item.displayOrder !== "number" || !Number.isSafeInteger(item.displayOrder)) throw new ApiProtocolError();
  return {
    id: uuid(item.id), name: text(item.name), displayOrder: item.displayOrder,
    products: list(item.products, product),
  };
}

/** Validate the tenant identity before reading or exposing any public profile data. */
function parseMenu(value: unknown, restaurantId: string): PublicMenuResponse {
  const menu = record(value);
  const actualId = uuid(menu.restaurantId);
  if (actualId !== restaurantId.toLowerCase()) throw new ApiProtocolError();
  const categories = list(menu.categories, category).sort((a, b) => a.displayOrder - b.displayOrder);
  const categoryIds = categories.map(item => item.id);
  const productIds = categories.flatMap(item => item.products.map(entry => entry.id));
  if (new Set(categoryIds).size !== categoryIds.length || new Set(productIds).size !== productIds.length) {
    throw new ApiProtocolError();
  }
  // The Spring DTO allows a missing currency when settings do not exist. Never invent one.
  const currency = menu.currency === null ? "" : text(menu.currency);
  if (currency !== "" && !/^[A-Z]{3}$/.test(currency)) throw new ApiProtocolError();
  return {
    restaurantId: actualId, restaurantName: text(menu.restaurantName),
    slug: nullableText(menu.slug), description: nullableText(menu.description),
    phone: nullableText(menu.phone), address: nullableText(menu.address),
    logoUrl: safeImageUrl(nullableText(menu.logoUrl)) ?? null, currency, categories,
  };
}

/**
 * Call only after server-side host/slug resolution. No browser restaurant ID, cookie,
 * QR credential, authorization header, or forwarded request header enters this call.
 * The shared public transport disables caching, redirects and referrers and omits credentials.
 */
export async function loadGuestMenu(
  restaurant: Pick<RestaurantConfig, "restaurantId">,
  options: GuestMenuOptions = {},
): Promise<GuestMenuResult> {
  const baseUrl = options.baseUrl ?? process.env.GUEST_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) return { kind: "configuration-error" };
  try {
    const client = createPublicRestaurantApiClient({
      restaurantId: restaurant.restaurantId, baseUrl,
      fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs ?? 8_000,
    });
    const response = await client.getPublicMenu();
    return { kind: "ready", menu: parseMenu(response, restaurant.restaurantId) };
  } catch (error) {
    // Never serialize backend errors, request URLs, tokens, or other tenant payloads.
    if (error instanceof ApiConfigurationError) return { kind: "configuration-error" };
    if (error instanceof ApiHttpError && [404, 410, 503].includes(error.status)) return { kind: "unavailable" };
    return { kind: "error" };
  }
}

/** Public media only; credential-bearing URLs and active/non-HTTPS schemes are discarded. */
export function safeImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function findMenuProduct(
  menu: PublicMenuResponse,
  productId: string,
): { category: MenuCategoryDto; product: MenuProductDto } | undefined {
  if (!uuidPattern.test(productId)) return undefined;
  for (const category of menu.categories) {
    const product = category.products.find(item => item.id.toLowerCase() === productId.toLowerCase());
    if (product) return { category, product };
  }
  return undefined;
}

export function isProductAvailable(product: MenuProductDto): boolean {
  return product.available &&
    (!product.trackStock || (product.stockQuantity !== null && product.stockQuantity > 0)) &&
    (product.variants.length === 0
      ? product.price !== null
      : product.variants.some(item => item.available && item.price !== null)) &&
    product.modifierGroups.every(group =>
      group.options.filter(item => item.available).length >= group.minSelections);
}

export function productPriceRange(product: MenuProductDto): { min: number; max: number } | null {
  const availableVariants = product.variants.filter(item => item.available);
  const variants = availableVariants.length > 0 ? availableVariants : product.variants;
  const prices = (variants.length > 0 ? variants.map(item => item.price) : [product.price])
    .filter((price): price is number => price !== null && Number.isSafeInteger(price) && price >= 0);
  return prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

export function formatMenuPrice(value: number, currency: string, locale: "en" | "my" = "en"): string {
  const options: Intl.NumberFormatOptions = /^[A-Z]{3}$/.test(currency)
    ? { style: "currency", currency, maximumFractionDigits: 0 }
    : { maximumFractionDigits: 0 };
  return new Intl.NumberFormat(locale === "my" ? "my-MM" : "en", options).format(value);
}
