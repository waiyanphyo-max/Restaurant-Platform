import { notFound } from "next/navigation";
import { GuestStarter } from "@/components/GuestStarter";
import { resolveLegacyIntent, toUrlSearchParams, type PageSearchParams } from "@/lib/legacy-route";
import { resolveGuestTenant } from "@/lib/tenant-server";

export const dynamic = "force-dynamic";

export default async function GuestHome({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const tenant = await resolveGuestTenant();
  if (!tenant) notFound();

  const intent = resolveLegacyIntent("/", toUrlSearchParams(await searchParams), tenant.restaurantId);
  if (intent.kind === "invalid") notFound();

  return <GuestStarter restaurant={tenant} intent={intent} />;
}
