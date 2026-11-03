import type { SalesDashboard, SalesLedgerOrder, SalesLedgerPage, SalesLedgerQuery, SalesPeriodQuery, SalesProduct, SalesProductsQuery, SalesRefund, SalesRefundRequest, SalesRefundReversal } from "@restaurant-platform/shared-types";
import { ApiConfigurationError } from "./errors.js";
import type { RestaurantMemberApiClientOptions } from "./clients.js";
import { requireHeaderValue, requireUuid } from "./tenant.js";
import { createAuthenticatedTransport, type ApiRequestOptions } from "./transport.js";

function period(query: SalesPeriodQuery) {
  if ((query.date || query.month) && (query.from || query.to) || query.date && query.month || !!query.from !== !!query.to) throw new ApiConfigurationError("Choose one complete sales date, month or range");
  for (const value of [query.date,query.from,query.to]) {
    if (value !== undefined) {
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw new ApiConfigurationError("Invalid sales date");
    }
  }
  if (query.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)) throw new ApiConfigurationError("Invalid sales month");
  if (query.from && query.to && query.to<query.from) throw new ApiConfigurationError("Sales range must be chronological");
  return { ...query };
}
export function createSalesAccountingApiClient(options: RestaurantMemberApiClientOptions) {
  const restaurantId=requireUuid(options.restaurantId,"restaurantId");
  const transport=createAuthenticatedTransport(options);
  const prefix=`/api/v1/restaurants/${restaurantId}/accounting/sales`;
  return {
    getDashboard: (query: { date?: string; month?: string; year?: number } = {}, requestOptions?: ApiRequestOptions) => {
      period({ date: query.date }); period({ month:query.month });
      if (query.year!==undefined && (!Number.isInteger(query.year)||query.year<1900||query.year>9998)) throw new ApiConfigurationError("Invalid sales year");
      return transport.request<SalesDashboard>({method:"GET",path:`${prefix}/dashboard`,query:{...query},options:requestOptions,retryTransient:true});
    },
    getLedger: (query: SalesLedgerQuery={},requestOptions?: ApiRequestOptions) => {
      period(query);
      return transport.request<SalesLedgerPage<SalesLedgerOrder>>({method:"GET",path:`${prefix}/ledger`,query:{...query},options:requestOptions,retryTransient:true});
    },
    getOrder: (id: string,requestOptions?: ApiRequestOptions) => transport.request<SalesLedgerOrder>({method:"GET",path:`${prefix}/ledger/${requireUuid(id,"orderId")}`,options:requestOptions,retryTransient:true}),
    getProducts: (query: SalesProductsQuery={},requestOptions?: ApiRequestOptions) => {
      period(query);
      return transport.request<SalesLedgerPage<SalesProduct>>({method:"GET",path:`${prefix}/products`,query:{...query},options:requestOptions,retryTransient:true});
    },
    exportCsv: (query: SalesLedgerQuery={},requestOptions?: ApiRequestOptions) => {
      period(query); const { page: _page,size: _size,...filters }=query; void _page; void _size;
      return transport.request<string>({method:"GET",path:`${prefix}/ledger.csv`,query:filters,options:requestOptions,responseType:"text",retryTransient:true});
    },
    refund: (orderId: string,body: SalesRefundRequest,key: string,requestOptions?: ApiRequestOptions) => {
      if(!/^[1-9]\d*$/.test(body.amount)) throw new ApiConfigurationError("Refund requires a positive whole currency string");
      return transport.request<SalesRefund>({method:"POST",path:`${prefix}/ledger/${requireUuid(orderId,"orderId")}/refunds`,body:{...body,paymentId:requireUuid(body.paymentId,"paymentId")},
        headers:{"Idempotency-Key":requireHeaderValue(key,"Idempotency-Key")},options:requestOptions,retryTransient:true});
    },
    reverseRefund: (orderId:string,refundId:string,reason:string,key:string,requestOptions?:ApiRequestOptions) =>
      transport.request<SalesRefundReversal>({method:"POST",path:`${prefix}/ledger/${requireUuid(orderId,"orderId")}/refunds/${requireUuid(refundId,"refundId")}/reverse`,body:{reason},
        headers:{"Idempotency-Key":requireHeaderValue(key,"Idempotency-Key")},options:requestOptions,retryTransient:true})
  };
}
