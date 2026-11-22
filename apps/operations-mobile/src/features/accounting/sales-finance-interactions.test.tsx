import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import type { SalesLedgerOrder } from "@restaurant-platform/shared-types";

const h = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as {current: unknown}[], effects: [] as {deps: unknown[]; cleanup?: () => void}[],
  state: 0, ref: 0, effect: 0, role: "OWNER", tenant: "restaurant-a", scope: "ready", query: "ready", sale: {} as SalesLedgerOrder,
  refund: vi.fn(), reverseRefund: vi.fn(), getOrder: vi.fn(), reload: vi.fn(), signOut: vi.fn(), share: vi.fn(), fetchCsv: vi.fn() }));
vi.mock("react", async original => ({...await original<typeof import("react")>(),
  useState(initial: unknown) { const i=h.state++; if (!(i in h.states)) h.states[i]=typeof initial === "function" ? initial() : initial;
    const values=h.states; return [values[i], (value: unknown) => { values[i]=typeof value === "function" ? value(values[i]) : value; }]; },
  useRef(initial: unknown) { const i=h.ref++; return h.refs[i] ?? (h.refs[i]={current:initial}); },
  useCallback(fn: unknown) { return fn; },
  useEffect(effect: () => (() => void)|undefined, deps: unknown[] = []) { const i=h.effect++; const previous=h.effects[i];
    if (!previous || deps.some((value,index)=>value!==previous.deps[index])) { previous?.cleanup?.(); h.effects[i]={deps,cleanup:effect()}; } }
}));
vi.mock("react-native", () => ({ View:"View", Platform:{OS:"android"}, AppState:{currentState:"active",addEventListener:()=>({remove:vi.fn()})}, StyleSheet:{create:(value:unknown)=>value} }));
vi.mock("expo-router", () => ({useFocusEffect:(callback:()=>unknown)=>callback()}));
vi.mock("../../auth/AuthProvider", () => ({useOperationsAuth:()=>({state:h.scope==="ready"?{status:"ready",userId:`member-${h.tenant}`,membership:{restaurantId:h.tenant,role:h.role}}:{status:h.scope},signOut:h.signOut})}));
vi.mock("../../components/ui", () => ({Page:"Page", Card:"Card", Body:"Body", Action:"Action", FormField:"FormField", ConfirmDialog:"ConfirmDialog", Status:"Status"}));
vi.mock("../../components/QueryResult", () => ({QueryResult:"QueryResult"}));
vi.mock("../../hooks/useApiQuery", () => ({useApiQuery:()=>({state:{status:h.query,data:h.sale},reload:h.reload})}));
vi.mock("./salesApi", () => ({getSalesApi:()=>({refund:h.refund,reverseRefund:h.reverseRefund,getOrder:h.getOrder}),salesAmount:(value:string)=>value.replace(/\B(?=(\d{3})+(?!\d))/g,",")}));
vi.mock("./accounting-csv-file", () => ({shareAccountingCsv:(...args:unknown[])=>h.share(...args),accountingReportNames:{"sales-ledger":"Sales history","purchase-history":"Purchase history","financial-summary":"Financial summary"}}));

