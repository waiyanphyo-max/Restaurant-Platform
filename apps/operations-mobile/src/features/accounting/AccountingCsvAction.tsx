import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Platform } from "react-native";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { Action, Body } from "../../components/ui";
import { FormValidationError } from "../../hooks/mutation";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormStatus } from "../management/controls";
import { accountingReportNames, shareAccountingCsv, type AccountingCsvReport } from "./accounting-csv-file";

const oversizedExportCodes = new Set(["SALES_EXPORT_TOO_LARGE", "EXPORT_TOO_LARGE_USE_SHORTER_RANGE"]);

export function AccountingCsvAction({ report, fetchCsv, title, disabled }: {
  report: AccountingCsvReport; fetchCsv(signal: AbortSignal): Promise<string>; title?: string; disabled?: boolean;
}) {
  const { state } = useOperationsAuth();
  const identity = state.status === "ready" ? `${state.userId}:${state.membership.restaurantId}:${state.membership.role}` : "";
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const focused = useRef(false);
  const active = useRef(Platform.OS === "web" || AppState.currentState === "active");
  const request = useRef<AbortController | null>(null);
  const [exported, setExported] = useState(false);
  const mutation = useApiMutation();

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; request.current?.abort(); };
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", status => {
      active.current = status === "active";
      if (!active.current) request.current?.abort();
    });
    return () => { subscription.remove(); request.current?.abort(); };
  }, []);
  useEffect(() => () => request.current?.abort(), [identity, report]);

  function exportReport() {
    if (!identity || !focused.current || !active.current) return;
    void mutation.run(async () => {
      const controller = new AbortController();
      request.current = controller;
      setExported(false);
      const isCurrent = () => !controller.signal.aborted && currentIdentity.current === identity;
      try {
        const content = await fetchCsv(controller.signal);
        return await shareAccountingCsv(report, content, isCurrent) && isCurrent();
      } catch (error) {
        if (!isCurrent()) return false;
        if (error instanceof ApiHttpError && oversizedExportCodes.has(error.code)) throw new FormValidationError("This report is too large to export. Narrow the selected period or filters.");
        if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) throw new FormValidationError("The report could not be downloaded. Check your connection and try again.");
        throw error;
      } finally {
        if (request.current === controller) request.current = null;
      }
    }, setExported);
  }

  return <>
    <Action title={title ?? `Share ${accountingReportNames[report].toLowerCase()} CSV`} secondary disabled={disabled || mutation.busy || !identity} onPress={exportReport} />
    {mutation.busy ? <Body>Preparing report…</Body> : null}
    <FormStatus error={mutation.error} message={exported ? "Report export prepared." : null} />
  </>;
}
