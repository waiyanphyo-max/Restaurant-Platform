import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function Menu({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  return <GuestPage view="menu" search={await searchParams} />;
}