import { SalesDetailScreen } from "./SalesDetailScreen";
import { AccountingCsvAction } from "./AccountingCsvAction";
import { FinancialRequestKeys } from "./financial-requests";
type Props=Record<string,unknown>;
function elements(node:ReactNode):ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  let children=node.props.children as ReactNode;
  if (node.type==="QueryResult" as unknown) children=h.query==="ready"?(node.props.children as (sale:SalesLedgerOrder)=>ReactNode)(h.sale):null;
  return [node,...elements(children)];
}
function render(view:()=>ReactNode) {h.state=0;h.ref=0;h.effect=0;return elements(view());}
function action(tree:ReactElement<Props>[],prefix:string) {return tree.find(node=>node.type==="Action" as unknown&&String(node.props.title).startsWith(prefix))!.props as {disabled?:boolean;onPress():void};}
function review(tree:ReactElement<Props>[],prefix:string) {return tree.find(node=>node.type==="ConfirmDialog" as unknown&&String(node.props.title).startsWith(prefix))!.props as {visible:boolean;onConfirm():void};}
function change(tree:ReactElement<Props>[],label:string,value:string) {const field=tree.find(node=>String(node.props.label).startsWith(label))!; ((field.props.onChangeText??field.props.onChange) as (value:string)=>void)(value);}
function freshFrame() {h.effects.forEach(value=>value.cleanup?.());h.states=[];h.refs=[];h.effects=[];}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{
  vi.stubGlobal("React",React);freshFrame();h.role="OWNER";h.tenant="restaurant-a";h.scope="ready";h.query="ready";
  for (const fn of [h.refund,h.reverseRefund,h.getOrder,h.reload,h.signOut,h.share,h.fetchCsv]) fn.mockReset();
  h.sale={id:"order-a",orderNumber:"A-1042",createdAt:"2024-02-28T08:00:00+06:30",createdByUserId:null,orderChannel:"COMMON_QR",orderType:"TAKEAWAY",status:"COMPLETED",tableId:null,tableNumber:null,queueTicketId:null,queueDisplayCode:null,subtotal:"9007199254740993",deliveryFee:"0",discountAmount:"0",totalAmount:"9007199254740993",paymentStatus:"PAID",lines:[],payments:[{id:"payment-a",amount:"9007199254740993",method:"CASH_AT_COUNTER",status:"PAID",paidAt:"2024-02-29T09:00:00+06:30",createdAt:"2024-02-28T08:00:00+06:30",collectedByUserId:null}],refunds:[],refundReversals:[],timeline:[]};
  h.getOrder.mockImplementation(async()=>h.sale);h.share.mockResolvedValue(true);h.fetchCsv.mockResolvedValue("order_id\nsynthetic");
});
function fillRefund(view:()=>ReactNode) {
  change(render(view),"Original collected payment","payment-a");change(render(view),"Refund amount","9007199254740993");
  change(render(view),"Actual refund timestamp","2024-02-29T10:00:00+06:30");change(render(view),"Refund/correction reason","Synthetic completed return");
  action(render(view),"Review refund ·").onPress();
}
describe("completed refund review and uncertainty",()=>{
  it.each(["restaurant-a","restaurant-b"])("requires review and sends one exact refund after rapid confirmation for %s",async tenant=>{
    h.tenant=tenant;h.role=tenant==="restaurant-a"?"OWNER":"MANAGER";
    let finish!:(value:unknown)=>void;h.refund.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const keys=new FinancialRequestKeys(()=>"stable-review-key");const view=()=>SalesDetailScreen({id:"order-a",requestKeys:keys,onBack:vi.fn()});
    fillRefund(view);const dialog=review(render(view),"Post completed refund");expect(dialog.visible).toBe(true);expect(h.refund).not.toHaveBeenCalled();
    dialog.onConfirm();dialog.onConfirm();expect(h.refund).toHaveBeenCalledExactlyOnceWith("order-a",{paymentId:"payment-a",amount:"9007199254740993",refundedAt:"2024-02-29T10:00:00+06:30",reason:"Synthetic completed return"},"stable-review-key");
    finish({id:"refund-confirmed"});await tick();expect(h.reload).toHaveBeenCalledOnce();expect(h.reverseRefund).not.toHaveBeenCalled();
  });
  it("holds the earlier intent through remount, failed read and explicit successful history review without changing its key",async()=>{
    h.refund.mockRejectedValueOnce(new ApiNetworkError());const keys=new FinancialRequestKeys(()=>"original-key");
    const view=()=>SalesDetailScreen({id:"order-a",requestKeys:keys,onBack:vi.fn()});fillRefund(view);review(render(view),"Post completed refund").onConfirm();await tick();
    expect(keys.isUncertain("refund:order-a")).toBe(true);freshFrame();expect(action(render(view),"Review refund ·").disabled).toBe(true);
    h.getOrder.mockRejectedValueOnce(new ApiHttpError(503,"TEMPORARILY_UNAVAILABLE"));action(render(view),"Check current refund history").onPress();await tick();
    expect(keys.isUncertain("refund:order-a")).toBe(true);expect(render(view).some(node=>String(node.props.title).startsWith("History reviewed"))).toBe(false);
    action(render(view),"Check current refund history").onPress();await tick();expect(keys.isUncertain("refund:order-a")).toBe(true);
    action(render(view),"History reviewed").onPress();expect(keys.isUncertain("refund:order-a")).toBe(false);
    fillRefund(view);review(render(view),"Post completed refund").onConfirm();await tick();expect(h.refund.mock.calls[1][2]).toBe("original-key");
  });
  it("does not authorize a review above the remaining collected balance",()=>{
    h.sale.refunds=[{id:"existing",orderId:"order-a",paymentId:"payment-a",amount:"1",method:"CASH_AT_COUNTER",refundedAt:"2024-02-29T09:30:00+06:30",createdBy:"manager",createdAt:"2024-02-29T10:00:00+06:30",reason:"Previous return"}];
    const view=()=>SalesDetailScreen({id:"order-a",requestKeys:new FinancialRequestKeys(),onBack:vi.fn()});fillRefund(view);
    expect(review(render(view),"Post completed refund").visible).toBe(false);expect(h.refund).not.toHaveBeenCalled();
  });
  it("keeps an in-flight intent held when navigation unmounts before an unknown result",async()=>{
    let fail!:(error:unknown)=>void;h.refund.mockImplementation(()=>new Promise((_resolve,reject)=>{fail=reject;}));
    const keys=new FinancialRequestKeys(()=>"pending-key");const view=()=>SalesDetailScreen({id:"order-a",requestKeys:keys,onBack:vi.fn()});
    fillRefund(view);review(render(view),"Post completed refund").onConfirm();expect(keys.isUncertain("refund:order-a")).toBe(true);
    freshFrame();expect(action(render(view),"Review refund ·").disabled).toBe(true);fail(new ApiNetworkError());await tick();
    expect(keys.isUncertain("refund:order-a")).toBe(true);expect(h.refund).toHaveBeenCalledOnce();
  });
  it("removes private sale data and repeated actions after a server permission denial",async()=>{
    h.refund.mockRejectedValueOnce(new ApiHttpError(403,"FINANCIAL_PERMISSION_DENIED"));const keys=new FinancialRequestKeys();
    const view=()=>SalesDetailScreen({id:"order-a",requestKeys:keys,onBack:vi.fn()});fillRefund(view);review(render(view),"Post completed refund").onConfirm();await tick();
    const tree=render(view);expect(tree.some(node=>String(node.props.title).startsWith("Financial permission denied"))).toBe(true);
    expect(tree.some(node=>node.type==="QueryResult" as unknown)).toBe(false);expect(tree.some(node=>node.type==="Action" as unknown)).toBe(false);
  });
});
describe("private CSV scope confirmation",()=>{
  it("waits for explicit review and actual share completion",async()=>{
    let finish!:(value:boolean)=>void;h.share.mockImplementation(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    const view=()=>AccountingCsvAction({report:"sales-ledger",fetchCsv:h.fetchCsv,scopeDescription:"2024-02-01 through 2024-02-29"});
    action(render(view),"Review sales history CSV").onPress();expect(h.fetchCsv).not.toHaveBeenCalled();
    const dialog=review(render(view),"Review private export");expect(dialog.visible).toBe(true);dialog.onConfirm();dialog.onConfirm();await tick();
    expect(h.fetchCsv).toHaveBeenCalledOnce();expect(h.share).toHaveBeenCalledOnce();expect(h.states[0]).toBe(false);
    finish(true);await tick();expect(h.states[0]).toBe(true);
  });
  it("invalidates a retained export confirmation when the applied period changes",async()=>{
    let scope="2024-02";const view=()=>AccountingCsvAction({report:"sales-ledger",fetchCsv:h.fetchCsv,scopeDescription:scope});
    action(render(view),"Review sales history CSV").onPress();const dialog=review(render(view),"Review private export");scope="2024-03";render(view);dialog.onConfirm();await tick();
    expect(h.fetchCsv).not.toHaveBeenCalled();expect(h.share).not.toHaveBeenCalled();
  });
  it.each(["STAFF","DELIVERY_DRIVER"])("cannot share from a direct stale component with role %s",role=>{
    h.role=role;const tree=render(()=>AccountingCsvAction({report:"sales-ledger",fetchCsv:h.fetchCsv}));expect(action(tree,"Review sales history CSV").disabled).toBe(true);
    action(tree,"Review sales history CSV").onPress();review(render(()=>AccountingCsvAction({report:"sales-ledger",fetchCsv:h.fetchCsv})),"Review private export").onConfirm();expect(h.fetchCsv).not.toHaveBeenCalled();
  });
  it("offers no repeated forbidden CSV request after server denial",async()=>{
    h.fetchCsv.mockRejectedValueOnce(new ApiHttpError(403,"FINANCIAL_PERMISSION_DENIED"));const view=()=>AccountingCsvAction({report:"sales-ledger",fetchCsv:h.fetchCsv});
    action(render(view),"Review sales history CSV").onPress();review(render(view),"Review private export").onConfirm();await tick();
    expect(action(render(view),"Review sales history CSV").disabled).toBe(true);expect(h.share).not.toHaveBeenCalled();expect(h.fetchCsv).toHaveBeenCalledOnce();
  });
});
