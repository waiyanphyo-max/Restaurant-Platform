import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function LocalMenu({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<PageSearchParams>;
}) {
  return <GuestPage view="menu" slug={(await params).slug} search={await searchParams} />;
}
