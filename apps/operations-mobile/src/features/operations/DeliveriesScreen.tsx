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
import { canAssignDelivery, DELIVERY_STATUSES, deliveryActions } from "./workflows";
import { exactTimestamp, operationalAmount } from "./format";

export function DeliveriesScreen() {
  const { state } = useOperationsAuth();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("ALL");
  // Use the assigned-to-self endpoint for Staff as well as dedicated Drivers.
  const management = state.status === "ready" && ["OWNER", "MANAGER"].includes(state.membership.role);
  const userId = state.status === "ready" ? state.userId : "";
  const query = useApiQuery(async signal => {
    const api = getOperationsApi();
    const filters = { page, size: 20, status: status === "ALL" ? undefined : status };
    if (management) return { kind: "management" as const, page: await api.listDeliveries(filters, { signal }) };
    const result = await api.listMyDeliveries(filters, { signal });
    const content = result.content.filter(delivery => delivery.driverUserId === userId)
      .map(({ id, orderNumber, orderStatus, status, assignedAt }) => ({ id, orderNumber, orderStatus, status, assignedAt }));
    return { kind: "assigned" as const, page: { ...result, content } };
  }, `deliveries:${management}:${page}:${status}`);
  return <Page title="Deliveries" subtitle={management ? "Restaurant delivery activity" : "Deliveries assigned to you"} onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Choices label="Delivery status" value={status} values={["ALL", ...DELIVERY_STATUSES]} onChange={value => { setStatus(value); setPage(0); }} />
    <QueryResult {...query}>{data => <>
      {data.kind === "management"
        ? data.page.content.map(delivery => <ManagementDeliveryCard key={`${delivery.id}:${delivery.updatedAt}`} delivery={delivery} reload={query.reload} />)
        : data.page.content.map(delivery => <AssignedDeliverySummary key={delivery.id} delivery={delivery} />)}
      {!data.page.content.length ? <Card><Body>{data.kind === "assigned" && status === "ALL" ? "You have no deliveries assigned to you." : "No deliveries match this filter."}</Body></Card> : null}
      <Body>Page {data.page.number + 1} of {Math.max(1, data.page.totalPages)} · {data.page.totalElements} deliveries</Body>
      <Action title="Previous page" secondary disabled={data.page.first} onPress={() => setPage(value => Math.max(0, value - 1))} />
      <Action title="Next page" secondary disabled={data.page.last} onPress={() => setPage(value => value + 1)} />
      <Action title="Refresh deliveries" secondary onPress={query.reload} />
    </>}</QueryResult>
    {management ? <DeliveryConfiguration /> : null}
  </Page>;
}

function AssignedDeliverySummary({ delivery }: {
  delivery: Pick<DeliveryTaskDto, "id" | "orderNumber" | "orderStatus" | "status" | "assignedAt">;
}) {
  return <Card title={delivery.orderNumber}>
    <Body>{delivery.status.replaceAll("_", " ")} · Order {delivery.orderStatus.replaceAll("_", " ")}</Body>
    {delivery.assignedAt ? <Body>Assigned {exactTimestamp(delivery.assignedAt)}</Body> : null}
    <AssignedDeliveryLink deliveryId={delivery.id} />
  </Card>;
}

function AssignedDeliveryLink({ deliveryId }: { deliveryId: string }) {
  return <Link href={{ pathname: "/delivery/[deliveryId]", params: { deliveryId } }}>Open assigned delivery</Link>;
}

