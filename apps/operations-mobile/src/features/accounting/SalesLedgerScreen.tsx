import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { SalesLedgerQuery, SalesPeriodQuery, SalesRefundRequest } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { Choices, MutationFeedback } from "../../components/forms";
import { Action, Body, Card, ConfirmDialog, DataTable, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { isIsoDate } from "../operations/format";
import { getSalesApi, salesAmount } from "./salesApi";

async function shareCsv(content: string,allowed:()=>boolean) {
  if(!allowed()) return;
  if(Platform.OS==="web") {
    const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
    const anchor=document.createElement("a"); anchor.href=url; anchor.download="sales-ledger.csv"; anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); return;
  }
  const fs=await import("expo-file-system/legacy"); const sharing=await import("expo-sharing");
  if(!fs.cacheDirectory || !await sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device");
  if(!allowed()) return;
  const directory=fs.cacheDirectory;
  const names=await fs.readDirectoryAsync(directory);
  await Promise.all(names.map(async name=>{
    const match=/^sales-ledger-(\d{13})\.csv$/.exec(name);
    if(match&&Date.now()-Number(match[1])>=5*60*1000) await fs.deleteAsync(`${directory}${name}`,{idempotent:true});
  }));
  if(!allowed()) return;
  const path=`${fs.cacheDirectory}sales-ledger-${Date.now()}.csv`;
  await fs.writeAsStringAsync(path,content,{encoding:fs.EncodingType.UTF8});
  if(!allowed()) { await fs.deleteAsync(path,{idempotent:true}); return; }
  try { await sharing.shareAsync(path,{mimeType:"text/csv",dialogTitle:"Export sales ledger",UTI:"public.comma-separated-values-text"}); }
  finally { setTimeout(()=>{void fs.deleteAsync(path,{idempotent:true}).catch(()=>undefined);},5*60*1000); }
}

function Transaction({id,onBack}: {id: string;onBack():void}) {
  const query=useApiQuery(signal=>getSalesApi().getOrder(id,{signal}),`sales-transaction:${id}`);
  const mutation=useApiMutation();
  const [paymentId,setPaymentId]=useState(""); const [amount,setAmount]=useState("");
  const [when,setWhen]=useState(""); const [reason,setReason]=useState("");
  const [confirm,setConfirm]=useState<SalesRefundRequest|null>(null); const [error,setError]=useState("");
  const retry=useRef<{payload:string;key:string}|null>(null);
  const [reverseId,setReverseId]=useState(""); const [reverseReason,setReverseReason]=useState("");
  const [reverseConfirm,setReverseConfirm]=useState<{id:string;reason:string}|null>(null);
  const reverseRetry=useRef<{payload:string;key:string}|null>(null);
  function prepareRefund() {
    if(!paymentId||! /^[1-9]\d*$/.test(amount)||!when||!Number.isFinite(Date.parse(when))||!/(Z|[+-]\d{2}:\d{2})$/.test(when)||!reason.trim()) {
      setError("Choose a collected payment, enter a positive whole amount, exact timestamp with offset, and correction reason."); return;
    }
    setError(""); setConfirm({paymentId,amount,refundedAt:when,reason:reason.trim()});
  }
  function postRefund() {
    if(!confirm) return;
    const body=confirm; setConfirm(null); const payload=JSON.stringify(body);
    if(retry.current?.payload!==payload) retry.current={payload,key:`refund-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    const key=retry.current.key;
    void mutation.run(()=>getSalesApi().refund(id,body,key),()=>{query.reload();setAmount("");setReason("");setWhen("");retry.current=null;});
  }
  function postReversal() {
    if(!reverseConfirm) return;
    const value=reverseConfirm;setReverseConfirm(null);const payload=JSON.stringify(value);
    if(reverseRetry.current?.payload!==payload) reverseRetry.current={payload,key:`refund-reversal-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    const key=reverseRetry.current.key;
    void mutation.run(()=>getSalesApi().reverseRefund(id,value.id,value.reason,key),()=>{query.reload();setReverseId("");setReverseReason("");reverseRetry.current=null;});
  }
  return <Page title="Sales transaction" onRefresh={query.reload} refreshing={query.state.status==="loading"}>
    <Action title="Back to sales ledger" secondary onPress={onBack}/>
    <QueryResult {...query}>{sale=><>
      <Card title={sale.orderNumber}>
        <Body>Order ID: {sale.id}</Body><Body>Created: {sale.createdAt}</Body><Body>Created by: {sale.createdByUserId??"Not recorded (guest or legacy)"}</Body>
        <Body>{sale.orderChannel} · {sale.orderType} · {sale.status} · {sale.paymentStatus}</Body>
        {sale.tableId?<Body>Table: {sale.tableNumber??"Historical label not recorded"} · {sale.tableId}</Body>:null}
        {sale.queueTicketId?<Body>Queue: {sale.queueDisplayCode??"Historical label not recorded"} · {sale.queueTicketId}</Body>:null}
        <Body>Subtotal: {salesAmount(sale.subtotal)} · Delivery: {salesAmount(sale.deliveryFee)}</Body>
        <Body>Order discount: {salesAmount(sale.discountAmount)} · Total: {salesAmount(sale.totalAmount)}</Body>
      </Card>
      {sale.lines.map(line=><Card key={line.id} title={line.productName}>
        <Body>Product ID: {line.productId}</Body><Body>Variant: {line.variantName??"None"} {line.variantId??""}</Body>
        <Body>Quantity: {line.quantity} · Historical unit price: {salesAmount(line.unitPrice)}</Body>
        <Body>Line discount: {salesAmount(line.lineDiscount)} · Historical line total: {salesAmount(line.lineTotal)}</Body>
        {line.modifiers.map(modifier=><Body key={modifier.optionId}>{modifier.name} × {modifier.quantity} · Unit add-on: {salesAmount(modifier.additionalPrice)}</Body>)}
      </Card>)}
      <Card title="Discounts"><Body>Discounts are recorded on the order. Line totals include historical modifier charges; line discounts are zero because checkout does not store per-line discounts.</Body></Card>
      {sale.payments.map(payment=><Card key={payment.id} title={`${payment.method} · ${payment.status}`}>
        <Body>Payment ID: {payment.id}</Body><Body>Amount: {salesAmount(payment.amount)}</Body><Body>Payment created: {payment.createdAt}</Body>
        <Body>Collected: {payment.paidAt??"Not collected"}</Body><Body>Cashier: {payment.collectedByUserId??"Not recorded"}</Body>
      </Card>)}
      <Card title="Chronological transaction detail">{sale.timeline.map((event,index)=><Body key={`${event.timestamp}:${event.type}:${index}`}>
        {event.timestamp} · {event.type}{event.amount===null?"":` · ${salesAmount(event.amount)}`} · {event.description??""} · Actor: {event.actor??"Not recorded"}
      </Body>)}</Card>
      {sale.refunds.map(refund=><Card key={refund.id} title="Recorded refund">
        <Body>Refund ID: {refund.id}</Body>
        <Body>{refund.refundedAt} · {salesAmount(refund.amount)} · {refund.method}</Body><Body>{refund.reason}</Body>
        <Body>Recorded by {refund.createdBy} at {refund.createdAt}</Body>
        {sale.refundReversals.some(reversal=>reversal.refundId===refund.id)?<Body>Corrected by an appended reversal; original history retained.</Body>:null}
      </Card>)}
      {sale.refundReversals.map(reversal=><Card key={reversal.id} title="Refund reversal">
        <Body>{reversal.createdAt} · {salesAmount(reversal.amount)} restored · {reversal.method}</Body>
        <Body>{reversal.reason} · Recorded by {reversal.createdBy}</Body><Body>Original refund: {reversal.refundId}</Body>
      </Card>)}
      {sale.refunds.some(refund=>!sale.refundReversals.some(reversal=>reversal.refundId===refund.id))?<Card title="Correct an erroneous refund record">
        <Body>A reversal posts a correction dated now and preserves the original refund. Use it when the refund was recorded incorrectly and cash is restored.</Body>
        <Choices label="Original refund" value={reverseId} values={sale.refunds.filter(refund=>!sale.refundReversals.some(reversal=>reversal.refundId===refund.id)).map(refund=>refund.id)} onChange={setReverseId}/>
        <FormField label="Refund reversal reason" value={reverseReason} onChangeText={setReverseReason} maxLength={1000} multiline/>
        <Action title="Review refund reversal" disabled={mutation.busy||!reverseId||!reverseReason.trim()} onPress={()=>setReverseConfirm({id:reverseId,reason:reverseReason.trim()})}/>
        <MutationFeedback {...mutation}/>
      </Card>:null}
      {sale.payments.some(payment=>payment.status==="PAID")?<Card title="Record a completed refund">
        <Body>Record money already returned to the customer. Refunds keep original payments and are capped at their collected amount.</Body>
        <Choices label="Original collected payment" value={paymentId} values={sale.payments.filter(payment=>payment.status==="PAID").map(payment=>payment.id)} onChange={setPaymentId}/>
        <FormField label="Refund amount (whole currency units)" value={amount} onChangeText={setAmount} keyboardType="number-pad"/>
        <FormField label="Actual refund timestamp with offset" placeholder="2026-11-02T14:30:00+06:30" value={when} onChangeText={setWhen} autoCapitalize="none"/>
        <FormField label="Refund/correction reason" value={reason} onChangeText={setReason} maxLength={1000} multiline error={error||undefined}/>
        <Action title="Review refund" disabled={mutation.busy} onPress={prepareRefund}/><MutationFeedback {...mutation}/>
      </Card>:null}
    </>}</QueryResult>
    <ConfirmDialog visible={confirm!==null} title="Post completed refund" message={`Record ${confirm?.amount??""} as returned to the customer? This creates a permanent adjustment.`} confirmLabel="Post refund" onConfirm={postRefund} onCancel={()=>setConfirm(null)}/>
    <ConfirmDialog visible={reverseConfirm!==null} title="Reverse recorded refund" message="Post the full correction dated now? Original history remains visible. A closed cash day must first be reversed." confirmLabel="Post refund reversal" onConfirm={postReversal} onCancel={()=>setReverseConfirm(null)}/>
  </Page>;
}

export function SalesLedgerScreen() {
  const [mode,setMode]=useState("DAY"); const [date,setDate]=useState(""); const [month,setMonth]=useState("");
  const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [product,setProduct]=useState(""); const [order,setOrder]=useState("");
  const [paymentStatus,setPaymentStatus]=useState("ALL"); const [channel,setChannel]=useState("ALL");
  const [filters,setFilters]=useState<SalesLedgerQuery>({}); const [page,setPage]=useState(0);
  const [productPage,setProductPage]=useState(0); const [selected,setSelected]=useState<string|null>(null); const [error,setError]=useState("");
  const exporting=useApiMutation();
  const {state:access}=useOperationsAuth();
  const identity=access.status==="ready"?`${access.userId}:${access.membership.role}`:"";
  const activeIdentity=useRef(identity); activeIdentity.current=identity;
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const query=useApiQuery(signal=>getSalesApi().getLedger({...filters,page,size:20},{signal}),`sales-ledger:${JSON.stringify(filters)}:${page}`);
  const period: SalesPeriodQuery={date:filters.date,month:filters.month,from:filters.from,to:filters.to};
  const products=useApiQuery(signal=>getSalesApi().getProducts({...period,search:filters.product,page:productPage,size:20},{signal}),`sales-products:${JSON.stringify(period)}:${filters.product??""}:${productPage}`);
  function apply() {
    if(mode==="DAY"&&date&&!isIsoDate(date)||mode==="MONTH"&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||mode==="RANGE"&&(!isIsoDate(from)||!isIsoDate(to)||to<from)) {
      setError("Enter a valid day, month or chronological date range (up to one year).");return;
    }
    setError("");setPage(0);setProductPage(0);
    setFilters({...mode==="DAY"?{date:date||undefined}:mode==="MONTH"?{month}:{from,to},product:product||undefined,order:order||undefined,paymentStatus:paymentStatus==="ALL"?undefined:paymentStatus,channel:channel==="ALL"?undefined:channel});
    query.reload();products.reload();
  }
  if(selected) return <Transaction id={selected} onBack={()=>{setSelected(null);query.reload();products.reload();}}/>;
  return <Page title="Sales ledger" subtitle="Historical order snapshots, collections, refunds and cancellations." onRefresh={query.reload} refreshing={query.state.status==="loading"}>
    <Card title="Sales period and filters">
      <Choices label="Period" value={mode} values={["DAY","MONTH","RANGE"]} onChange={setMode}/>
      {mode==="DAY"?<FormField label="Day (YYYY-MM-DD; blank for restaurant today)" value={date} onChangeText={setDate}/>:mode==="MONTH"?<FormField label="Month (YYYY-MM)" value={month} onChangeText={setMonth}/>:<>
        <FormField label="From day (inclusive)" value={from} onChangeText={setFrom}/><FormField label="To day (inclusive)" value={to} onChangeText={setTo}/></>}
      <FormField label="Historical product name or ID" value={product} onChangeText={setProduct}/><FormField label="Order number or ID" value={order} onChangeText={setOrder}/>
      <Choices label="Payment status" value={paymentStatus} values={["ALL","UNPAID","PARTIALLY_PAID","PAID","PARTIALLY_REFUNDED","REFUNDED","CANCELLED"]} onChange={setPaymentStatus}/>
      <Choices label="Order channel" value={channel} values={["ALL","TABLE_QR","COMMON_QR","STAFF","CUSTOMER_APP"]} onChange={setChannel}/>
      {error?<Body>{error}</Body>:null}<Action title="Apply sales filters" onPress={apply}/>
      <Action title="Export filtered CSV" secondary disabled={exporting.busy} onPress={()=>{
        const started=identity;
        void exporting.run(async()=>shareCsv(await getSalesApi().exportCsv(filters),()=>mounted.current&&activeIdentity.current===started));
      }}/>
      <MutationFeedback {...exporting}/>
    </Card>
    <QueryResult {...query}>{data=><>
      {data.content.map(sale=><Card key={sale.id} title={sale.orderNumber}>
        <Body>{sale.createdAt}</Body><Body>{sale.orderType} · {sale.orderChannel} · {sale.status} · {sale.paymentStatus}</Body>
        <Body>Historical total: {salesAmount(sale.totalAmount)} · Discount: {salesAmount(sale.discountAmount)}</Body>
        <Body>{sale.lines.map(line=>`${line.productName} × ${line.quantity}`).join("; ")}</Body>
        <Action title="View transaction details" secondary onPress={()=>setSelected(sale.id)}/>
      </Card>)}
      {!data.content.length?<Card><Body>No sales found for these filters.</Body></Card>:null}
      <Body>Page {data.page+1} · {data.totalElements} orders</Body>
      <Action title="Previous sales page" secondary disabled={page===0} onPress={()=>setPage(page-1)}/>
      <Action title="Next sales page" secondary disabled={(page+1)*data.size>=data.totalElements} onPress={()=>setPage(page+1)}/>
    </>}</QueryResult>
    <Card title="Product breakdown for selected period"><Body>Product quantities and line sales include all channels and payment statuses in this period, before order discounts and delivery fees.</Body>
      <QueryResult {...products}>{data=><>
        <DataTable columns={["Historical product","Quantity","Historical line sales"]} rows={data.content.map(row=>({key:`${row.productId}:${row.historicalName}`,cells:[row.historicalName,row.quantity,salesAmount(row.lineSalesBeforeOrderDiscounts)]}))}/>
        <Action title="Previous product page" secondary disabled={productPage===0} onPress={()=>setProductPage(productPage-1)}/>
        <Action title="Next product page" secondary disabled={(productPage+1)*data.size>=data.totalElements} onPress={()=>setProductPage(productPage+1)}/>
      </>}</QueryResult>
    </Card>
  </Page>;
}
