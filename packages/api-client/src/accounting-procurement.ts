import type {
  AccountingSupplier, AccountingSupplierInput, ConfirmPurchaseInput, ProcurementPage, ProcurementPageQuery,
  PurchaseDetail, PurchasePaymentInput, PurchaseQuery, PurchaseReport, PurchaseSummary, ShoppingItem,
  ShoppingItemInput, ShoppingItemQuery, ShoppingSheet, ShoppingSheetInput, ShoppingSheetQuery,
  SupplierPayable, SupplierPurchasePayment
} from "@restaurant-platform/shared-types";
import { createAuthenticatedTransport, type ApiRequestOptions, type AuthenticatedApiTransportOptions } from "./transport.js";
import { requireHeaderValue, requireUuid } from "./tenant.js";

export interface ProcurementApiClientOptions extends AuthenticatedApiTransportOptions { restaurantId: string; }

/** All requests use the embedded restaurant and the authenticated transport; clients never write directly to Supabase. */
export function createProcurementApiClient(options: ProcurementApiClientOptions) {
  const restaurant=requireUuid(options.restaurantId,"restaurantId");
  const prefix=`/api/v1/restaurants/${restaurant}/accounting`;
  const transport=createAuthenticatedTransport(options);
  const id=(value:string)=>requireUuid(value,"accountingRecordId");
  function get<T>(path:string,query:Record<string,string|number|boolean|undefined>={},o?:ApiRequestOptions):Promise<T> {
    return transport.request({method:"GET",path:`${prefix}${path}`,query,options:o,retryTransient:true});
  }
  function mutate<T>(method:"POST"|"PUT",path:string,key:string,body:unknown,o?:ApiRequestOptions):Promise<T> {
    return transport.request({method,path:`${prefix}${path}`,headers:{"Idempotency-Key":requireHeaderValue(key,"Idempotency-Key")},body,options:o,retryTransient:true});
  }
  return {
    listAccountingSuppliers:(query:ProcurementPageQuery&{search?:string}={},o?:ApiRequestOptions)=>get<ProcurementPage<AccountingSupplier>>("/suppliers",{...query},o),
    createAccountingSupplier:(body:AccountingSupplierInput,key:string,o?:ApiRequestOptions)=>mutate<AccountingSupplier>("POST","/suppliers",key,body,o),
    updateAccountingSupplier:(supplierId:string,body:AccountingSupplierInput,key:string,o?:ApiRequestOptions)=>mutate<AccountingSupplier>("PUT",`/suppliers/${id(supplierId)}`,key,body,o),
    listShoppingItems:(query:ShoppingItemQuery={},o?:ApiRequestOptions)=>get<ProcurementPage<ShoppingItem>>("/shopping/items",{...query},o),
    createShoppingItem:(body:ShoppingItemInput,key:string,o?:ApiRequestOptions)=>mutate<ShoppingItem>("POST","/shopping/items",key,body,o),
    updateShoppingItem:(itemId:string,body:ShoppingItemInput,key:string,o?:ApiRequestOptions)=>mutate<ShoppingItem>("PUT",`/shopping/items/${id(itemId)}`,key,body,o),
    listShoppingSheets:(query:ShoppingSheetQuery={},o?:ApiRequestOptions)=>get<ProcurementPage<ShoppingSheet>>("/shopping/sheets",{...query},o),
    getShoppingSheet:(sheetId:string,o?:ApiRequestOptions)=>get<ShoppingSheet>(`/shopping/sheets/${id(sheetId)}`,{},o),
    createShoppingSheet:(body:ShoppingSheetInput,key:string,o?:ApiRequestOptions)=>mutate<ShoppingSheet>("POST","/shopping/sheets",key,body,o),
    updateShoppingSheet:(sheetId:string,body:ShoppingSheetInput,key:string,o?:ApiRequestOptions)=>mutate<ShoppingSheet>("PUT",`/shopping/sheets/${id(sheetId)}`,key,body,o),
    listPurchases:(query:PurchaseQuery={},o?:ApiRequestOptions)=>get<ProcurementPage<PurchaseSummary>>("/purchases",{...query},o),
    getPurchase:(purchaseId:string,o?:ApiRequestOptions)=>get<PurchaseDetail>(`/purchases/${id(purchaseId)}`,{},o),
    confirmPurchase:(body:ConfirmPurchaseInput,key:string,o?:ApiRequestOptions)=>mutate<PurchaseDetail>("POST","/purchases",key,body,o),
    cancelPurchase:(purchaseId:string,reason:string,key:string,o?:ApiRequestOptions)=>mutate<PurchaseDetail>("POST",`/purchases/${id(purchaseId)}/cancel`,key,{reason},o),
    recordPurchasePayment:(purchaseId:string,body:PurchasePaymentInput,key:string,o?:ApiRequestOptions)=>mutate<PurchaseDetail>("POST",`/purchases/${id(purchaseId)}/payments`,key,body,o),
    reversePurchasePayment:(purchaseId:string,paymentId:string,reason:string,key:string,o?:ApiRequestOptions)=>mutate<PurchaseDetail>("POST",`/purchases/${id(purchaseId)}/payments/${id(paymentId)}/reverse`,key,{reason},o),
    getPurchaseReport:(query:Omit<PurchaseQuery,"page"|"size">={},o?:ApiRequestOptions)=>get<PurchaseReport>("/purchases/report",{...query},o),
    getPurchaseCsv:(query:Omit<PurchaseQuery,"page"|"size">={},o?:ApiRequestOptions)=>transport.request<string>({method:"GET",path:`${prefix}/purchases/export.csv`,query:{...query},options:o,responseType:"text",retryTransient:true}),
    getSupplierPayables:(query:ProcurementPageQuery={},o?:ApiRequestOptions)=>get<ProcurementPage<SupplierPayable>>("/suppliers/payables",{...query},o),
    listSupplierPayments:(supplierId:string,query:ProcurementPageQuery={},o?:ApiRequestOptions)=>get<ProcurementPage<SupplierPurchasePayment>>(`/suppliers/${id(supplierId)}/payments`,{...query},o)
  };
}
