import { useRef, useState } from "react";
import { Link } from "expo-router";
import { ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { CreateStaffOrderRequest, CreateStaffOrderResponse, MenuProductDto } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { MutationFeedback } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField } from "../../components/ui";
import { FormValidationError } from "../../hooks/mutation";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { counterOrderLine, counterOrderRequest, MAX_COUNTER_ORDER_LINES, type CounterOrderLine } from "./counter-order";
import { operationalAmount } from "./format";

type OrderType = CreateStaffOrderRequest["orderType"];

const PAGE_SIZE = 12;
const orderTypes: readonly OrderType[] = ["DINE_IN", "TAKEAWAY"];

export function CounterOrderPanel({ onOrderChanged }: { onOrderChanged(): void }) {
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [tableId, setTableId] = useState("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [lines, setLines] = useState<(CounterOrderLine & { key: number })[]>([]);
  const nextLineKey = useRef(0);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<CreateStaffOrderRequest | null>(null);
  const [receipt, setReceipt] = useState<CreateStaffOrderResponse | null>(null);
  const [validationError, setValidationError] = useState("");
  const [ambiguous, setAmbiguous] = useState(false);
  const mutation = useApiMutation();
  const query = useApiQuery(async signal => {
    if (!open) return null;
    const api = getOperationsApi();
    const [options, menu] = await Promise.all([api.getStaffOrderOptions({ signal }), api.getPublicMenu({ signal })]);
    return { options, menu };
  }, `counter-order:${open}`);

  function submit() {
    const request = pending;
    setPending(null);
    if (!request || ambiguous) return;
    setReceipt(null);
    void mutation.run(() => getOperationsApi().createStaffOrder(request), created => {
      setReceipt(created);
      setLines([]);
      setNote("");
      setProductId("");
      query.reload();
      onOrderChanged();
    }, error => {
      if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError || error instanceof ApiProtocolError
          || error instanceof ApiHttpError && (error.status === 408 || error.status >= 500)) {
        setAmbiguous(true);
        onOrderChanged();
      }
    });
  }

  return <Card title="Counter orders">
    <Action title={open ? "Hide counter order form" : "Create counter order"} secondary disabled={mutation.busy} onPress={() => setOpen(value => !value)} />
    {open ? <>
      <MutationFeedback {...mutation} />
      {receipt ? <Card title={`${receipt.orderNumber} created`}>
        <Body>Total {operationalAmount(receipt.totalAmount)} {receipt.currency} · Payment {receipt.paymentStatus.toLowerCase()}</Body>
        <Link href={{ pathname: "/order/[orderId]", params: { orderId: receipt.orderId } }}>Open new order</Link>
      </Card> : null}
      {ambiguous ? <Card title="Check whether the order was created">
        <Body>The last submission may have reached the restaurant. Check the refreshed Orders list before trying again.</Body>
        <Action title="Refresh orders to check the submission" secondary onPress={onOrderChanged} />
        <Action title="I checked Orders. Allow a new submission" secondary onPress={() => { setAmbiguous(false); mutation.reset(); }} />
      </Card> : null}
      <QueryResult {...query}>{data => {
        if (!data) return null;
        const { options, menu } = data;
        const types = orderTypes.filter(type => type === "DINE_IN" ? options.dineInEnabled && options.tables.length > 0 : options.takeawayEnabled);
        if (!types.length) return <Body>Counter ordering is currently unavailable. Dine-in needs an active table and takeaway must be enabled.</Body>;
        const currentType = orderType && types.includes(orderType) ? orderType : types[0];
        const products = menu.categories.flatMap(category => category.products).filter(product => product.available);
        const product = products.find(item => item.id === productId);
        const term = search.trim().toLocaleLowerCase();
        const matches = products.filter(item => item.name.toLocaleLowerCase().includes(term));
        const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
        const visiblePage = Math.min(page, lastPage);
        return <>
          <Choices label="Order type" value={currentType} values={types} disabled={mutation.busy} onChange={value => { setOrderType(value); setValidationError(""); }} />
          {currentType === "DINE_IN" ? <>
            <Body>Dining table</Body>
            {options.tables.map(table => <Action key={table.id} title={table.tableLabel} secondary={tableId !== table.id}
              selected={tableId === table.id} disabled={mutation.busy} onPress={() => { setTableId(table.id); setValidationError(""); }} />)}
          </> : null}
          {product ? <CounterOrderItem key={product.id} product={product} disabled={mutation.busy || lines.length >= MAX_COUNTER_ORDER_LINES}
            onCancel={() => setProductId("")} onAdd={line => {
              const key = nextLineKey.current++;
              setLines(current => current.length < MAX_COUNTER_ORDER_LINES ? [...current, { ...line, key }] : current);
              setProductId(""); setValidationError("");
            }} /> : <>
            <FormField label="Search available products" value={search} onChangeText={value => { setSearch(value); setPage(0); }} />
            {matches.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE).map(item => <Action key={item.id} title={item.name} secondary
              disabled={mutation.busy || lines.length >= MAX_COUNTER_ORDER_LINES} onPress={() => setProductId(item.id)} />)}
            {!matches.length ? <Body>No available products match your search.</Body> : null}
            {lastPage > 0 ? <>
              <Body>Menu page {visiblePage + 1} of {lastPage + 1}</Body>
              <Action title="Previous menu page" secondary disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)} />
              <Action title="Next menu page" secondary disabled={visiblePage === lastPage} onPress={() => setPage(visiblePage + 1)} />
            </> : null}
          </>}
          <Card title="Order items">
            {lines.length ? lines.map((line, index) => <Card key={line.key} title={`${line.name} × ${line.quantity}`}>
              {line.variantName ? <Body>{line.variantName}</Body> : null}
              {line.modifierLabels.length ? <Body>{line.modifierLabels.join(", ")}</Body> : null}
              {line.specialInstruction ? <Body>{line.specialInstruction}</Body> : null}
              <Action title={`Remove item ${index + 1}`} secondary disabled={mutation.busy} onPress={() => {
                setLines(current => current.filter(item => item.key !== line.key)); setValidationError("");
              }} />
            </Card>) : <Body>Add at least one item.</Body>}
            {lines.length >= MAX_COUNTER_ORDER_LINES ? <Body>The order has reached the maximum of {MAX_COUNTER_ORDER_LINES} item lines.</Body> : null}
          </Card>
          <FormField label="Order note (optional)" value={note} onChangeText={setNote} maxLength={500} editable={!mutation.busy} />
          <MutationFeedback busy={false} message={null} error={validationError || null} />
          <Body>The restaurant calculates the final total. An authorized cashier can collect cash from the order detail after creation.</Body>
          <Action title="Review counter order" disabled={mutation.busy || ambiguous || !lines.length || !!product} onPress={() => {
            setValidationError("");
            try {
              setPending(counterOrderRequest(options, products, currentType, tableId, lines, note));
            } catch (error) {
              if (error instanceof FormValidationError) setValidationError(error.message);
              else throw error;
            }
          }} />
          <Action title="Refresh counter menu and tables" secondary disabled={mutation.busy} onPress={query.reload} />
        </>;
      }}</QueryResult>
    </> : null}
    <ConfirmDialog visible={pending !== null} title="Create counter order" confirmLabel="Create order"
      message={pending ? `Create a ${pending.orderType === "DINE_IN" ? "dine-in" : "takeaway"} order with ${pending.items.length} item lines and a pending cash payment?` : ""}
      onCancel={() => setPending(null)} onConfirm={submit} />
  </Card>;
}

