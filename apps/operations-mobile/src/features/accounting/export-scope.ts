import type { SalesLedgerQuery } from "@restaurant-platform/shared-types";

/** Describe supported server filters, never invent export schema or physical rows. */
export function salesExportScope(filters: SalesLedgerQuery): string {
  const period = filters.date ?? filters.month ?? (filters.from && filters.to ? `${filters.from} through ${filters.to}` : "Current restaurant-local day · ဆိုင်ဒေသစံတော်ချိန် ယနေ့");
  return [period, filters.order ? `Order · အော်ဒါ: ${filters.order}` : "", filters.product ? `Product · ကုန်ပစ္စည်း: ${filters.product}` : "",
    filters.channel ? `Channel · လမ်းကြောင်း: ${filters.channel.replaceAll("_", " ")}` : "All channels · လမ်းကြောင်းအားလုံး",
    filters.paymentStatus ? `Payment · ငွေပေးချေမှု: ${filters.paymentStatus.replaceAll("_", " ")}` : "All payment statuses · ငွေပေးချေမှုအခြေအနေအားလုံး",
    `Sort · အစီအစဉ်: ${(filters.sort ?? "OLDEST").replaceAll("_", " ")}`, "Complete matching history across pages · ကိုက်ညီသော မှတ်တမ်းအားလုံး"]
    .filter(Boolean).join(" · ");
}
