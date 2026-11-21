import { useRef, useState } from "react";
import { View } from "react-native";
import { ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { CreateStaffOrderRequest, CreateStaffOrderResponse, MenuProductDto } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { MutationFeedback } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField } from "../../components/ui";
import { FormValidationError } from "../../hooks/mutation";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { Choices } from "../management/controls";
import { counterOrderEstimate, counterOrderLine, counterOrderReceipt, counterOrderRequest, MAX_COUNTER_ORDER_LINES, type CounterOrderLine } from "./counter-order";
import { exactTimestamp, operationalAmount } from "./format";
import { CounterProductMedia } from "./CounterProductMedia";
import { RouteAction } from "../../navigation/RouteAction";

type OrderType = CreateStaffOrderRequest["orderType"];

const PAGE_SIZE = 12;
const orderTypes: readonly OrderType[] = ["DINE_IN", "TAKEAWAY"];

export function CounterOrderPanel({ onOrderChanged }: { onOrderChanged(): void }) {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER", "STAFF"].includes(state.membership.role)) return null;
  return <CounterOrderDraft key={`${state.membership.restaurantId}:${state.userId}:${state.membership.role}`} onOrderChanged={onOrderChanged} />;
}

function CounterOrderDraft({ onOrderChanged }: { onOrderChanged(): void }) {
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [tableId, setTableId] = useState("");
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [lines, setLines] = useState<(CounterOrderLine & { key: number })[]>([]);
  const nextLineKey = useRef(0);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{ request: CreateStaffOrderRequest; summary: string } | null>(null);
  const [receipt, setReceipt] = useState<CreateStaffOrderResponse | null>(null);
  const [validationError, setValidationError] = useState("");
  const [ambiguous, setAmbiguous] = useState(false);
  const uncertain = useRef(false);
  const [checkRequested, setCheckRequested] = useState(false);
  const [discard, setDiscard] = useState(false);
  const mutation = useApiMutation();
  const query = useApiQuery(async signal => {
    if (!open) return null;
    const api = getOperationsApi();
    const [options, menu] = await Promise.all([api.getStaffOrderOptions({ signal }), api.getPublicMenu({ signal })]);
    return { options, menu };
  }, `counter-order:${open}`);
  const reconciliation = useApiQuery(signal => ambiguous && checkRequested
    ? getOperationsApi().listOrders({ page: 0, size: 20 }, { signal }) : Promise.resolve(null),
  `counter-reconciliation:${ambiguous}:${checkRequested}`);

  function submit() {
    const request = pending?.request;
    setPending(null);
    if (!request || uncertain.current) return;
    setReceipt(null);
    void mutation.run(async () => counterOrderReceipt(await getOperationsApi().createStaffOrder(request), request.orderType), created => {
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
        uncertain.current = true;
        setCheckRequested(false);
        onOrderChanged();
      }
    });
  }

  return <Card title="Counter orders · ကောင်တာအော်ဒါ">
    <Action title={open ? "Hide counter order form" : "Create counter order"} secondary disabled={mutation.busy} onPress={() => setOpen(value => !value)} />
    {open ? <>
      <MutationFeedback {...mutation} />
      {receipt ? <Card title={`${receipt.orderNumber} created`}>
        <Body accessibilityLiveRegion="polite">Counter order received · ကောင်တာအော်ဒါ လက်ခံရရှိပြီး</Body>
        <Body>Order {receipt.status.replaceAll("_", " ")} · {receipt.orderType.replaceAll("_", " ")}</Body>
        {receipt.queueDisplayCode ? <Card title="Pickup code · လာယူရန်ကုဒ်"><Body style={{ fontSize: 32, lineHeight: 44 }}>{receipt.queueDisplayCode}</Body>
          <Body>Kitchen readiness and physical pickup remain separate. Calling this code does not collect cash.</Body></Card> : null}
        <Body>Total {operationalAmount(receipt.totalAmount)} {receipt.currency} · Payment {receipt.paymentStatus.toLowerCase()}</Body>
        <Body>Cash is recorded separately after it is physically received. အမှန်တကယ် ငွေလက်ခံပြီးမှ ငွေကောက်ခံမှုကို သီးခြားမှတ်တမ်းတင်ပါ။</Body>
        <RouteAction href={{ pathname: "/order/[orderId]", params: { orderId: receipt.orderId } }} title="Open new order" secondary />
      </Card> : null}
      {ambiguous ? <Card title="Check whether the order was created">
        <Body>The last submission may have reached the restaurant. Check the refreshed Orders list before trying again.</Body>
        <Body>အော်ဒါရလဒ် မသေချာပါ။ အသစ်ထပ်မတင်မီ လက်ရှိအော်ဒါများကို ပြန်စစ်ပါ။</Body>
        <Action title="Refresh orders to check the submission" secondary disabled={mutation.busy} onPress={() => {
          setCheckRequested(true); reconciliation.reload(); onOrderChanged();
        }} />
        {checkRequested ? <QueryResult {...reconciliation}>{result => result ? <>
          <Body>Latest {result.content.length} of {result.totalElements} orders. Use All statuses and other pages in Orders; this list cannot prove that a submission was not created.</Body>
          {result.content.map(order => <Card key={order.id} title={order.orderNumber}>
            <Body>{exactTimestamp(order.createdAt)} · {order.status} · {operationalAmount(order.totalAmount)}</Body>
            <RouteAction href={{ pathname: "/order/[orderId]", params: { orderId: order.id } }} title="Review this order" secondary />
          </Card>)}
          <RouteAction href="/orders" title="Open the full Orders list" secondary />
        </> : null}</QueryResult> : null}
        <Action title="I checked Orders. Allow a new submission" secondary
          disabled={!checkRequested || reconciliation.state.status !== "ready" || !reconciliation.state.data}
          onPress={() => {
            if (!checkRequested || reconciliation.state.status !== "ready" || !reconciliation.state.data) return;
            uncertain.current = false; setAmbiguous(false); setCheckRequested(false); mutation.reset();
          }} />
      </Card> : null}
      <QueryResult {...query}>{data => {
        if (!data) return null;
        const { options, menu } = data;
        const types = orderTypes.filter(type => type === "DINE_IN" ? options.dineInEnabled && options.tables.length > 0 : options.takeawayEnabled);
        if (!types.length) return <Body>Counter ordering is currently unavailable. Dine-in needs an active table and takeaway must be enabled.</Body>;
        const currentType = orderType && types.includes(orderType) ? orderType : types[0];
        const products = menu.categories.flatMap(category => category.products);
        const product = products.find(item => item.id === productId);
        const terms = search.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
        const matches = products.filter(item => terms.every(term => `${item.name} ${item.variants.map(variant => variant.name).join(" ")}`.normalize("NFKC").toLocaleLowerCase().includes(term)));
        const estimate = counterOrderEstimate(products, lines);
        const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
        const visiblePage = Math.min(page, lastPage);
        return <>
          <Choices label="Service mode · ဝန်ဆောင်မှုပုံစံ" value={currentType} values={types}
            labels={{ DINE_IN: "Dine-in · ဆိုင်ထိုင်", TAKEAWAY: "Takeaway · ပါဆယ်" }} disabled={mutation.busy || ambiguous} onChange={value => { setOrderType(value); setValidationError(""); }} />
          {currentType === "DINE_IN" ? <>
            <Body>Dining table · စားပွဲ</Body>
            {options.tables.map(table => <Action key={table.id} title={table.tableLabel} secondary={tableId !== table.id}
              selected={tableId === table.id} disabled={mutation.busy || ambiguous} onPress={() => { setTableId(table.id); setValidationError(""); }} />)}
          </> : null}
          {product ? <CounterOrderItem key={product.id} product={product} currency={menu.currency} disabled={mutation.busy || ambiguous || lines.length >= MAX_COUNTER_ORDER_LINES}
            onCancel={() => setProductId("")} onAdd={line => {
              const key = nextLineKey.current++;
              setLines(current => current.length < MAX_COUNTER_ORDER_LINES ? [...current, { ...line, key }] : current);
              setProductId(""); setValidationError("");
            }} /> : <>
            <FormField label="Search menu · မီနူးရှာရန်" value={search} editable={!mutation.busy} onChangeText={value => { setSearch(value); setPage(0); }} />
            {matches.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE).map(item => {
              const available = item.available && (!item.trackStock || (item.stockQuantity ?? 0) > 0)
                && (!item.variants.length || item.variants.some(variant => variant.available));
              return <Card key={item.id}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <CounterProductMedia uri={item.imageUrl} label={item.name} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body style={{ fontWeight: "600" }}>{item.name}</Body>
                    {item.description ? <Body tone="muted">{item.description}</Body> : null}
                    <Body>{available ? "Available · ရရှိနိုင်သည်" : "Unavailable · မရရှိနိုင်ပါ"}{item.trackStock ? ` · Stock ${item.stockQuantity ?? 0}` : ""}</Body>
                  </View>
                </View>
                <Action title={`Choose ${item.name}`} secondary disabled={!available || mutation.busy || ambiguous || lines.length >= MAX_COUNTER_ORDER_LINES} onPress={() => setProductId(item.id)} />
              </Card>;
            })}
            {!matches.length ? <Body>No available products match your search.</Body> : null}
            {lastPage > 0 ? <>
              <Body>Menu page {visiblePage + 1} of {lastPage + 1}</Body>
              <Action title="Previous menu page" secondary disabled={visiblePage === 0} onPress={() => setPage(visiblePage - 1)} />
              <Action title="Next menu page" secondary disabled={visiblePage === lastPage} onPress={() => setPage(visiblePage + 1)} />
            </> : null}
          </>}
          <Card title="Current basket · လက်ရှိခြင်းတောင်း">
            {lines.length ? lines.map((line, index) => <Card key={line.key} title={`${line.name} × ${line.quantity}`}>
              {line.variantName ? <Body>{line.variantName}</Body> : null}
              {line.modifierLabels.length ? <Body>{line.modifierLabels.join(", ")}</Body> : null}
              {line.specialInstruction ? <Body>{line.specialInstruction}</Body> : null}
              <Body>Menu estimate: {operationalAmount(counterOrderEstimate(products, [line]) ?? NaN)} {menu.currency}</Body>
              <Action title={`Remove item ${index + 1}`} secondary disabled={mutation.busy || ambiguous} onPress={() => {
                setLines(current => current.filter(item => item.key !== line.key)); setValidationError("");
              }} />
            </Card>) : <Body>Add at least one item.</Body>}
            {lines.length >= MAX_COUNTER_ORDER_LINES ? <Body>The order has reached the maximum of {MAX_COUNTER_ORDER_LINES} item lines.</Body> : null}
          </Card>
          <FormField label="Order note (optional) · အော်ဒါမှတ်ချက်" value={note} onChangeText={setNote} multiline maxLength={500} editable={!mutation.busy && !ambiguous} />
          <MutationFeedback busy={false} message={null} error={validationError || null} />
          <Body>The restaurant calculates the final total. An authorized cashier can collect cash from the order detail after creation.</Body>
          {lines.length ? <Body>Current-menu estimate: {operationalAmount(estimate ?? NaN)} {menu.currency}. Final amount comes from the server receipt.</Body> : null}
          <Action title="Review counter order" disabled={mutation.busy || ambiguous || !lines.length || !!product} onPress={() => {
            setValidationError("");
            try {
              const request = counterOrderRequest(options, products, currentType, tableId, lines, note);
              const table = options.tables.find(item => item.id === request.tableId);
              setPending({ request, summary: [request.orderType === "DINE_IN" ? `Dine-in · ${table?.tableLabel ?? ""}` : "Takeaway",
                ...lines.map(line => `${line.quantity} × ${line.name}${line.variantName ? ` · ${line.variantName}` : ""}${line.modifierLabels.length ? ` · ${line.modifierLabels.join(", ")}` : ""}${line.specialInstruction ? `\nKitchen: ${line.specialInstruction}` : ""}`),
                note.trim() ? `Note: ${note.trim()}` : "", `Current-menu estimate ${operationalAmount(estimate ?? NaN)} ${menu.currency}. The server calculates the final total.`,
                "Payment remains pending. No cash collection is recorded by this action. ငွေပေးချေမှုသည် မရှင်းရသေးအဖြစ် ဆက်ရှိမည်။"].filter(Boolean).join("\n\n") });
            } catch (error) {
              if (error instanceof FormValidationError) setValidationError(error.message);
              else throw error;
            }
          }} />
          <Action title="Refresh counter menu and tables" secondary disabled={mutation.busy} onPress={query.reload} />
          {lines.length || note || product ? <Action title="Discard counter draft" secondary disabled={mutation.busy || ambiguous} onPress={() => setDiscard(true)} /> : null}
        </>;
      }}</QueryResult>
    </> : null}
    <ConfirmDialog visible={pending !== null} title="Review counter order · ကောင်တာအော်ဒါ စစ်ဆေးရန်" confirmLabel="Confirm unpaid counter order"
      message={pending?.summary ?? ""} confirmDisabled={mutation.busy || ambiguous} busy={mutation.busy}
      cancelLabel="Back to basket" onCancel={() => setPending(null)} onConfirm={submit} />
    <ConfirmDialog visible={discard} title="Discard counter draft?" message="Remove these unsubmitted items and kitchen notes? တင်မထားရသေးသော အော်ဒါကို ဖျက်မည်လား။"
      confirmLabel="Discard draft" danger onCancel={() => setDiscard(false)} onConfirm={() => {
        if (mutation.busy || uncertain.current) return;
        setDiscard(false); setLines([]); setNote(""); setProductId(""); setPending(null); setValidationError("");
      }} />
  </Card>;
}