function CounterOrderItem({ product, disabled, onAdd, onCancel }: {
  product: MenuProductDto; disabled: boolean; onAdd(line: CounterOrderLine): void; onCancel(): void;
}) {
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [modifierQuantities, setModifierQuantities] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const added = useRef(false);

  return <Card title={`Add ${product.name}`}>
    {product.variants.length ? <>
      <Body>Choose a variant</Body>
      {product.variants.filter(variant => variant.available).map(variant => <Action key={variant.id}
        title={`${variant.name} · ${operationalAmount(variant.price ?? NaN)}`} secondary={variantId !== variant.id}
        selected={variantId === variant.id} onPress={() => setVariantId(variant.id)} />)}
    </> : <Body>Unit price {operationalAmount(product.price ?? NaN)}</Body>}
    <FormField label="Item quantity" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} maxLength={3} />
    {product.modifierGroups.map(group => <Card key={group.id} title={group.name}>
      <Body>Choose {group.minSelections} to {group.maxSelections} options</Body>
      {group.options.filter(option => option.available).map(option => {
        const selected = option.id in modifierQuantities;
        return <Card key={option.id}>
          <Action title={`${option.name} · ${operationalAmount(option.additionalPrice)}`} secondary={!selected} selected={selected}
            onPress={() => setModifierQuantities(current => {
              const next = { ...current };
              if (selected) delete next[option.id];
              else next[option.id] = "1";
              return next;
            })} />
          {selected ? <FormField label={`${option.name} quantity per item`} keyboardType="number-pad"
            value={modifierQuantities[option.id]} onChangeText={value => setModifierQuantities(current => ({ ...current, [option.id]: value }))} maxLength={2} /> : null}
        </Card>;
      })}
    </Card>)}
    <FormField label="Item instruction (optional)" value={instruction} onChangeText={setInstruction} maxLength={500} />
    <MutationFeedback busy={false} message={null} error={error || null} />
    <Action title="Add item" disabled={disabled} onPress={() => {
      if (added.current) return;
      try {
        const line = counterOrderLine(product, variantId, quantity, modifierQuantities, instruction);
        added.current = true;
        onAdd(line);
      } catch (failure) {
        if (failure instanceof FormValidationError) setError(failure.message);
        else throw failure;
      }
    }} />
    <Action title="Choose another product" secondary onPress={onCancel} />
  </Card>;
}
