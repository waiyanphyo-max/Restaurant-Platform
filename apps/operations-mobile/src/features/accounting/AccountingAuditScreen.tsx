import { useState } from "react";
import type { AccountingAuditEntry, AccountingChronology } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { FinancialPagination } from "./FinancialPagination";
import { chronologicalLabels } from "./expense-cash-form";

const pageSize = 20;

function relatedExpense(entry: AccountingAuditEntry): { id: string; title: string } | null {
  if (entry.entityType !== "EXPENSE" || entry.action !== "CORRECT" && entry.action !== "REPLACE") return null;
  try {
    const detail: unknown = JSON.parse(entry.detailJson);
    if (!detail || typeof detail !== "object") return null;
    const field = entry.action === "CORRECT" ? "replacementExpenseId" : "originalExpenseId";
    const id = (detail as Record<string, unknown>)[field];
    if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
    return { id, title: entry.action === "CORRECT" ? "Replacement expense" : "Original expense" };
  } catch {
    return null;
  }
}

export function AccountingAuditScreen() {
  const [input, setInput] = useState("");
  const [sort, setSort] = useState<AccountingChronology>("NEWEST");
  const [filters, setFilters] = useState<{ search?: string; entityId?: string; sort: AccountingChronology }>({ sort: "NEWEST" });
  const [page, setPage] = useState(0);
  const query = useApiQuery(signal => getOperationsApi().getAccountingAudit(filters.entityId, page, pageSize, { signal },
    { search: filters.search, sort: filters.sort }), JSON.stringify(["accounting-audit", filters, page]));
  function apply(entityId?: string) {
    setPage(0);
    if (entityId) setInput(entityId);
    setFilters({ search: entityId ? undefined : input.trim() || undefined, entityId, sort });
    query.reload();
  }
  return <Page title="Accounting audit history" subtitle="Financial events, responsible members and recorded correction reasons." onRefresh={query.reload}>
    <Card title="Search audit events">
      <FormField label="Search record ID, actor, action, type or reason" value={input} onChangeText={setInput} autoCapitalize="none"
        maxLength={200} returnKeyType="search" onSubmitEditing={() => apply()} />
      <Choices label="Sort by event time" value={sort} values={["NEWEST", "OLDEST"]} labels={chronologicalLabels} onChange={setSort} />
      <Action title="Load audit history" onPress={() => apply()} />
    </Card>
    <QueryResult {...query}>{data => <>
      {data.content.map(entry => {
        const related = relatedExpense(entry);
        return <Card key={entry.id} title={`${entry.entityType.replaceAll("_", " ")} · ${entry.action.replaceAll("_", " ")}`}>
          <Body>{entry.createdAt} · Responsible member {entry.actorId}</Body>
          <Body>Financial record {entry.entityId}</Body>
          {entry.reason ? <Body>Reason {entry.reason}</Body> : null}
          {related ? <>
            <Body>{related.title} {related.id}</Body>
            <Action title={`View audit for ${related.title.toLowerCase()}`} secondary onPress={() => apply(related.id)} />
          </> : null}
        </Card>;
      })}
      {!data.content.length ? <Card title="No matching audit events"><Body>Try another search or clear the search field.</Body></Card> : null}
      <Body>{data.totalElements} audit events</Body>
      <FinancialPagination page={page} totalPages={Math.ceil(data.totalElements / data.size)} onPageChange={setPage} />
    </>}</QueryResult>
  </Page>;
}
