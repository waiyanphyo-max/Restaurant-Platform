import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { Link } from "expo-router";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { AssignedDeliveryDetailDto, DeliveryCoordinatesDto } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { MutationFeedback, FormToggle } from "../../components/forms";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page, StateView } from "../../components/ui";
import { FormValidationError } from "../../hooks/mutation";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { assignedDeliveryUpdate, DELIVERY_ASSIGNMENT_UNAVAILABLE, DeliveryAssignmentUnavailable, DeliveryChanged,
  readAssignedDelivery, recheckAssignedDelivery, type DeliveryUpdateInput } from "./assigned-delivery";
import { openDeliveryMap, TRAVEL_MODES, validDeliveryCoordinates, type MapAction, type TravelMode } from "./delivery-maps";
import { exactTimestamp, operationalAmount } from "./format";
import { deliveryActions } from "./workflows";

export function DeliveryDetailScreen({ deliveryId }: { deliveryId: string }) {
  const { state } = useOperationsAuth();
  if (state.status !== "ready") return null;
  return <ActiveDelivery key={deliveryId} deliveryId={deliveryId} role={state.membership.role} userId={state.userId} />;
}

function ActiveDelivery({ deliveryId, role, userId }: { deliveryId: string; role: string; userId: string }) {
  const [mode, setMode] = useState<TravelMode>("Driving");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);

  const query = useApiQuery(signal => readAssignedDelivery(getOperationsApi().getMyDelivery, deliveryId, userId, signal),
    `assigned-delivery:${deliveryId}`);
  const mutation = useApiMutation();
  const displayed = query.state.status === "ready" ? query.state.data : null;
  const { reload } = query;

  useEffect(() => {
    if (!displayed || mutation.busy) return;
    const check = new AbortController();
    const timer = setInterval(async () => {
      try {
        await recheckAssignedDelivery(getOperationsApi().getMyDelivery, displayed, userId, check.signal);
      } catch {
        // Drop the displayed private details if the assignment could not be reverified.
        if (!check.signal.aborted) reload();
      }
    }, 30_000);
    return () => { clearInterval(timer); check.abort(); };
  }, [displayed, mutation.busy, reload, userId]);

  function refreshAfterFailure(error: unknown) {
    if (error instanceof DeliveryAssignmentUnavailable || error instanceof DeliveryChanged || error instanceof ApiNetworkError
      || error instanceof ApiTimeoutError || error instanceof ApiHttpError && [403, 404, 409].includes(error.status)) {
      query.reload();
    }
  }

  function launchMap(detail: AssignedDeliveryDetailDto, stop: "pickup" | "destination", action: MapAction) {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    void mutation.run(async () => {
      const api = getOperationsApi();
      const fresh = await recheckAssignedDelivery(api.getMyDelivery, detail, userId, signal);
      if (!canNavigate(fresh)) throw new DeliveryChanged();
      if (fresh[stop].latitude !== detail[stop].latitude || fresh[stop].longitude !== detail[stop].longitude) {
        throw new DeliveryChanged();
      }
      const outcome = await openDeliveryMap(url => Linking.openURL(url), fresh[stop], action, mode, signal);
      if (outcome === "no-coordinates") throw new DeliveryChanged();
      if (outcome === "unavailable") throw new FormValidationError("Could not open Google Maps or a browser on this device.");
    }, mutation.reset, refreshAfterFailure);
  }

  function updateStatus(detail: AssignedDeliveryDetailDto, input: DeliveryUpdateInput) {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    void mutation.run(async () => {
      const api = getOperationsApi();
      const fresh = await recheckAssignedDelivery(api.getMyDelivery, detail, userId, signal);
      const body = assignedDeliveryUpdate(fresh, role, userId, input);
      return api.updateDeliveryStatus(deliveryId, body, { signal });
    }, query.reload, refreshAfterFailure);
  }

  return <Page title="Assigned delivery" onRefresh={mutation.busy ? undefined : query.reload} refreshing={query.state.status === "loading"}>
    <Link href="/deliveries">Back to deliveries</Link>
    {mutation.busy ? <Body>Checking the current assignment…</Body> : null}
    <MutationFeedback {...mutation} busy={false} />
    <QueryResult {...query}>{detail => {
      if (!detail) return <StateView kind="denied" title="Delivery unavailable" message={DELIVERY_ASSIGNMENT_UNAVAILABLE} onRetry={query.reload} />;
      const { task, pickup, destination } = detail;
      const navigate = canNavigate(detail);
      return <>
        <Card title={task.orderNumber}>
          <Body>{task.status.replaceAll("_", " ")} · Order {task.orderStatus.replaceAll("_", " ")}</Body>
          {task.assignedAt ? <Body>Assigned {exactTimestamp(task.assignedAt)}</Body> : null}
          {task.pickedUpAt ? <Body>Picked up {exactTimestamp(task.pickedUpAt)}</Body> : null}
          {task.deliveredAt ? <Body>Delivered {exactTimestamp(task.deliveredAt)}</Body> : null}
          {task.failureReason ? <Body>Failure reason: {task.failureReason}</Body> : null}
        </Card>
        {navigate && (validDeliveryCoordinates(pickup) || validDeliveryCoordinates(destination)) ? <Card title="Travel mode">
          {(Object.keys(TRAVEL_MODES) as TravelMode[]).map(option => <Action key={option} title={option}
            secondary={mode !== option} selected={mode === option} disabled={mutation.busy} onPress={() => setMode(option)} />)}
        </Card> : null}
        <Card title="Restaurant pickup">
          <Body>{pickup.name}</Body>
          <Body>{pickup.address ?? "Pickup address unavailable"}</Body>
          <LocationActions location={pickup} available={navigate} busy={mutation.busy} viewLabel="View Pickup on Map"
            navigateLabel="Navigate to Pickup" onOpen={action => launchMap(detail, "pickup", action)} />
        </Card>
        <Card title="Customer destination">
          <Body>{task.deliveryAddress ?? "Delivery address unavailable"}</Body>
          <Body>Recipient: {task.customerName ?? "Name unavailable"}</Body>
          <Body>Phone: {task.customerPhone ?? "Phone unavailable"}</Body>
          <Body>Delivery instructions: {task.deliveryNote ?? "None provided"}</Body>
          <LocationActions location={destination} available={navigate} busy={mutation.busy} viewLabel="View Delivery Location"
            navigateLabel="Navigate to Customer" onOpen={action => launchMap(detail, "destination", action)} />
        </Card>
        <Card title="Order items and instructions">
          {detail.items.length ? detail.items.map(item => <Body key={item.id}>
            {item.quantity} × {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}{item.specialInstruction ? ` · ${item.specialInstruction}` : ""}
          </Body>) : <Body>No items available.</Body>}
          {["OWNER", "MANAGER", "STAFF"].includes(role)
            ? <Link href={{ pathname: "/order/[orderId]", params: { orderId: task.orderId } }}>Open restaurant order</Link> : null}
        </Card>
        <DeliveryWorkPanel key={task.updatedAt} detail={detail} role={role} userId={userId} busy={mutation.busy}
          onUpdate={input => updateStatus(detail, input)} />
        <Action title="Refresh task" secondary disabled={mutation.busy} onPress={query.reload} />
      </>;
    }}</QueryResult>
  </Page>;
}

