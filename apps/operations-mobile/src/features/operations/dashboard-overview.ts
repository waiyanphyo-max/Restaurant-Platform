import { ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { getOperationsApi } from "../../api";
import type { OperationsRole } from "../../navigation/policy";

type DashboardApi = Pick<ReturnType<typeof getOperationsApi>, "listOrders" | "listQueue" | "listDeliveries" | "listMyDeliveries" | "listNotifications" | "getDailyReport">;
export type DashboardSection<T> = { status: "ready"; data: T } | { status: "offline" | "denied" | "error" };
export const attentionStatuses = ["PENDING", "ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const;

/** Auxiliary failures stay attached to their own section. Expired sessions use the existing query hook. */
async function section<T>(load: () => Promise<T>): Promise<DashboardSection<T>> {
  try { return { status: "ready", data: await load() }; }
  catch (error) {
    if (error instanceof MissingAccessTokenError || error instanceof ApiHttpError && error.status === 401) throw error;
    return { status: error instanceof ApiHttpError && error.status === 403 ? "denied"
      : error instanceof ApiNetworkError || error instanceof ApiTimeoutError ? "offline" : "error" };
  }
}

export async function loadDashboardOverview(api: DashboardApi, role: OperationsRole, signal: AbortSignal) {
  const operational = ["OWNER", "MANAGER", "STAFF"].includes(role);
  const management = ["OWNER", "MANAGER"].includes(role);
  const [orders, queue, deliveries, assignment, notifications, daily] = await Promise.all([
    operational ? Promise.all(attentionStatuses.map(status => section(async () => {
      const page = await api.listOrders({ status, size: 1 }, { signal });
      return page.totalElements;
    }))) : null,
    operational ? section(() => api.listQueue(undefined, { signal })) : null,
    section(async () => {
      const page = await (management ? api.listDeliveries({ size: 5 }, { signal }) : api.listMyDeliveries({ size: 5 }, { signal }));
      // Dashboard summaries do not retain destination, recipient, phone or delivery-note fields.
      return { totalElements: page.totalElements, content: page.content.map(({ id, orderNumber, status }) => ({ id, orderNumber, status })) };
    }),
    management ? section(async () => (await api.listDeliveries({ status: "WAITING_ASSIGNMENT", size: 1 }, { signal })).totalElements) : null,
    section(() => api.listNotifications("PENDING", { signal })),
    management ? section(() => api.getDailyReport(undefined, { signal })) : null,
  ]);
  return { orders, queue, deliveries, assignment, notifications, daily };
}
