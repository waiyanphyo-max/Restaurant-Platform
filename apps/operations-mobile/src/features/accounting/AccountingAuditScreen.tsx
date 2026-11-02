import { useState } from "react";
import { getOperationsApi } from "../../api";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";

export function AccountingAuditScreen() {
  const [input, setInput] = useState("");const [entityId, setEntityId] = useState<string | undefined>();
  const [page, setPage] = useState(0);const [invalid, setInvalid] = useState(false);
  const query = useApiQuery(signal => getOperationsApi().getAccountingAudit(entityId, page, 20, { signal }), `accounting-audit:${entityId}:${page}`);
  function apply() {
    const value = input.trim();
    if (value && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) { setInvalid(true);return; }
    setInvalid(false);setEntityId(value || undefined);setPage(0);
  }
  return <Page title="Accounting audit history" subtitle="Financial records, responsible members and correction reasons." onRefresh={query.reload}>
    <Card><FormField label="Financial record ID (optional)" value={input} onChangeText={setInput} autoCapitalize="none" error={invalid ? "Enter a complete financial record ID." : undefined} />
      <Action title="Load audit history" onPress={apply} /></Card>
    <QueryResult {...query}>{data => <>
      {data.content.map(entry => <Card key={entry.id} title={`${entry.entityType.replaceAll("_", " ")} · ${entry.action.replaceAll("_", " ")}`}>
        <Body>{entry.createdAt} · Responsible member {entry.actorId}</Body>
        <Body>Financial record {entry.entityId}</Body>
        {entry.reason ? <Body>Reason: {entry.reason}</Body> : null}
      </Card>)}
      {!data.content.length ? <Card><Body>No audit events match this record.</Body></Card> : null}
      <Body>{data.totalElements} audit events · Page {page + 1}</Body>
      <Action title="Previous audit events" secondary disabled={page === 0} onPress={() => setPage(value => value - 1)} />
      <Action title="Next audit events" secondary disabled={(page + 1) * data.size >= data.totalElements} onPress={() => setPage(value => value + 1)} />
    </>}</QueryResult>
  </Page>;
}
