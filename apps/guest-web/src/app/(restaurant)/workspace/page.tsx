import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function Workspace({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  return <GuestPage view="workspace" search={await searchParams} />;
}
