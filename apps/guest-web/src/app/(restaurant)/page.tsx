import { GuestPage } from "@/components/GuestPage";
import type { PageSearchParams } from "@/lib/legacy-route";

export default async function Home({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  return <GuestPage view="home" search={await searchParams} />;
}