function canNavigate(detail: AssignedDeliveryDetailDto) {
  return ["ASSIGNED", "PICKED_UP"].includes(detail.task.status) && detail.task.orderStatus !== "CANCELLED";
}

function LocationActions({ location, available, busy, viewLabel, navigateLabel, onOpen }: {
  location: DeliveryCoordinatesDto; available: boolean; busy: boolean; viewLabel: string; navigateLabel: string; onOpen(action: MapAction): void;
}) {
  const valid = validDeliveryCoordinates(location);
  const disabled = busy || !valid || !available;
  return <>
    {valid ? <Body>Latitude {location.latitude} · Longitude {location.longitude}</Body>
      : <Body>Map and navigation unavailable. This location has no verified coordinates.</Body>}
    {valid && !available ? <Body>Map and navigation are available for active delivery tasks.</Body> : null}
    <Action title={viewLabel} secondary disabled={disabled} onPress={() => onOpen("view")} />
    <Action title={navigateLabel} disabled={disabled} onPress={() => onOpen("navigate")} />
  </>;
}

function DeliveryWorkPanel({ detail, role, userId, busy, onUpdate }: {
  detail: AssignedDeliveryDetailDto; role: string; userId: string; busy: boolean;
  onUpdate(input: DeliveryUpdateInput): void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [cashCollected, setCashCollected] = useState(false);
  const actions = deliveryActions(detail.task, role, userId);
  const collecting = detail.cashCollectionRequired && actions.includes("DELIVERED");
  if (!actions.length) return <Card title="Delivery progress"><Body>No status actions are available for this task.</Body></Card>;
  return <Card title="Delivery progress">
    <FormField label="Delivery note for this update (optional)" value={note} onChangeText={setNote} multiline maxLength={2000} editable={!busy} />
    {actions.includes("FAILED") ? <FormField label="Failure reason (required when marking failed)" value={failureReason}
      onChangeText={setFailureReason} multiline maxLength={1000} editable={!busy} /> : null}
    {collecting ? <>
      <Body>Pending cash on delivery · Order total {operationalAmount(detail.task.totalAmount)}</Body>
      <FormToggle label="I collected the cash due for this delivery" value={cashCollected} onChange={setCashCollected} disabled={busy} />
    </> : null}
    {actions.map(action => <Action key={action} title={`Mark ${action.toLowerCase().replaceAll("_", " ")}`}
      disabled={busy || action === "FAILED" && !failureReason.trim() || action === "DELIVERED" && collecting && !cashCollected}
      onPress={() => setStatus(action)} />)}
    <ConfirmDialog visible={status !== null} title="Confirm delivery update"
      message={status === "DELIVERED" && collecting ? "Confirm the delivery and record the cash collected?"
        : `Mark this delivery ${status?.toLowerCase().replaceAll("_", " ") ?? ""}?`}
      confirmLabel="Confirm" onCancel={() => setStatus(null)} onConfirm={() => {
        const confirmed = status;
        setStatus(null);
        if (confirmed) onUpdate({ status: confirmed, note, failureReason, cashCollected });
      }} />
  </Card>;
}
