import type { GuestLocale } from "./i18n";

/** Whole menu amounts/counts must render identically even in browsers without Burmese ICU data. */
export function formatGuestNumber(value: number, locale: GuestLocale = "en"): string {
  if (!Number.isSafeInteger(value)) throw new RangeError("Guest numbers must be whole safe integers");
  const grouped = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return locale === "my" ? grouped.replace(/\d/g, digit => "၀၁၂၃၄၅၆၇၈၉"[Number(digit)]) : grouped;
}
