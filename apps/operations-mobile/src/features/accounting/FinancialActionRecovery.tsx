import { useState } from "react";
import { Action, Body, Card } from "../../components/ui";
import { financialAmount, type useFinancialAction } from "./expense-cash-form";

function sourceLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(sourceLines);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const fields = ["id", "sourceId", "description", "paymentStatus", "status", "date", "expenseDate", "purchasedAt", "occurredAt", "paidAt", "createdAt", "reversedAt", "reversalReason"];
  const amounts = ["amount", "totalAmount", "paidAmount", "amountPaid", "outstandingAmount", "signedAmount", "openingBalance", "expectedClosingCash", "actualCash", "variance"];
  const summary = [...fields.filter(field => typeof row[field] === "string").map(field => `${field}: ${row[field]}`),
    ...amounts.filter(field => typeof row[field] === "string").map(field => `${field}: ${financialAmount(row[field] as string)}`)].join(" · ");
  return [...summary ? [summary] : [], ...["items", "content", "purchase", "expense", "payments", "closing"].flatMap(field => sourceLines(row[field]))];
}

/** A read check never replays a financial write or changes its retained request key. */
export function FinancialActionRecovery<T extends Promise<unknown>>({ action, read, onRead, onChecked }: {
  action: ReturnType<typeof useFinancialAction>; read(): T; onRead?(): void; onChecked?(value: Awaited<T>): void;
}) {
  const [history, setHistory] = useState<string[]>([]);
  if (!action.uncertain) return null;
  return <Card title={action.pending ? "Financial submission pending · တင်သွင်းနေပါသည်" : "Financial result uncertain · ရလဒ်မသေချာပါ"}>
    <Body>The action may already be recorded. Check the current history and review it before another confirmation. No money event is posted by this check. ငွေစာရင်းတွင် ရှိပြီးဖြစ်နိုင်ပါသည်။ မှတ်တမ်းကို ပြန်စစ်ပါ။</Body>
    <Action title="Check financial history · မှတ်တမ်းပြန်စစ်ရန်" disabled={action.busy || action.pending}
      onPress={() => { setHistory([]); void action.reconcile<Awaited<T>>(async (): Promise<Awaited<T>> => await read(), value => { setHistory(sourceLines(value)); onChecked?.(value); }); }} />
    {action.historyChecked ? <>
      <Body>Current source records returned by this check · ယခုရရှိသောမှတ်တမ်းများ</Body>
      {history.length ? history.map((line, index) => <Body key={index}>{line}</Body>) : <Body>No source rows returned by this bounded check. Review the full register if needed. ဤစစ်ဆေးမှုတွင် မှတ်တမ်းမရရှိပါ။</Body>}
      <Body>Review the loaded source records. An absent row does not prove the action failed. Existing request keys are retained. မှတ်တမ်းမတွေ့ခြင်းသည် မတင်ရသေးကြောင်း အထောက်အထား မဟုတ်ပါ။</Body>
      <Action title="I reviewed current history · မှတ်တမ်းစစ်ပြီးပါပြီ" secondary disabled={action.busy || action.pending}
        onPress={() => { action.acknowledgeHistory(); onRead?.(); }} />
    </> : null}
  </Card>;
}
