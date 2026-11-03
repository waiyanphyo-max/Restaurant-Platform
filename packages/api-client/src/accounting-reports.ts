import type { FinancialReport, AccountingAuditPage, AccountingChronology } from "@restaurant-platform/shared-types";
import { createAuthenticatedTransport, type ApiRequestOptions } from "./transport.js";
import type { RestaurantMemberApiClientOptions } from "./clients.js";
import { requireUuid } from "./tenant.js";

export function createFinancialReportsApiClient(options: RestaurantMemberApiClientOptions) {
  const restaurantId = requireUuid(options.restaurantId, "restaurantId");
  const transport = createAuthenticatedTransport(options);
  const prefix = `/api/v1/restaurants/${restaurantId}/accounting`;
  return {
    getFinancialReport: (from?: string, to?: string, requestOptions?: ApiRequestOptions) =>
      transport.request<FinancialReport>({ method: "GET", path: `${prefix}/reports/summary`, query: { from, to }, options: requestOptions, retryTransient: true }),
    getFinancialReportCsv: (from?: string, to?: string, requestOptions?: ApiRequestOptions) =>
      transport.request<string>({ method: "GET", path: `${prefix}/reports/summary.csv`, query: { from, to }, options: requestOptions, responseType: "text", retryTransient: true }),
    getAccountingAudit: (entityId?: string, page = 0, size = 50, requestOptions?: ApiRequestOptions, filter?: { search?: string; sort?: AccountingChronology }) =>
      transport.request<AccountingAuditPage>({ method: "GET", path: `${prefix}/audit`, query: { entityId: entityId ? requireUuid(entityId, "entityId") : undefined, page, size, ...filter }, options: requestOptions, retryTransient: true })
  };
}
