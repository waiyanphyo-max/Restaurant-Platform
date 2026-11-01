import { GuestState } from "@/components/GuestState";
import { getGuestLocale } from "@/lib/locale-server";

export default async function GuestLoading() {
  return <GuestState kind="loading" locale={await getGuestLocale()} />;
}
