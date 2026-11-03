import { useState } from "react";
import type { SalesRefundRequest } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { MutationFeedback } from "../../components/forms";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { Choices } from "../management/controls";
import { isFinancialDate } from "./financial-period";
import type { FinancialRequestKeys } from "./financial-requests";
import { getSalesApi, salesAmount } from "./salesApi";

export function SalesDetailScreen({id, requestKeys, onBack}: {id: string; requestKeys: FinancialRequestKeys; onBack():void}) {
  const query=useApiQuery(signal=>getSalesApi().getOrder(id,{signal}),`sales-transaction:${id}`);
  const mutation=useApiMutation();
  const [paymentId,setPaymentId]=useState(""); const [amount,setAmount]=useState("");
  const [when,setWhen]=useState(""); const [reason,setReason]=useState("");
  const [confirm,setConfirm]=useState<SalesRefundRequest|null>(null); const [error,setError]=useState("");
  const [reverseId,setReverseId]=useState(""); const [reverseReason,setReverseReason]=useState("");
  const [reverseConfirm,setReverseConfirm]=useState<{id:string;reason:string}|null>(null);
  const eligiblePayments = query.state.status === "ready" ? query.state.data.payments.filter(payment => payment.status === "PAID" && payment.paidAt !== null) : [];
  const sale = query.state.status === "ready" ? query.state.data : null;
  const reversedRefundIds = new Set(sale?.refundReversals.map(reversal => reversal.refundId));
  const activeRefunds = sale?.refunds.filter(refund => !reversedRefundIds.has(refund.id)) ?? [];
  function prepareRefund() {
    if(!eligiblePayments.some(payment => payment.id === paymentId) || !/^[1-9]\d{0,18}$/.test(amount) || BigInt(amount) > 9223372036854775807n
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(when)
        || !isFinancialDate(when.slice(0,10)) || !Number.isFinite(Date.parse(when)) || !reason.trim()) {
      setError("Choose a collected payment, enter a positive whole amount, exact timestamp with offset, and correction reason."); return;
    }
    setError(""); setConfirm({paymentId,amount,refundedAt:when,reason:reason.trim()});
  }
  function postRefund() {
    if(!confirm) return;
    const body=confirm; setConfirm(null);
    const operation = `refund:${id}`;
    void mutation.run(() => getSalesApi().refund(id, body, requestKeys.key(operation, body)), () => {
      requestKeys.complete(operation, body);
      query.reload(); setAmount(""); setReason(""); setWhen(""); setPaymentId("");
    });
  }
  function postReversal() {
    if(!reverseConfirm) return;
    const value=reverseConfirm;setReverseConfirm(null);
    const operation = `refund-reversal:${id}`;
    void mutation.run(() => getSalesApi().reverseRefund(id, value.id, value.reason, requestKeys.key(operation, value)), () => {
      requestKeys.complete(operation, value);
      query.reload(); setReverseId(""); setReverseReason("");
    });
  }
  return <Page title="Order and sale detail" onRefresh={query.reload} refreshing={query.state.status==="loading"}>
    <Action title="Back to detailed sales history" secondary onPress={onBack}/>
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
      {!sale.lines.length ? <Card title="Historical items"><Body>No item snapshots are available for this order.</Body></Card> : null}
      <Card title="Discounts"><Body>Discounts are recorded on the order. Line totals include historical modifier charges; line discounts are zero because checkout does not store per-line discounts.</Body></Card>
      {sale.payments.map(payment=><Card key={payment.id} title={`${payment.method} · ${payment.status}`}>
        <Body>Payment ID: {payment.id}</Body><Body>Amount: {salesAmount(payment.amount)}</Body><Body>Payment created: {payment.createdAt}</Body>
        <Body>Collected: {payment.paidAt ?? (payment.status === "PAID" || payment.status === "REFUNDED" ? "Collection time unavailable" : "Not collected")}</Body>
        <Body>Cashier: {payment.collectedByUserId??"Not recorded"}</Body>
        {payment.status === "REFUNDED" ? <Body>The legacy refund timestamp is unavailable.</Body> : null}
      </Card>)}
      {!sale.payments.length ? <Card title="Payment records"><Body>No payments recorded for this order.</Body></Card> : null}
      <Card title="Chronological transaction detail">{sale.timeline.map((event,index)=><Body key={`${event.timestamp}:${event.type}:${index}`}>
        {event.timestamp} · {event.type}{event.amount===null?"":` · ${salesAmount(event.amount)}`} · {event.description??""} · Actor: {event.actor??"Not recorded"}
      </Body>)}</Card>
      {sale.refunds.map(refund=><Card key={refund.id} title="Recorded refund">
        <Body>Refund ID: {refund.id}</Body>
        <Body>{refund.refundedAt} · {salesAmount(refund.amount)} · {refund.method}</Body><Body>{refund.reason}</Body>
        <Body>Recorded by {refund.createdBy} at {refund.createdAt}</Body>
        {reversedRefundIds.has(refund.id)?<Body>The reversal below preserves the original refund in the audit trail.</Body>:null}
      </Card>)}
      {sale.refundReversals.map(reversal=><Card key={reversal.id} title="Refund reversal">
        <Body>{reversal.createdAt} · {salesAmount(reversal.amount)} restored · {reversal.method}</Body>
        <Body>{reversal.reason} · Recorded by {reversal.createdBy}</Body><Body>Original refund: {reversal.refundId}</Body>
      </Card>)}
      {activeRefunds.length ? <Card title="Correct an erroneous refund record">
        <Body>A reversal posts a correction dated now and preserves the original refund. Use it when the refund was recorded incorrectly and the money is restored.</Body>
        <Choices label="Original refund" value={reverseId} values={activeRefunds.map(refund => refund.id)} onChange={setReverseId}
          labels={Object.fromEntries(activeRefunds.map(refund => [refund.id, `${salesAmount(refund.amount)} · ${refund.refundedAt} · ${refund.id.slice(-6)}`]))} />
        <FormField label="Refund reversal reason" value={reverseReason} onChangeText={setReverseReason} maxLength={1000} multiline/>
        <Action title="Review refund reversal" disabled={mutation.busy||!activeRefunds.some(refund => refund.id === reverseId)||!reverseReason.trim()} onPress={()=>setReverseConfirm({id:reverseId,reason:reverseReason.trim()})}/>
      </Card>:null}
      {eligiblePayments.length ? <Card title="Record a completed refund">
        <Body>Record money already returned to the customer. Refunds keep original payments and are capped at their collected amount.</Body>
        <Choices label="Original collected payment" value={paymentId} values={eligiblePayments.map(payment=>payment.id)} onChange={setPaymentId}
          labels={Object.fromEntries(eligiblePayments.map(payment => [payment.id, `${payment.method.replaceAll("_", " ")} · ${salesAmount(payment.amount)} · ${payment.id.slice(-6)}`]))} />
        <FormField label="Refund amount (whole currency units)" value={amount} onChangeText={setAmount} keyboardType="number-pad"/>
        <FormField label="Actual refund timestamp with offset" placeholder="2026-11-02T14:30:00+06:30" value={when} onChangeText={setWhen} autoCapitalize="none"/>
        <FormField label="Refund/correction reason" value={reason} onChangeText={setReason} maxLength={1000} multiline error={error||undefined}/>
        <Action title="Review refund" disabled={mutation.busy} onPress={prepareRefund}/>
      </Card>:null}
    </>}</QueryResult>
    <MutationFeedback {...mutation} />
    <ConfirmDialog visible={confirm!==null} title="Post completed refund" message={`Record ${confirm?.amount??""} as returned to the customer? This creates a permanent adjustment.`} confirmLabel="Post refund" onConfirm={postRefund} onCancel={()=>setConfirm(null)}/>
    <ConfirmDialog visible={reverseConfirm!==null} title="Reverse recorded refund" message="Post the full correction dated now? Original history remains visible. A closed cash day must first be reversed." confirmLabel="Post refund reversal" onConfirm={postReversal} onCancel={()=>setReverseConfirm(null)}/>
  </Page>;
}
