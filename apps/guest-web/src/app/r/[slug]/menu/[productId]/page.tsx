import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function LocalProduct({ params, searchParams }: {
  params: Promise<{ slug: string; productId: string }>; searchParams: Promise<PageSearchParams>;
}) {
  const { slug, productId } = await params;
  return <GuestPage view="product" slug={slug} productId={productId} search={await searchParams} />;
}
