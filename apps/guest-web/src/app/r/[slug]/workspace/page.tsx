import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function LocalWorkspace({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<PageSearchParams>;
}) {
  return <GuestPage view="workspace" slug={(await params).slug} search={await searchParams} />;
}
