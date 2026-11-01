import "server-only";
import { cookies } from "next/headers";
import { localeCookie, parseGuestLocale } from "./i18n";

export async function getGuestLocale() {
  return parseGuestLocale((await cookies()).get(localeCookie)?.value);
}
