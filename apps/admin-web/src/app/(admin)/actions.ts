"use server";

import { redirect } from "next/navigation";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { PlatformRestaurantConfigurationRequest, PlatformRestaurantProvisionRequest, PlatformBootstrapStepRequest, RuntimeBrandingPalette } from "@restaurant-platform/shared-types";
import { requireAdmin } from "@/lib/admin-context";
import { classifyAdminError, loginPath } from "@/lib/auth/route-policy";
import { mutationFailure } from "@/lib/lifecycle";

function failure(error: unknown, returnTo: string) {
  const state = classifyAdminError(error);
  if (state === "signed-out") redirect(loginPath(returnTo, "expired"));
  if (state === "forbidden" || state === "configuration") redirect("/access");
  return mutationFailure(error);
}

export async function provisionRestaurant(request: PlatformRestaurantProvisionRequest) {
  const { api } = await requireAdmin("/provisioning");
  try {
    const response = await api.provisionRestaurant(request);
    return { ok: true as const, data: { id: response.restaurant.id, name: response.restaurant.name, invitationSent: response.invitationSent, ownerInvitationStatus: response.ownerInvitationStatus } };
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 503 && ["PLATFORM_PUBLIC_ORIGIN_NOT_CONFIGURED", "PLATFORM_OWNER_INVITATION_NOT_CONFIGURED"].includes(error.code)) {
      return { ok: false as const, message: "Configuration prevented the request; no invitation was sent. Correct configuration and review again.", fields: {}, safeToEdit: true };
    }
    const result = failure(error, "/provisioning");
    return { ...result, safeToEdit: error instanceof ApiHttpError && (error.status === 400 || error.status === 422) };
  }
}

/** Read-only reconciliation never sends another invitation or creates a restaurant. */
export async function reconcileProvisioning(slug: string) {
  const { api } = await requireAdmin("/provisioning");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    return { ok: false as const, message: "Enter the exact valid public slug to reconcile.", fields: {} };
  }
  try {
    // Search may be partial and paginated. Only exact server-returned slug matches count.
    let page = 0;
    while (page < 100) {
      const records = await api.listRestaurants({ search: slug, page, size: 100 });
      const match = records.content.find(item => item.slug === slug);
      if (match) {
        const detail = await api.getRestaurant(match.id);
        if (detail.restaurant.slug !== slug) throw new Error("Registry changed during reconciliation");
        return { ok: true as const, data: { id: detail.restaurant.id } };
      }
      if (records.last) return { ok: true as const, data: { id: null } };
      page += 1;
    }
    return { ok: false as const, message: "The registry search is too broad. Check the restaurant registry before retrying.", fields: {}, uncertain: true };
  } catch (error) { return failure(error, "/provisioning"); }
}

export async function refreshBootstrap(id: string) {
  const returnTo = `/restaurant-setup?id=${encodeURIComponent(id)}`;
  const { api } = await requireAdmin(returnTo);
  try { return { ok: true as const, data: await api.getBootstrap(id) }; }
  catch (error) { return failure(error, returnTo); }
}

export async function applyBootstrapStep(id: string, request: PlatformBootstrapStepRequest) {
  const returnTo = `/restaurant-setup?id=${encodeURIComponent(id)}`;
  const { api } = await requireAdmin(returnTo);
  try { return { ok: true as const, data: await api.bootstrapStep(id, request) }; }
  catch (error) { return bootstrapFailure(error, returnTo); }
}

export async function initializeRestaurantBranding(id: string, palette: RuntimeBrandingPalette) {
  const returnTo = `/restaurant-setup?id=${encodeURIComponent(id)}`;
  const { api } = await requireAdmin(returnTo);
  try { return { ok: true as const, data: await api.initializeBranding(id, { expectedRevision: 0, palette }) }; }
  catch (error) { return bootstrapFailure(error, returnTo); }
}

function bootstrapFailure(error: unknown, returnTo: string) {
  if (error instanceof ApiHttpError && ![401, 403].includes(error.status) && error.code !== "PLATFORM_ADMIN_NOT_CONFIGURED") {
    const fields = Object.fromEntries(error.fieldErrors.map(item => [item.field, item.message]));
    if (error.status === 409 && error.code === "BOOTSTRAP_MEDIA_MANIFEST_STALE") return { ok: false as const, message: "The media manifest changed after this review. Refresh setup, cancel this old review, and rebuild the mapping from the current manifest before saving.", fields, uncertain: true, rebuildRequired: true };
    if (error.status === 400 || error.status === 422) return { ok: false as const, message: "The setup step was rejected. Check values, currency and references before reviewing again.", fields };
    if (error.status === 409) return { ok: false as const, message: "Setup changed or this operation conflicts with an existing record. Refresh setup before reviewing another change.", fields, uncertain: true };
    if (error.status === 404) return { ok: false as const, message: "A selected restaurant or catalog record is unavailable. Refresh setup and select current records.", fields };
  }
  const result = failure(error, returnTo);
  return { ...result, message: "The setup result could not be confirmed. Refresh this restaurant’s setup before another write.", uncertain: true };
}

export async function updateRestaurantConfiguration(id: string, request: PlatformRestaurantConfigurationRequest) {
  const returnTo = `/restaurant-details?id=${encodeURIComponent(id)}`;
  const { api } = await requireAdmin(returnTo);
  try { await api.updateRestaurantConfiguration(id, request); return { ok: true as const, data: null }; }
  catch (error) { return failure(error, returnTo); }
}

export async function updateRestaurantStatus(id: string, active: boolean) {
  const returnTo = `/restaurant-details?id=${encodeURIComponent(id)}`;
  const { api } = await requireAdmin(returnTo);
  try { await api.updateRestaurantStatus(id, { active }); return { ok: true as const, data: null }; }
  catch (error) { return failure(error, returnTo); }
}

export async function resendOwnerInvitation(restaurantId: string, ownerUserId: string) {
  const returnTo = `/restaurant-details?id=${encodeURIComponent(restaurantId)}`;
  const { api } = await requireAdmin(returnTo);
  try {
    const response = await api.resendOwnerInvitation(restaurantId, ownerUserId);
    return { ok: true as const, data: {
      emailStatus: response.emailStatus,
      requestedAt: response.requestedAt,
      nextAllowedAt: response.nextAllowedAt,
    } };
  } catch (error) {
    if (error instanceof ApiHttpError) {
      const messages: Record<string, string> = {
        OWNER_ONBOARDING_COMPLETE: "This owner has completed setup. Use Operations sign in or password recovery instead.",
        OWNER_INVITATION_RATE_LIMITED: "An email was requested recently. Wait before requesting another account setup email.",
        OWNER_INVITATION_NOT_CONFIGURED: "Account setup email is unavailable. Ask the platform operator to check the HTTPS redirect configuration.",
        OWNER_INVITATION_PROVIDER_ERROR: "The email provider could not accept this request. Try again later and check email delivery configuration.",
      };
      const message = error.code && messages[error.code];
      if (message) return { ok: false as const, message, fields: {} };
    }
    return failure(error, returnTo);
  }
}