function CounterOrderItem({ product, currency, disabled, onAdd, onCancel }: {
  product: MenuProductDto; currency: string; disabled: boolean; onAdd(line: CounterOrderLine): void; onCancel(): void;
}) {
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [modifierQuantities, setModifierQuantities] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const added = useRef(false);
  const [discard, setDiscard] = useState(false);

  return <Card title={`Add ${product.name}`}>
    {product.variants.length ? <>
      <Body>Choose a variant · အမျိုးအစားရွေးပါ</Body>
      {product.variants.map(variant => <Action key={variant.id}
        title={`${variant.name} · ${operationalAmount(variant.price ?? NaN)} ${currency}${variant.available ? "" : " · Unavailable"}`} secondary={variantId !== variant.id}
        selected={variantId === variant.id} disabled={disabled || !variant.available} onPress={() => setVariantId(variant.id)} />)}
    </> : <Body>Unit price {operationalAmount(product.price ?? NaN)} {currency}</Body>}
    {product.trackStock ? <Body>Available stock: {product.stockQuantity ?? 0}</Body> : null}
    <FormField label="Item quantity · အရေအတွက်" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} editable={!disabled} maxLength={3} />
    {product.modifierGroups.map(group => <Card key={group.id} title={group.name}>
      <Body>{group.required || group.minSelections > 0 ? "Required · မဖြစ်မနေ" : "Optional · စိတ်ကြိုက်"} · Choose {group.minSelections} to {group.maxSelections} options</Body>
      {group.options.map(option => {
        const selected = option.id in modifierQuantities;
        return <Card key={option.id}>
          <Action title={`${option.name} · +${operationalAmount(option.additionalPrice)} ${currency}${option.available ? "" : " · Unavailable"}`} secondary={!selected} selected={selected} disabled={disabled || !option.available}
            onPress={() => setModifierQuantities(current => {
              const next = { ...current };
              if (selected) delete next[option.id];
              else next[option.id] = "1";
              return next;
            })} />
          {selected ? <FormField label={`${option.name} quantity per item`} keyboardType="number-pad"
            value={modifierQuantities[option.id]} editable={!disabled} onChangeText={value => setModifierQuantities(current => ({ ...current, [option.id]: value }))} maxLength={2} /> : null}
        </Card>;
      })}
    </Card>)}
    <FormField label="Kitchen instruction (optional) · မီးဖိုချောင်မှတ်ချက်" value={instruction} onChangeText={setInstruction} multiline editable={!disabled} maxLength={500} />
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
    <Action title="Choose another product" secondary disabled={disabled} onPress={() => {
      if (variantId || quantity !== "1" || instruction || Object.keys(modifierQuantities).length) setDiscard(true);
      else onCancel();
    }} />
    <ConfirmDialog visible={discard} title="Discard product choices?" message="Leave without adding these choices and kitchen instructions? မသိမ်းရသေးသော ရွေးချယ်မှုများကို ဖျက်မည်လား။"
      confirmLabel="Discard choices" danger onCancel={() => setDiscard(false)} onConfirm={onCancel} />
  </Card>;
}
