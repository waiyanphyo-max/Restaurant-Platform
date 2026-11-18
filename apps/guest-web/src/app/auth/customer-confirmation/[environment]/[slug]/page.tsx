import { headers } from "next/headers";
import { listRestaurantConfigs } from "@restaurant-platform/restaurant-config";
import { CustomerEmailConfirmation, RejectedCustomerConfirmation } from "@/components/CustomerEmailConfirmation";
import { resolveCustomerConfirmationContext } from "@/lib/auth/customer-confirmation";

export const dynamic = "force-dynamic";

export default async function CustomerConfirmationPage({ params }: { params: Promise<{ environment: string; slug: string }> }) {
  const { environment, slug } = await params;
  const requestHeaders = await headers();
  const context = resolveCustomerConfirmationContext(requestHeaders.get("host"), process.env.GUEST_CONFIG_ENV, environment, slug, listRestaurantConfigs());
  if (!context) return <RejectedCustomerConfirmation />;
  return <CustomerEmailConfirmation context={context} />;
}
