"use server";

import { redirect } from "next/navigation";
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
