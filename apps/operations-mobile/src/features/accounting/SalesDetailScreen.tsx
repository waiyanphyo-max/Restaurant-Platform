import { useState } from "react";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { SalesLedgerOrder, SalesRefundRequest } from "@restaurant-platform/shared-types";
import { QueryResult } from "../../components/QueryResult";
import { MutationFeedback } from "../../components/forms";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { Choices } from "../management/controls";
import type { FinancialRequestKeys } from "./financial-requests";
import { remainingRefundAmount, validRefundReview } from "./sales-refund-review";
import { getSalesApi, salesAmount } from "./salesApi";

export function SalesDetailScreen({id, requestKeys, onBack}: {id: string; requestKeys: FinancialRequestKeys; onBack():void}) {
  const query=useApiQuery(signal=>getSalesApi().getOrder(id,{signal}),`sales-transaction:${id}`);
  const mutation=useApiMutation();
  const [paymentId,setPaymentId]=useState(""); const [amount,setAmount]=useState("");
  const [when,setWhen]=useState(""); const [reason,setReason]=useState("");
  const [confirm,setConfirm]=useState<SalesRefundRequest|null>(null); const [error,setError]=useState("");
  const [reverseId,setReverseId]=useState(""); const [reverseReason,setReverseReason]=useState("");
  const [reverseConfirm,setReverseConfirm]=useState<{id:string;reason:string}|null>(null);
  const [reconciled, setReconciled] = useState<SalesLedgerOrder | null>(null);
  const [denied, setDenied] = useState(false);
  const [, updateHold] = useState(0);
  const operations = [`refund:${id}`, `refund-reversal:${id}`];
  const uncertain = operations.some(operation => requestKeys.isUncertain(operation));
  const pending = operations.some(operation => requestKeys.isPending(operation));
  const eligiblePayments = query.state.status === "ready" ? query.state.data.payments.filter(payment => payment.status === "PAID" && payment.paidAt !== null) : [];
  const sale = query.state.status === "ready" ? query.state.data : null;
  const reversedRefundIds = new Set(sale?.refundReversals.map(reversal => reversal.refundId));
  const activeRefunds = sale?.refunds.filter(refund => !reversedRefundIds.has(refund.id)) ?? [];
  function failure(operation: string, body: unknown, error: unknown) {
    if (error instanceof ApiHttpError && error.status === 403) { setDenied(true); return; }
    if (!(error instanceof ApiHttpError) || error.status >= 500 || error.status === 409) {
      requestKeys.markUncertain(operation, body); setReconciled(null); updateHold(value => value + 1);
    }
  }
  async function dispatch<T>(operation: string, body: unknown, action: (key: string) => Promise<T>) {
    if (!requestKeys.begin(operation, body)) throw new FormValidationError("Check the earlier financial action before posting again. ယခင်တင်ပြမှုကို စစ်ဆေးပါ။");
    try {
      const result = await action(requestKeys.key(operation, body));
      requestKeys.complete(operation, body);
      return result;
    } catch (error) {
      if (error instanceof ApiHttpError && error.status < 500 && error.status !== 409) { requestKeys.settle(operation); requestKeys.reconcile(operation); }
      throw error;
    } finally { requestKeys.settle(operation); }
  }
  function prepareRefund() {
    const body = {paymentId,amount,refundedAt:when,reason:reason.trim()};
    if(uncertain || !sale || !validRefundReview(sale, body)) {
      setError("Choose a collected payment and an amount within its remaining balance. Enter the actual refund time with offset, at/after collection and not in the future, and a reason. ကျန်လက်ကျန်၊ အမှန်တကယ် ပြန်အမ်းချိန်နှင့် အကြောင်းပြချက်ကို စစ်ဆေးပါ။"); return;
    }
    setError(""); setConfirm({paymentId,amount,refundedAt:when,reason:reason.trim()});
  }
  function postRefund() {
    if(!confirm || uncertain || mutation.busy) return;
    const body=confirm; setConfirm(null);
    const operation = `refund:${id}`;
    void mutation.run(() => dispatch(operation, body, key => getSalesApi().refund(id, body, key)), () => {
      query.reload(); setAmount(""); setReason(""); setWhen(""); setPaymentId("");
    }, error => failure(operation, body, error));
  }
  function postReversal() {
    if(!reverseConfirm || uncertain || mutation.busy) return;
    const value=reverseConfirm;setReverseConfirm(null);
    const operation = `refund-reversal:${id}`;
    void mutation.run(() => dispatch(operation, value, key => getSalesApi().reverseRefund(id, value.id, value.reason, key)), () => {
      query.reload(); setReverseId(""); setReverseReason("");
    }, error => failure(operation, value, error));
  }
  if (denied) return <Page title="Financial permission denied · ငွေကြေးဆိုင်ရာ ခွင့်ပြုချက် မရှိပါ"><Body>Your account cannot access these financial records. Contact the restaurant owner. စားသောက်ဆိုင်ပိုင်ရှင်ထံ ဆက်သွယ်ပါ။</Body></Page>;
  return <Page title="Order and sale detail" subtitle="Historical items, payment events and corrections · မူလအရောင်းနှင့် ငွေပေးချေမှုမှတ်တမ်း" onRefresh={query.reload} refreshing={query.state.status==="loading"}>
    <Action title="Back to detailed sales history" secondary onPress={onBack}/>
    <QueryResult {...query}>{sale=><>
      {uncertain ? <Card title="Financial result needs review · ရလဒ်ကို ပြန်စစ်ဆေးပါ">
        <Body>The earlier action may have reached the server. Do not record another money event until the current refund and correction history has been checked. ယခင်တင်ပြမှု အောင်မြင်ခဲ့ခြင်း ရှိမရှိ မှတ်တမ်းစစ်ဆေးပါ။</Body>
        <Action title="Check current refund history · မှတ်တမ်း ပြန်စစ်ရန်" secondary disabled={mutation.busy||pending} onPress={() => {
          if (operations.some(operation => requestKeys.isPending(operation))) return;
          setReconciled(null);
          void mutation.run(() => getSalesApi().getOrder(id), result => { setReconciled(result); mutation.reset(); }, error => { if (error instanceof ApiHttpError && error.status === 403) setDenied(true); });
        }} />
        {reconciled ? <>
          <Body>{reconciled.orderNumber} · {reconciled.refunds.length} recorded refunds · {reconciled.refundReversals.length} reversals</Body>
          {reconciled.refunds.map(value => <Body key={value.id}>{value.id} · {value.refundedAt} · {salesAmount(value.amount)} · {value.reason}</Body>)}
          {reconciled.refundReversals.map(value => <Body key={value.id}>{value.id} · {value.createdAt} · {salesAmount(value.amount)} · {value.reason}</Body>)}
          <Body>An absent record alone does not prove the earlier action failed. Review any actual money correction before creating a new event. မှတ်တမ်းမတွေ့ရုံဖြင့် မအောင်မြင်ဟု မယူဆပါနှင့်။</Body>
          <Action title="History reviewed; review action again · မှတ်တမ်းစစ်ဆေးပြီးပါပြီ" secondary onPress={() => {
            operations.forEach(operation => requestKeys.reconcile(operation)); setReconciled(null); mutation.reset(); query.reload(); updateHold(value => value + 1);
          }} />
        </> : null}
      </Card> : null}
      <Card title={sale.orderNumber}>
        <Body>Order ID: {sale.id}</Body><Body>Created: {sale.createdAt}</Body><Body>Created by: {sale.createdByUserId??"Not recorded (guest or legacy)"}</Body>
        <Body>{sale.orderChannel} · {sale.orderType} · {sale.status} · {sale.paymentStatus}</Body>
        {sale.tableId?<Body>Table: {sale.tableNumber??"Historical label not recorded"} · {sale.tableId}</Body>:null}
        {sale.queueTicketId?<Body>Queue: {sale.queueDisplayCode??"Historical label not recorded"} · {sale.queueTicketId}</Body>:null}
        <Body>Subtotal: {salesAmount(sale.subtotal)} · Delivery: {salesAmount(sale.deliveryFee)}</Body>
        <Body>Order discount: {salesAmount(sale.discountAmount)} · Total: {salesAmount(sale.totalAmount)}</Body>
        <Body tone="muted">Original prices and options stay unchanged. Payment and refund times are separate events. မူလဈေးနှုန်းများ မပြောင်းလဲပါ။</Body>
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
      <Card title="Chronological transaction detail · ဖြစ်စဉ်မှတ်တမ်း">{sale.timeline.length ? sale.timeline.map((event,index)=><Card key={`${event.timestamp}:${event.type}:${index}`} title={event.type.replaceAll("_", " ")}>
        <Body>{event.timestamp}</Body>{event.amount===null?null:<Body>{salesAmount(event.amount)}</Body>}
        {event.description ? <Body>{event.description}</Body> : null}<Body>Actor: {event.actor??"Not recorded"}</Body>
      </Card>) : <Body>No recorded timeline events · ဖြစ်စဉ်မှတ်တမ်း မရှိပါ။</Body>}</Card>
      {sale.refunds.map(refund=><Card key={refund.id} title="Recorded refund">
        <Body>Refund ID: {refund.id}</Body>
        <Body>{refund.refundedAt} · {salesAmount(refund.amount)} · {refund.method}</Body><Body>{refund.reason}</Body>
        <Body>Recorded by {refund.createdBy} at {refund.createdAt}</Body>
        {reversedRefundIds.has(refund.id)?<Body>The reversal below preserves the original refund in the audit trail.</Body>:null}
      </Card>)}
      {sale.refundReversals.map(reversal=><Card key={reversal.id} title="Refund reversal">
        <Body>{reversal.createdAt} · {salesAmount(reversal.amount)} correction · {reversal.method}</Body>
        <Body>{reversal.reason} · Recorded by {reversal.createdBy}</Body><Body>Original refund: {reversal.refundId}</Body>
      </Card>)}
      {activeRefunds.length ? <Card title="Correct an erroneous refund record">
        <Body>A reversal records the actual correction dated now and preserves the original refund. Confirm the real correction event before posting; this does not transfer money. မူလပြန်အမ်းမှတ်တမ်းကို ထိန်းသိမ်းပြီး အမှန်တကယ် ပြင်ဆင်မှုကိုသာ မှတ်တမ်းတင်ပါ။</Body>
        <Choices label="Original refund" value={reverseId} values={activeRefunds.map(refund => refund.id)} onChange={setReverseId}
          labels={Object.fromEntries(activeRefunds.map(refund => [refund.id, `${salesAmount(refund.amount)} · ${refund.refundedAt} · ${refund.id.slice(-6)}`]))} />
        <FormField label="Refund reversal reason" value={reverseReason} onChangeText={setReverseReason} maxLength={1000} multiline/>
        <Action title="Review refund reversal · ပြန်လည်စစ်ဆေးရန်" danger disabled={mutation.busy||uncertain||!activeRefunds.some(refund => refund.id === reverseId)||!reverseReason.trim()} onPress={()=>setReverseConfirm({id:reverseId,reason:reverseReason.trim()})}/>
      </Card>:null}
      {eligiblePayments.length ? <Card title="Record a completed refund">
        <Body>Record money already returned to the customer. This does not initiate a transfer. Refunds keep original payments and are capped at their collected amount. ဖောက်သည်အား အမှန်တကယ် ပြန်အမ်းပြီးသော ငွေကိုသာ မှတ်တမ်းတင်ပါ။</Body>
        <Choices label="Original collected payment" value={paymentId} values={eligiblePayments.map(payment=>payment.id)} onChange={setPaymentId}
          labels={Object.fromEntries(eligiblePayments.map(payment => [payment.id, `${payment.method.replaceAll("_", " ")} · ${salesAmount(payment.amount)} · ${payment.id.slice(-6)}`]))} />
        <FormField label="Refund amount (whole currency units)" value={amount} onChangeText={setAmount} keyboardType="number-pad"/>
        {paymentId ? <Body>Remaining refundable amount · ပြန်အမ်းနိုင်သော လက်ကျန်: {salesAmount(remainingRefundAmount(sale, paymentId) ?? "")}</Body> : null}
        <FormField label="Actual refund timestamp with offset" placeholder="2026-11-02T14:30:00+06:30" value={when} onChangeText={setWhen} autoCapitalize="none"/>
        <FormField label="Refund/correction reason" value={reason} onChangeText={setReason} maxLength={1000} multiline error={error||undefined}/>
        <Action title="Review refund · ပြန်အမ်းငွေ စစ်ဆေးရန်" danger disabled={mutation.busy||uncertain} onPress={prepareRefund}/>
      </Card>:null}
    </>}</QueryResult>
    <MutationFeedback {...mutation} />
    <ConfirmDialog visible={confirm!==null} title="Post completed refund · ပြန်အမ်းငွေ မှတ်တမ်းတင်ရန်" message="Record only money already physically returned. This creates a permanent adjustment; no transfer is initiated. ပြန်အမ်းပြီးသော ငွေကိုသာ မှတ်တမ်းတင်ပါ။" confirmLabel="Post refund · အတည်ပြုရန်" cancelLabel="Keep original records · မူလမှတ်တမ်း ထားရန်" danger busy={mutation.busy} confirmDisabled={uncertain} onConfirm={postRefund} onCancel={()=>setConfirm(null)}>
      {confirm ? <><Body>Original payment: {confirm.paymentId}</Body><Body>Refund amount: {salesAmount(confirm.amount)}</Body><Body>Actual time: {confirm.refundedAt}</Body><Body>Reason: {confirm.reason}</Body></> : null}
    </ConfirmDialog>
    <ConfirmDialog visible={reverseConfirm!==null} title="Reverse recorded refund · ပြန်အမ်းမှတ်တမ်း ပြင်ဆင်ရန်" message="Post the actual full correction dated now? Original history remains visible. Finalized cash days remain protected. အမှန်တကယ် ပြင်ဆင်မှုကို အတည်ပြုပါ။" confirmLabel="Post refund reversal · အတည်ပြုရန်" cancelLabel="Keep original refund · မူလပြန်အမ်းမှတ်တမ်း ထားရန်" danger busy={mutation.busy} confirmDisabled={uncertain} onConfirm={postReversal} onCancel={()=>setReverseConfirm(null)}>
      {reverseConfirm ? <><Body>Original refund: {reverseConfirm.id}</Body><Body>Reason: {reverseConfirm.reason}</Body></> : null}
    </ConfirmDialog>
  </Page>;
}