function ManagementDeliveryCard({ delivery, reload }: { delivery: DeliveryTaskDto; reload(): void }) {
  const { state } = useOperationsAuth();
  const role = state.status === "ready" ? state.membership.role : "";
  const userId = state.status === "ready" ? state.userId : "";
  const canAssign = canAssignDelivery(delivery);
  const mutation = useApiMutation();
  const [expanded, setExpanded] = useState(false);
  const [driver, setDriver] = useState(delivery.driverUserId ?? "");
  const [failureReason, setFailureReason] = useState("");
  const [note, setNote] = useState("");
  const [cash, setCash] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const options = useApiQuery(signal => canAssign && expanded ? getOperationsApi().listDeliveryAssignmentOptions({ signal }) : Promise.resolve([]), `assignment:${canAssign}:${expanded}`);
  const actions = deliveryActions(delivery, role, userId);
  async function applyDeliveryAction(action: string) {
    const api = getOperationsApi();
    const fresh = await api.getDelivery(delivery.id);
    if (fresh.updatedAt !== delivery.updatedAt || fresh.orderStatus !== delivery.orderStatus) {
      throw new FormValidationError("The delivery changed. Refresh before applying an update.");
    }
    if (action === "ASSIGN" && canAssignDelivery(fresh)) {
      return api.assignDriver(delivery.id, { driverUserId: driver, expectedUpdatedAt: fresh.updatedAt });
    }
    if (!deliveryActions(fresh, role, userId).includes(action)) {
      throw new FormValidationError("This action is unavailable for the current delivery status.");
    }
    return api.updateDeliveryStatus(delivery.id, { status: action, note: note.trim() || null,
      failureReason: action === "FAILED" ? failureReason.trim() : null, cashCollected: action === "DELIVERED" ? cash : null,
      expectedUpdatedAt: fresh.updatedAt });
  }
  return <Card title={delivery.orderNumber}>
    <Body>{delivery.status.replaceAll("_", " ")} · Order {delivery.orderStatus}</Body>
    <Body>{delivery.customerName ?? "Name unavailable"} · {delivery.customerPhone ?? "Phone unavailable"}</Body>
    <Body>{delivery.deliveryAddress ?? "Address unavailable"}</Body>
    {delivery.driverUserId === userId ? <AssignedDeliveryLink deliveryId={delivery.id} /> : null}
    <Action title={expanded ? "Hide delivery details" : "Delivery details and actions"} secondary onPress={() => setExpanded(value => !value)} />
    {expanded ? <>
      <Body>{delivery.deliveryNote ?? "No delivery note"}</Body><Body>Order amount: {operationalAmount(delivery.totalAmount)} (payment state must be verified separately)</Body>
      <Body>Assigned user: {delivery.driverUserId ?? "Waiting for assignment"}</Body>
      {delivery.pickedUpAt ? <Body>Picked up: {exactTimestamp(delivery.pickedUpAt)}</Body> : null}
      {delivery.deliveredAt ? <Body>Delivered: {exactTimestamp(delivery.deliveredAt)}</Body> : null}
      {delivery.failureReason ? <Body>Failure: {delivery.failureReason}</Body> : null}
      <Link href={{ pathname: "/order/[orderId]", params: { orderId: delivery.orderId } }}>Open order and payments</Link>
      <MutationFeedback {...mutation} />
      {canAssign ? <QueryResult {...options}>{members => <>
        <Body>Select an eligible member of this restaurant</Body>
        {members.map(option => <Action key={option.userId}
          title={`${option.fullName ?? option.email ?? option.userId} · ${option.role.replaceAll("_", " ")}${option.userId === userId ? " · You" : ""}`}
          selected={driver === option.userId} secondary={driver !== option.userId} disabled={mutation.busy} onPress={() => setDriver(option.userId)} />)}
        {!members.length ? <Body>No eligible restaurant members were found.</Body> : null}
        <Action title="Assign / reassign member" disabled={mutation.busy || delivery.status === "ASSIGNED" && delivery.driverUserId === driver
          || !members.some(member => member.userId === driver)} onPress={() => setPending("ASSIGN")} />
      </>}</QueryResult> : null}
      {actions.length ? <FormField label="Delivery note for this update (optional)" value={note} onChangeText={setNote} maxLength={2000} editable={!mutation.busy} /> : null}
      {actions.includes("FAILED") ? <FormField label="Failure reason (required when marking failed)" value={failureReason}
        onChangeText={setFailureReason} maxLength={1000} editable={!mutation.busy} /> : null}
      {actions.includes("DELIVERED") ? <FormToggle label="I physically collected any cash due on delivery" value={cash} onChange={setCash} disabled={mutation.busy} /> : null}
      {actions.map(action => <Action key={action} title={`Mark ${action.toLowerCase().replaceAll("_", " ")}`} disabled={mutation.busy || action === "FAILED" && !failureReason.trim()}
        onPress={() => setPending(action)} />)}
    </> : null}
    <ConfirmDialog visible={pending !== null} title="Confirm delivery action" message={pending === "DELIVERED" ? `Complete delivery? Cash collection: ${cash ? "confirmed" : "not confirmed"}. Confirm you received any cash due before completing delivery.` : pending === "ASSIGN" ? "Assign this delivery to the selected restaurant member?" : pending === "CANCELLED" ? "Cancel this delivery task? The order and its payment stay unchanged. Review the order separately." : `Change delivery status to ${pending ?? ""}?`} confirmLabel="Confirm" onCancel={() => setPending(null)} onConfirm={() => {
      const action = pending; setPending(null); if (!action) return;
      void mutation.run(() => applyDeliveryAction(action), reload);
    }} />
  </Card>;
}

function DeliveryConfiguration() {
  const [open, setOpen] = useState(false);
  const query = useApiQuery(async signal => {
    if (!open) return null;
    const api = getOperationsApi();
    const [zones, members, defaultDriver] = await Promise.all([api.listDeliveryZones({ signal }), api.listDeliveryAssignmentOptions({ signal }), api.getDefaultDriver({ signal })]);
    return { zones, drivers: members.filter(member => member.role === "DELIVERY_DRIVER"), defaultDriver };
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
