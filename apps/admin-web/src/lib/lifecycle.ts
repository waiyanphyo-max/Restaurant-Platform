import { ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError } from "@restaurant-platform/api-client";

export interface MutationFailure { ok: false; message: string; fields: Record<string, string>; uncertain?: boolean; }
export type MutationResult<T> = { ok: true; data: T } | MutationFailure;

/** Stable codes drive messages; provider details and credentials never reach the UI. */
export function mutationFailure(error: unknown): MutationFailure {
  if (error instanceof ApiHttpError) {
    const fields = Object.fromEntries(error.fieldErrors.map(item => [item.field.replace(/^restaurant\./, ""), item.message]));
    if (error.code.includes("SLUG") || error.code === "RESTAURANT_ALREADY_EXISTS") return { ok: false, message: "That public slug is already in use. Choose another slug.", fields: { ...fields, slug: "Choose a unique public slug." } };
    if (error.code === "PLATFORM_OWNER_EMAIL_ALREADY_REGISTERED") return { ok: false, message: "This email already has an Auth account. Enter its verified Supabase Auth user ID to continue.", fields: { ownerUserId: "Enter the existing account’s Supabase Auth UUID." } };
    if (error.code.includes("IDENTITY") || error.code.includes("UNVERIFIED") || error.code.includes("NOT_VERIFIED") || error.code.includes("MISMATCH")) return { ok: false, message: "The Owner identity could not be verified. Check the Auth user ID and confirmed email.", fields };
    if (error.status === 409) return { ok: false, message: "This request conflicts with an existing record. Refresh the registry and check the details before retrying.", fields };
    if (error.status === 400 || error.status === 422) return { ok: false, message: "Check the information below and submit again.", fields };
    if (error.status === 502 || error.status === 503) return { ok: false, message: "The onboarding provider or configuration service is unavailable. Check the registry and Auth account before retrying; an invitation may already exist.", fields, uncertain: true };
  }
  const uncertain = error instanceof ApiNetworkError || error instanceof ApiTimeoutError || error instanceof ApiProtocolError;
  return { ok: false, message: "The result could not be confirmed. Refresh the restaurant registry before retrying to avoid creating a duplicate.", fields: {}, uncertain };
}

/** Onboarding links carry only a restaurant ID; reject credentials and arbitrary fragments. */
export function safeSetupUrl(value: string | null | undefined, restaurantId: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.hash || url.pathname !== "/workspace" ||
        url.searchParams.get("restaurantId")?.toLowerCase() !== restaurantId.toLowerCase() ||
        url.searchParams.getAll("restaurantId").length !== 1 || url.searchParams.getAll("setup").length > 1 ||
        [...url.searchParams.keys()].some(key => key !== "restaurantId" && key !== "setup") ||
        (url.searchParams.has("setup") && url.searchParams.get("setup") !== "qr")) return null;
    return url.href;
  } catch { return null; }
}
