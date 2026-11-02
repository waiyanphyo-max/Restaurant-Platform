import { useState } from "react";
import { Link } from "expo-router";
import type { DeliveryTaskDto, DeliveryZoneResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { Choices, FormToggle, MutationFeedback } from "../../components/forms";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useApiMutation } from "../../hooks/useApiMutation";
import { FormValidationError } from "../../hooks/mutation";
import { DELIVERY_STATUSES, deliveryActions } from "./workflows";
import { exactTimestamp, operationalAmount } from "./format";

export function DeliveriesScreen() {
  const { state } = useOperationsAuth();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("ALL");
  // Use the assigned-to-self endpoint for Staff as well as dedicated Drivers.
  const management = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const query = useApiQuery(signal => management
    ? getOperationsApi().listDeliveries({ page, size: 20, status: status === "ALL" ? undefined : status }, { signal })
    : getOperationsApi().listMyDeliveries({ page, size: 20, status: status === "ALL" ? undefined : status }, { signal }), `deliveries:${management}:${page}:${status}`);
  return <Page title="Deliveries" subtitle={management ? "Restaurant delivery activity" : "Deliveries assigned to you"} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Choices label="Delivery status" value={status} values={["ALL", ...DELIVERY_STATUSES]} onChange={value => { setStatus(value); setPage(0); }} />
    <QueryResult {...query}>{data => <>
      {data.content.map(delivery => <DeliveryCard key={`${delivery.id}:${delivery.updatedAt}`} delivery={delivery} reload={query.reload} />)}
      {!data.content.length ? <Card><Body>No deliveries match this filter.</Body></Card> : null}
      <Body>Page {data.number + 1} of {Math.max(1, data.totalPages)} · {data.totalElements} deliveries</Body>
      <Action title="Previous page" secondary disabled={data.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
      <Action title="Next page" secondary disabled={data.last} onPress={() => setPage(value => value + 1)} />
      <Action title="Refresh deliveries" secondary onPress={query.reload} />
    </>}</QueryResult>
    {management ? <DeliveryConfiguration /> : null}
  </Page>;
}

function DeliveryCard({ delivery, reload }: { delivery: DeliveryTaskDto; reload(): void }) {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const userId = state.status === "ready" ? state.userId : "";
  const management = ["OWNER", "MANAGER"].includes(role);
  const mutation = useApiMutation();
  const [expanded, setExpanded] = useState(false);
  const [driver, setDriver] = useState(delivery.driverUserId ?? "");
  const [failureReason, setFailureReason] = useState("");
  const [cash, setCash] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const options = useApiQuery(signal => management && expanded ? getOperationsApi().listDeliveryAssignmentOptions({ signal }) : Promise.resolve([]), `assignment:${management}:${expanded}`);
  return <Card title={delivery.orderNumber}>
    <Body>{delivery.status.replaceAll("_", " ")} · Order {delivery.orderStatus}</Body>
    <Body>{delivery.customerName ?? "Name unavailable"} · {delivery.customerPhone ?? "Phone unavailable"}</Body>
    <Body>{delivery.deliveryAddress ?? "Address unavailable"}</Body>
    <Action title={expanded ? "Hide delivery details" : "Delivery details and actions"} secondary onPress={() => setExpanded(value => !value)} />
    {expanded ? <>
      <Body>{delivery.deliveryNote ?? "No delivery note"}</Body><Body>Order amount: {operationalAmount(delivery.totalAmount)} (payment state must be verified separately)</Body>
      <Body>Assigned user: {delivery.driverUserId ?? "Waiting for assignment"}</Body>
      {delivery.pickedUpAt ? <Body>Picked up: {exactTimestamp(delivery.pickedUpAt)}</Body> : null}
      {delivery.deliveredAt ? <Body>Delivered: {exactTimestamp(delivery.deliveredAt)}</Body> : null}
      {delivery.failureReason ? <Body>Failure: {delivery.failureReason}</Body> : null}
      {["OWNER", "MANAGER", "STAFF"].includes(role) ? <Link href={{ pathname: "/order/[orderId]", params: { orderId: delivery.orderId } }}>Open order and payments</Link> : null}
      <MutationFeedback {...mutation} />
      {management && ["WAITING_ASSIGNMENT", "ASSIGNED", "FAILED"].includes(delivery.status) ? <QueryResult {...options}>{drivers => <>
        <Body>Select an eligible restaurant delivery driver</Body>
        {drivers.map(option => <Action key={option.userId} title={`${driver === option.userId ? "✓ " : ""}${option.fullName ?? option.email ?? option.userId}`} secondary onPress={() => setDriver(option.userId)} />)}
        {!drivers.length ? <Body>No eligible drivers. Invite a Delivery Driver from Team.</Body> : null}
        <Action title="Assign / reassign driver" disabled={mutation.busy || !driver} onPress={() => setPending("ASSIGN")} />
      </>}</QueryResult> : null}
      {deliveryActions(delivery, role, userId).includes("FAILED") ? <FormField label="Failure reason (required when marking failed)" value={failureReason} onChangeText={setFailureReason} maxLength={500} /> : null}
      {deliveryActions(delivery, role, userId).includes("DELIVERED") ? <FormToggle label="I physically collected any cash due on delivery" value={cash} onChange={setCash} disabled={mutation.busy} /> : null}
      {deliveryActions(delivery, role, userId).map(action => <Action key={action} title={`Mark ${action.toLowerCase().replaceAll("_", " ")}`} disabled={mutation.busy || action === "FAILED" && !failureReason.trim()}
        onPress={() => setPending(action)} />)}
    </> : null}
    <ConfirmDialog visible={pending !== null} title="Confirm delivery action" message={pending === "DELIVERED" ? `Complete delivery? Cash collection: ${cash ? "confirmed" : "not confirmed"}. Confirm you received any cash due before completing delivery.` : pending === "ASSIGN" ? "Assign this delivery to the selected restaurant driver?" : pending === "CANCELLED" ? "Cancel this delivery task? The order and its payment stay unchanged. Review the order separately." : `Change delivery status to ${pending ?? ""}?`} confirmLabel="Confirm" onCancel={() => setPending(null)} onConfirm={() => {
      const action = pending; setPending(null); if (!action) return;
      void mutation.run(() => action === "ASSIGN" ? getOperationsApi().assignDriver(delivery.id, { driverUserId: driver })
        : getOperationsApi().updateDeliveryStatus(delivery.id, { status: action, failureReason: failureReason.trim() || null, cashCollected: action === "DELIVERED" ? cash : null }), reload);
    }} />
  </Card>;
}

function DeliveryConfiguration() {
  const [open, setOpen] = useState(false);
  const query = useApiQuery(async signal => {
    if (!open) return null;
    const api = getOperationsApi();
    const [zones, drivers, defaultDriver] = await Promise.all([api.listDeliveryZones({ signal }), api.listDeliveryAssignmentOptions({ signal }), api.getDefaultDriver({ signal })]);
    return { zones, drivers, defaultDriver };
  }, `delivery-config:${open}`);
  const mutation = useApiMutation();
  const [pendingDriver, setPendingDriver] = useState<string | null>(null);
  return <Card title="Delivery configuration"><Action title={open ? "Close configuration" : "Manage coverage, fees and default driver"} secondary onPress={() => setOpen(value => !value)} />
    {open ? <QueryResult {...query}>{data => data ? <>
      <MutationFeedback {...mutation} /><Body>Default driver: {data.drivers.find(driver => driver.userId === data.defaultDriver.defaultDriverUserId)?.fullName ?? data.defaultDriver.defaultDriverUserId ?? "Not configured"}</Body>
      {data.drivers.map(driver => <Action key={driver.userId} title={`Set default: ${driver.fullName ?? driver.email ?? driver.userId}`} secondary disabled={mutation.busy || driver.userId === data.defaultDriver.defaultDriverUserId} onPress={() => setPendingDriver(driver.userId)} />)}
      {!data.drivers.length ? <Body>No eligible Delivery Driver members.</Body> : null}
      {data.zones.map(zone => <ZoneEditor key={`${zone.id}:${zone.name}:${zone.deliveryFee}:${zone.minimumOrder}:${zone.active}:${zone.coverageCity}:${zone.coverageTownship}`} zone={zone} reload={query.reload} />)}
      <ZoneEditor reload={query.reload} />
    </> : null}</QueryResult> : null}
    <ConfirmDialog visible={pendingDriver !== null} title="Change default driver" message="Use this driver for future automatic delivery assignments? Existing assignments will remain." confirmLabel="Set default" onCancel={() => setPendingDriver(null)} onConfirm={() => {
      const id = pendingDriver; setPendingDriver(null); if (id) void mutation.run(() => getOperationsApi().setDefaultDriver({ driverUserId: id }), query.reload);
    }} />
  </Card>;
}

function wholeAmount(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new FormValidationError("Enter a non-negative whole monetary amount within the supported range.");
  return Number(value);
}
function ZoneEditor({ zone, reload }: { zone?: DeliveryZoneResponse; reload(): void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(zone?.name ?? "");
  const [fee, setFee] = useState(String(zone?.deliveryFee ?? 0));
  const [minimum, setMinimum] = useState(String(zone?.minimumOrder ?? 0));
  const [city, setCity] = useState(zone?.coverageCity ?? "");
  const [township, setTownship] = useState(zone?.coverageTownship ?? "");
  const [active, setActive] = useState(zone?.active ?? true);
  const [confirm, setConfirm] = useState(false);
  const mutation = useApiMutation();
  return <Card title={zone ? `${zone.name}${zone.active ? "" : " · inactive"}` : "New delivery zone"}>
    <Action title={open ? "Close zone form" : zone ? "Edit zone and coverage" : "Create delivery zone"} secondary onPress={() => setOpen(value => !value)} />
    {open ? <><FormField label="Zone name" value={name} onChangeText={setName} maxLength={100} />
      <FormField label="Delivery fee (whole amount)" value={fee} onChangeText={setFee} keyboardType="number-pad" />
      <FormField label="Minimum order (whole amount)" value={minimum} onChangeText={setMinimum} keyboardType="number-pad" />
      <FormField label="Coverage city (both coverage fields or neither)" value={city} onChangeText={setCity} maxLength={100} />
      <FormField label="Coverage township" value={township} onChangeText={setTownship} maxLength={100} />
      <FormToggle label="Active zone" value={active} onChange={setActive} />
      <MutationFeedback {...mutation} /><Action title="Save delivery zone" disabled={mutation.busy} onPress={() => setConfirm(true)} />
    </> : <Body>Fee {operationalAmount(zone?.deliveryFee ?? 0)} · Minimum {operationalAmount(zone?.minimumOrder ?? 0)}</Body>}
    <ConfirmDialog visible={confirm} title="Save zone" message="Update delivery coverage and fees? Checkout uses the current zone configuration." confirmLabel="Save" onCancel={() => setConfirm(false)} onConfirm={() => {
      setConfirm(false); void mutation.run(async () => {
        if (!name.trim()) throw new FormValidationError("Enter a zone name.");
        if (!!city.trim() !== !!township.trim()) throw new FormValidationError("Enter both coverage city and township, or leave both blank.");
        const body = { name: name.trim(), deliveryFee: wholeAmount(fee), minimumOrder: wholeAmount(minimum), active, coverageCity: city.trim() || null, coverageTownship: township.trim() || null };
        return zone ? getOperationsApi().updateDeliveryZone(zone.id, body) : getOperationsApi().createDeliveryZone(body);
      }, () => { if (!zone) { setName(""); setCity(""); setTownship(""); setOpen(false); } reload(); });
    }} />
  </Card>;
}
