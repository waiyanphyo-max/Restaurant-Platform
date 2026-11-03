import { useState } from "react";
import type { SalesLedgerQuery, SalesLedgerSort } from "@restaurant-platform/shared-types";
import { Action, Card, FormField } from "../../components/ui";
import { Choices, FormStatus } from "../management/controls";
import { FinancialPeriodFields } from "./FinancialPeriodFields";
import { emptyFinancialPeriod, resolveFinancialPeriod } from "./financial-period";

export const emptySalesHistoryFilters = {
  period: emptyFinancialPeriod, product: "", order: "", paymentStatus: "ALL", channel: "ALL", sort: "NEWEST" as SalesLedgerSort
};
type SalesHistoryFilterInput = typeof emptySalesHistoryFilters;

export function SalesHistoryFilters({ value, onChange, onApply, title = "Apply sales filters" }: {
  value: SalesHistoryFilterInput; onChange(value: SalesHistoryFilterInput): void; onApply(filters: SalesLedgerQuery): void; title?: string;
}) {
  const { period, product, order, paymentStatus, channel, sort } = value;
  const [error, setError] = useState<string | null>(null);
  function apply() {
    try {
      const range = resolveFinancialPeriod(period);
      setError(null);
      onApply({ ...range, product: product.trim() || undefined, order: order.trim() || undefined,
        paymentStatus: paymentStatus === "ALL" ? undefined : paymentStatus, channel: channel === "ALL" ? undefined : channel, sort });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check the sales filters.");
    }
  }
  return <Card title="Sales period and filters">
    <FinancialPeriodFields value={period} onChange={period => onChange({ ...value, period })} />
    <FormField label="Historical product name or ID" value={product} onChangeText={product => onChange({ ...value, product })} maxLength={150} />
    <FormField label="Order number or ID" value={order} onChangeText={order => onChange({ ...value, order })} maxLength={150} />
    <Choices label="Payment status" value={paymentStatus} values={["ALL", "UNPAID", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"]} onChange={paymentStatus => onChange({ ...value, paymentStatus })} />
    <Choices label="Order channel" value={channel} values={["ALL", "TABLE_QR", "COMMON_QR", "STAFF", "CUSTOMER_APP"]} onChange={channel => onChange({ ...value, channel })} />
    <Choices label="Order sorting" value={sort} values={["NEWEST", "OLDEST", "HIGHEST_TOTAL"]} onChange={sort => onChange({ ...value, sort })}
      labels={{ NEWEST: "Newest first", OLDEST: "Oldest first", HIGHEST_TOTAL: "Highest order total" }} />
    <FormStatus error={error} />
    <Action title={title} onPress={apply} />
  </Card>;
}
