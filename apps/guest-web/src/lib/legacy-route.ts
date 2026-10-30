export type LegacyIntent =
  | { kind: "home" }
  | { kind: "common-qr"; restaurantId: string }
  | { kind: "table-qr"; restaurantId: string }
  | { kind: "owner"; restaurantId: string }
  | { kind: "invalid" };

export type PageSearchParams = Record<string, string | string[] | undefined>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toUrlSearchParams(input: PageSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else if (value !== undefined) {
      result.append(key, value);
    }
  }
  return result;
}

function singleValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : null;
}

export function resolveLegacyIntent(
  pathname: "/" | "/workspace",
  params: URLSearchParams,
  tenantRestaurantId: string,
): LegacyIntent {
  const viewValues = params.getAll("view");
  const restaurantValues = params.getAll("restaurantId");
  if (viewValues.length > 1 || restaurantValues.length > 1) return { kind: "invalid" };

  const view = singleValue(params, "view");
  const restaurantId = singleValue(params, "restaurantId");

  if (pathname === "/" && viewValues.length === 0 && restaurantValues.length === 0) {
    return { kind: "home" };
  }
  if (!restaurantId || !uuidPattern.test(restaurantId)) return { kind: "invalid" };
  if (restaurantId.toLowerCase() !== tenantRestaurantId.toLowerCase()) {
    return { kind: "invalid" };
  }

  if (pathname === "/" && view === "customer-pickup") {
    return { kind: "common-qr", restaurantId };
  }
  if (pathname === "/workspace" && view === "table-order") {
    return { kind: "table-qr", restaurantId };
  }
  if (pathname === "/workspace" && viewValues.length === 0) {
    return { kind: "owner", restaurantId };
  }
  return { kind: "invalid" };
}
