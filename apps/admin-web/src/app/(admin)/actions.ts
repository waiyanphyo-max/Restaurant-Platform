"use server";

import { redirect } from "next/navigation";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { PlatformRestaurantConfigurationRequest, PlatformRestaurantProvisionRequest } from "@restaurant-platform/shared-types";
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
  } catch (error) { return failure(error, "/provisioning"); }
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
