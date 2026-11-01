import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function Product({ params, searchParams }: {
  params: Promise<{ productId: string }>; searchParams: Promise<PageSearchParams>;
}) {
  return <GuestPage view="product" productId={(await params).productId} search={await searchParams} />;
}
