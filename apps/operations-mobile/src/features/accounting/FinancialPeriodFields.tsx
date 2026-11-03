import { useState } from "react";
import { Action, Card, FormField } from "../../components/ui";
import { Choices, FormStatus } from "../management/controls";
import { emptyFinancialPeriod, resolveFinancialPeriod, type FinancialPeriodInput } from "./financial-period";

export function FinancialPeriodFields({ value, onChange }: { value: FinancialPeriodInput; onChange(value: FinancialPeriodInput): void }) {
  return <>
    <Choices label="Period" value={value.mode} values={["DAY", "MONTH", "YEAR", "RANGE"]} onChange={mode => onChange({ ...value, mode })}
      labels={{ DAY: "Day", MONTH: "Month", YEAR: "Year", RANGE: "Date range" }} />
    {value.mode === "DAY" ? <FormField label="Day (YYYY-MM-DD)" placeholder="Blank for restaurant today" value={value.day}
      onChangeText={day => onChange({ ...value, day })} maxLength={10} /> : value.mode === "MONTH" ?
      <FormField label="Month (YYYY-MM)" value={value.month} onChangeText={month => onChange({ ...value, month })} maxLength={7} /> : value.mode === "YEAR" ?
        <FormField label="Year (YYYY)" value={value.year} onChangeText={year => onChange({ ...value, year })} maxLength={4} keyboardType="number-pad" /> : <>
          <FormField label="From date (YYYY-MM-DD)" value={value.from} onChangeText={from => onChange({ ...value, from })} maxLength={10} />
          <FormField label="Through date (inclusive)" value={value.to} onChangeText={to => onChange({ ...value, to })} maxLength={10} />
        </>}
  </>;
}

export function FinancialPeriodForm({ onApply }: { onApply(value: ReturnType<typeof resolveFinancialPeriod>): void }) {
  const [period, setPeriod] = useState(emptyFinancialPeriod);
  const [error, setError] = useState<string | null>(null);
  function apply() {
    try {
      const value = resolveFinancialPeriod(period);
      setError(null);
      onApply(value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check the report period.");
    }
  }
  return <Card title="Report period">
    <FinancialPeriodFields value={period} onChange={setPeriod} />
    <FormStatus error={error} />
    <Action title="Apply report period" onPress={apply} />
  </Card>;
}
