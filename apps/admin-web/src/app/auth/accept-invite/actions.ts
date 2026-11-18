"use server";

import { createOwnerOnboardingApiClient } from "@restaurant-platform/api-client";
import { serverAuth } from "@/lib/auth/server";
import { createWebAuthSession } from "@/lib/auth/session";

/** Owners use their verified session here, never the platform administrator guard. */
export async function completeOwnerOnboarding(expectedUserId: string) {
  try {
    const auth = await serverAuth();
    if (!auth) return { ok: false as const };
    const session = createWebAuthSession(auth);
    if (!expectedUserId || await session.restoreUserId() !== expectedUserId) return { ok: false as const };
    const api = createOwnerOnboardingApiClient({
      baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
      getAccessToken: async () => {
        if (await session.restoreUserId() !== expectedUserId) return null;
        return session.getVerifiedAccessToken();
      },
    });
    const response = await api.complete();
    return { ok: true as const, completedAt: response.completedAt };
  } catch {
    return { ok: false as const };
  }
}
