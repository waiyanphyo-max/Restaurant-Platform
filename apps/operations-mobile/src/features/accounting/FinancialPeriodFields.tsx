import { useState } from "react";
import { Action, Body, Card, FormField } from "../../components/ui";
import { useOperationsText } from "../../navigation/OperationsLanguage";
import { Choices, FormStatus } from "../management/controls";
import { emptyFinancialPeriod, resolveFinancialPeriod, type FinancialPeriodInput } from "./financial-period";

export function FinancialPeriodFields({ value, onChange }: { value: FinancialPeriodInput; onChange(value: FinancialPeriodInput): void }) {
  const t = useOperationsText();
  return <>
    <Choices label={t("Period", "ကာလ")} value={value.mode} values={["DAY", "MONTH", "YEAR", "RANGE"]} onChange={mode => onChange({ ...value, mode })}
      labels={{ DAY: t("Day", "ရက်"), MONTH: t("Month", "လ"), YEAR: t("Year", "နှစ်"), RANGE: t("Date range", "ရက်အပိုင်းအခြား") }} />
    {value.mode === "DAY" ? <FormField label={t("Day (YYYY-MM-DD)", "ရက် (YYYY-MM-DD)")} placeholder={t("Blank for restaurant today", "ဆိုင်၏ ယနေ့အတွက် အလွတ်ထားပါ")} value={value.day}
      onChangeText={day => onChange({ ...value, day })} maxLength={10} /> : value.mode === "MONTH" ?
      <FormField label={t("Month (YYYY-MM)", "လ (YYYY-MM)")} value={value.month} onChangeText={month => onChange({ ...value, month })} maxLength={7} /> : value.mode === "YEAR" ?
        <FormField label={t("Year (YYYY)", "နှစ် (YYYY)")} value={value.year} onChangeText={year => onChange({ ...value, year })} maxLength={4} keyboardType="number-pad" /> : <>
          <FormField label={t("From date (YYYY-MM-DD)", "အစရက် (YYYY-MM-DD)")} value={value.from} onChangeText={from => onChange({ ...value, from })} maxLength={10} />
          <FormField label={t("Through date (inclusive)", "အဆုံးရက် (အပါအဝင်)")} value={value.to} onChangeText={to => onChange({ ...value, to })} maxLength={10} />
        </>}
    <Body tone="muted">{t("Restaurant-local calendar dates, including both end dates. Up to 366 days. A blank day uses the server's restaurant date.", "ဆိုင်၏ ဒေသစံရက်စွဲအတိုင်း အစနှင့်အဆုံးရက် နှစ်ရက်လုံး ပါဝင်သည်။ ၃၆၆ ရက်အထိ ဖြစ်သည်။ ရက်အလွတ်ထားလျှင် ဆာဗာ၏ ဆိုင်ရက်စွဲကို သုံးသည်။")}</Body>
  </>;
}

export function FinancialPeriodForm({ onApply }: { onApply(value: ReturnType<typeof resolveFinancialPeriod>): void }) {
  const t = useOperationsText();
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
  return <Card title={t("Report period", "အစီရင်ခံစာကာလ")}>
    <FinancialPeriodFields value={period} onChange={setPeriod} />
    <FormStatus error={error} />
    <Action title={t("Apply report period", "အစီရင်ခံစာကာလကို သတ်မှတ်မည်")} onPress={apply} />
  </Card>;
}
