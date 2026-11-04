import { ApiCancelledError, ApiHttpError } from "@restaurant-platform/api-client";
import type { AssignedDeliveryDetailDto, UpdateDeliveryStatusRequest } from "@restaurant-platform/shared-types";
import { FormValidationError } from "../../hooks/mutation";
import { deliveryActions } from "./workflows";

export type LoadAssignedDelivery = (id: string, options: { signal: AbortSignal }) => Promise<AssignedDeliveryDetailDto>;
export type DeliveryUpdateInput = { status: string; failureReason: string; note: string; cashCollected: boolean };
export const DELIVERY_ASSIGNMENT_UNAVAILABLE = "This delivery may have been reassigned or is no longer available to you.";

export async function readAssignedDelivery(
  load: LoadAssignedDelivery, id: string, userId: string, signal: AbortSignal
): Promise<AssignedDeliveryDetailDto | null> {
  try {
    const detail = await load(id, { signal });
    return detail.task.id.toLowerCase() === id.toLowerCase() && detail.task.driverUserId === userId ? detail : null;
  } catch (error) {
    if (error instanceof ApiHttpError && [403, 404].includes(error.status)) return null;
    throw error;
  }
}

export class DeliveryAssignmentUnavailable extends FormValidationError {
  constructor() { super(DELIVERY_ASSIGNMENT_UNAVAILABLE); }
}

export class DeliveryChanged extends FormValidationError {
  constructor() { super("The delivery changed. Review the latest details before trying again."); }
}

export async function recheckAssignedDelivery(
  load: LoadAssignedDelivery, displayed: AssignedDeliveryDetailDto, userId: string, signal: AbortSignal
) {
  const fresh = await readAssignedDelivery(load, displayed.task.id, userId, signal);
  if (signal.aborted) throw new ApiCancelledError();
  if (!fresh) throw new DeliveryAssignmentUnavailable();
  if (fresh.task.updatedAt !== displayed.task.updatedAt || fresh.task.orderStatus !== displayed.task.orderStatus) {
    throw new DeliveryChanged();
  }
  return fresh;
}

export function assignedDeliveryUpdate(
  detail: AssignedDeliveryDetailDto, role: string, userId: string,
  input: DeliveryUpdateInput
): UpdateDeliveryStatusRequest {
  if (detail.task.driverUserId !== userId) throw new DeliveryAssignmentUnavailable();
  if (!deliveryActions(detail.task, role, userId).includes(input.status)) throw new DeliveryChanged();
  const failureReason = input.status === "FAILED" ? input.failureReason.trim() : "";
  if (input.status === "FAILED" && !failureReason) throw new FormValidationError("Enter a reason for the failed delivery.");
  if (input.status === "DELIVERED" && detail.cashCollectionRequired && !input.cashCollected) {
    throw new FormValidationError("Confirm you received the cash due before completing delivery.");
  }
  return {
    status: input.status,
    note: input.note.trim() || null,
    failureReason: failureReason || null,
    cashCollected: input.status === "DELIVERED" ? input.cashCollected : null,
    expectedUpdatedAt: detail.task.updatedAt
  };
}
