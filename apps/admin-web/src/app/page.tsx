import { isValidAdminOrigin, parseAppStage } from "@/lib/deployment";
import { redirect } from "next/navigation";
import { createPlatformAdminApiClient } from "@restaurant-platform/api-client";
import { SignOutButton } from "@/components/SignOutButton";
import { serverAuth } from "@/lib/auth/server";
import { createWebAuthSession } from "@/lib/auth/session";
import { loadPlatformAccess } from "@/lib/auth/platform-access";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const stage = parseAppStage(process.env.APP_STAGE);
  const configured = isValidAdminOrigin(process.env.ADMIN_WEB_ORIGIN, stage);
  const auth = configured ? await serverAuth() : null;
  if (!auth) {
    return (
      <main className="shell">
        <h1>Platform Admin</h1>
        <p role="status">Platform sign-in is unavailable until this environment is configured.</p>
      </main>
    );
  }
  const session = createWebAuthSession(auth);
  if (!await session.restoreUserId()) redirect("/login");
  const access = await loadPlatformAccess(() => createPlatformAdminApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
    getAccessToken: session.getVerifiedAccessToken,
  }).getOverview());
  if (access.state === "signed-out") redirect("/login");

  return (
    <main className="shell">
      <div className="eyebrow">Restaurant Platform</div>
      <h1>Platform Admin</h1>
      {access.state === "authorized" && (
        <div className="status" role="status">
          <p>Platform access verified by the API.</p>
          <p>{access.overview.totalRestaurants} restaurants; {access.overview.totalOrders} orders.</p>
        </div>
      )}
      {access.state === "forbidden" && <p role="alert">This account does not have Platform Admin access.</p>}
      {access.state === "unavailable" && <p role="alert">Platform access could not be checked. Please try again later.</p>}
      <SignOutButton />
    </main>
  );
}
