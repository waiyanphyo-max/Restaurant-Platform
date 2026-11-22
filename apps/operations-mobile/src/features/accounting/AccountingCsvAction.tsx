import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Platform } from "react-native";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { Action, Body, ConfirmDialog } from "../../components/ui";
import { FormValidationError } from "../../hooks/mutation";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormStatus } from "../management/controls";
import { accountingReportNames, shareAccountingCsv, type AccountingCsvReport } from "./accounting-csv-file";

const oversizedExportCodes = new Set(["SALES_EXPORT_TOO_LARGE", "EXPORT_TOO_LARGE_USE_SHORTER_RANGE"]);

export function AccountingCsvAction({ report, fetchCsv, title, disabled, scopeDescription }: {
  report: AccountingCsvReport; fetchCsv(signal: AbortSignal): Promise<string>; title?: string; disabled?: boolean; scopeDescription?: string;
}) {
  const { state } = useOperationsAuth();
  const identity = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role) ? `${state.userId}:${state.membership.restaurantId}:${state.membership.role}` : "";
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focused = useRef(false);
  const active = useRef(Platform.OS === "web" || AppState.currentState === "active");
  const request = useRef<AbortController | null>(null);
  const [exported, setExported] = useState(false);
  const scope = JSON.stringify([identity, report, scopeDescription]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const deniedScope = useRef<string | null>(null);
  const [review, setReview] = useState<{ scope: string; fetchCsv(signal: AbortSignal): Promise<string> } | null>(null);
  const mutation = useApiMutation();

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; request.current?.abort(); setReview(null); };
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", status => {
      active.current = status === "active";
      if (!active.current) { request.current?.abort(); setReview(null); }
    });
    return () => { subscription.remove(); request.current?.abort(); };
  }, []);
  useEffect(() => () => request.current?.abort(), [scope]);

  function exportReport() {
    if (!review || review.scope !== currentScope.current || review.scope !== scope || deniedScope.current === identity || currentIdentity.current !== identity || disabled || !identity || !focused.current || !active.current) { setReview(null); return; }
    const selected = review; setReview(null);
    void mutation.run(async () => {
      const controller = new AbortController();
      request.current = controller;
      setExported(false);
      const isCurrent = () => !controller.signal.aborted && currentIdentity.current === identity && currentScope.current === selected.scope;
      try {
        const content = await selected.fetchCsv(controller.signal);
        return await shareAccountingCsv(report, content, isCurrent) && isCurrent();
      } catch (error) {
        if (!isCurrent()) return false;
        if (error instanceof ApiHttpError && error.status === 403) deniedScope.current = identity;
        if (error instanceof ApiHttpError && oversizedExportCodes.has(error.code)) throw new FormValidationError("This report is too large to export. Narrow the selected period or filters.");
        if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) throw new FormValidationError("The report could not be downloaded. Check your connection and try again.");
        throw error;
      } finally {
        if (request.current === controller) request.current = null;
      }
    }, setExported);
  }

  return <>
    <Action title={title ?? `Review ${accountingReportNames[report].toLowerCase()} CSV · ထုတ်ယူမှု စစ်ဆေးရန်`} secondary disabled={disabled || mutation.busy || !identity || deniedScope.current === identity} onPress={() => { if (deniedScope.current === identity) return; setExported(false); setReview({ scope, fetchCsv }); }} />
    {mutation.busy ? <Body>Preparing private report… · အစီရင်ခံစာ ပြင်ဆင်နေပါသည်…</Body> : null}
    <FormStatus error={mutation.error} message={exported ? "Report export prepared. · အစီရင်ခံစာ ထုတ်ယူရန် ပြင်ဆင်ပြီးပါပြီ။" : null} />
    <ConfirmDialog visible={review !== null && review.scope === scope} title="Review private export · သီးသန့်ထုတ်ယူမှု စစ်ဆေးရန်"
      message="Contains private business data for this restaurant. Review the applied period and recipient before sharing. စားသောက်ဆိုင်၏ သီးသန့်အချက်အလက်များ ပါဝင်ပါသည်။"
      confirmLabel="Confirm export scope · အတည်ပြုရန်" cancelLabel="Back to report · အစီရင်ခံစာသို့ ပြန်ရန်" busy={mutation.busy} confirmDisabled={disabled || !identity || deniedScope.current === identity}
      onConfirm={exportReport} onCancel={() => setReview(null)}>
      <Body>Report: {accountingReportNames[report]} · CSV</Body>
      <Body>{scopeDescription ?? "All matching records using the applied report filters, within server export limits. သတ်မှတ်စစ်ထုတ်ချက်နှင့် ကိုက်ညီသော မှတ်တမ်းအားလုံး။"}</Body>
      <Body>Server-supported columns only. Custom columns and physical row previews are unavailable. ဆာဗာက ပံ့ပိုးသော ကော်လံများသာ ပါဝင်ပါသည်။</Body>
    </ConfirmDialog>
  </>;
}
