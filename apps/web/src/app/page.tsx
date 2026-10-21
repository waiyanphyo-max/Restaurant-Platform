"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ApiError,
  CreateQrOrderResponse,
  DailyOperationsReport,
  assignDeliveryDriver,
  callQueueTicket,
  DeliveryTask,
  getDailyOperationsReport,
  getPublicMenu,
  getQueueTrackingStatus,
  getTicketNotifications,
  listDeliveries,
  listOrders,
  listQueueTickets,
  OrderSummary,
  Page,
  PublicMenu,
  QueueTrackingStatus,
  TicketNotification,
  createCommonQrOrder,
  updateOrderStatus,
  QueueTicket,
  updateDeliveryStatus,
} from "@/lib/api";

const initialApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const pageSize = 20;
const orderStatuses = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;
const deliveryStatuses = [
  "WAITING_ASSIGNMENT",
  "ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;
type WorkspaceView = "orders" | "queue" | "deliveries" | "reports" | "customer-pickup";
type GuestCartLine = {
  quantity: number;
  variantId: string;
  specialInstruction: string;
  modifiers: Record<string, number>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusClass(status: string) {
  return `status status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function humanizeStatus(status: string) {
  return status.replaceAll("_", " ");
}

function nextOrderStatus(order: OrderSummary): string | null {
  switch (order.status) {
    case "PENDING":
      return "ACCEPTED";
    case "ACCEPTED":
      return "PREPARING";
    case "PREPARING":
      return "READY";
    case "READY":
      return order.orderType === "DELIVERY" ? "OUT_FOR_DELIVERY" : "COMPLETED";
    case "OUT_FOR_DELIVERY":
      return "COMPLETED";
    default:
      return null;
  }
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof ApiError ? cause.message : fallback;
}

function playQueueAlert(context: AudioContext | null) {
  if (!context || context.state === "closed") return;
  try {
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.29);
  } catch {
    // Sound is a convenience. Queue polling remains available if audio is blocked.
  }
}

export default function HomePage() {
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [restaurantId, setRestaurantId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const [activeView, setActiveView] = useState<WorkspaceView>("orders");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [orderActionId, setOrderActionId] = useState<string | null>(null);

  const [queueTickets, setQueueTickets] = useState<QueueTicket[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [deliveriesPage, setDeliveriesPage] = useState<Page<DeliveryTask> | null>(null);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("");
  const [deliveryPageIndex, setDeliveryPageIndex] = useState(0);
  const [reportDate, setReportDate] = useState("");
  const [dailyReport, setDailyReport] = useState<DailyOperationsReport | null>(null);

  const [error, setError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [driverInputs, setDriverInputs] = useState<Record<string, string>>({});
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [deliveryConfirmations, setDeliveryConfirmations] = useState<Record<string, boolean>>({});

  const [publicMenu, setPublicMenu] = useState<PublicMenu | null>(null);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [commonQrToken, setCommonQrToken] = useState("");
  const [guestCart, setGuestCart] = useState<Record<string, GuestCartLine>>({});
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [commonOrder, setCommonOrder] = useState<CreateQrOrderResponse | null>(null);
  const [trackedTicketId, setTrackedTicketId] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [trackedStatus, setTrackedStatus] = useState<QueueTrackingStatus | null>(null);
  const [trackedNotifications, setTrackedNotifications] = useState<TicketNotification[]>([]);
  const [trackingError, setTrackingError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [copiedTrackingToken, setCopiedTrackingToken] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const previousQueueStatusRef = useRef("");

  const hasRestaurantDetails = Boolean(apiUrl.trim() && restaurantId.trim());
  const hasConnectionDetails = Boolean(hasRestaurantDetails && accessToken.trim());

  async function loadOrders(pageIndex = 0, status = statusFilter) {
    setLoading(true);
    setError("");
    try {
      const page = await listOrders(apiUrl, restaurantId, accessToken, pageIndex, status, pageSize);
      setOrders(page.content ?? []);
      setTotalOrders(page.totalElements ?? 0);
      setTotalPages(page.totalPages ?? 0);
      setCurrentPage(page.number ?? pageIndex);
      setLoaded(true);
    } catch (cause) {
      setOrders([]);
      setTotalOrders(0);
      setTotalPages(0);
      setCurrentPage(0);
      setLoaded(false);
      setError(errorMessage(cause, "Something went wrong while loading orders."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveView("orders");
    setLoaded(false);
    await loadOrders(0, statusFilter);
  }

  function changeStatusFilter(nextStatus: string) {
    setStatusFilter(nextStatus);
    if (loaded) void loadOrders(0, nextStatus);
  }

  async function handleAdvanceOrder(order: OrderSummary) {
    const nextStatus = nextOrderStatus(order);
    if (!nextStatus) return;
    setOrderActionId(order.id);
    setError("");
    try {
      await updateOrderStatus(apiUrl, restaurantId, accessToken, order.id, nextStatus);
      await loadOrders(currentPage, statusFilter);
    } catch (cause) {
      setError(errorMessage(cause, "Could not update this order."));
    } finally {
      setOrderActionId(null);
    }
  }

  async function loadQueue() {
    setActiveView("queue");
    setActivityError("");
    if (!hasConnectionDetails) {
      setActivityError("Enter your API URL, restaurant ID, and access token first.");
      return;
    }
    setActivityLoading(true);
    try {
      const tickets = await listQueueTickets(apiUrl, restaurantId, accessToken);
      setQueueTickets(tickets);
      setQueueLoaded(true);
    } catch (cause) {
      setQueueTickets([]);
      setQueueLoaded(false);
      setActivityError(errorMessage(
        cause,
        "Something went wrong while loading the queue.",
      ));
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadDeliveries(pageIndex = 0, status = deliveryStatusFilter) {
    setActiveView("deliveries");
    setActivityError("");
    if (!hasConnectionDetails) {
      setActivityError("Enter your API URL, restaurant ID, and access token first.");
      return;
    }
    setActivityLoading(true);
    try {
      const page = await listDeliveries(apiUrl, restaurantId, accessToken, pageIndex, status);
      setDeliveriesPage(page);
      setDeliveryPageIndex(page.number ?? pageIndex);
    } catch (cause) {
      setDeliveriesPage(null);
      setDeliveryPageIndex(0);
      setActivityError(errorMessage(
        cause,
        "Something went wrong while loading deliveries.",
      ));
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadDailyReport(date = reportDate) {
    setActiveView("reports");
    setActivityError("");
    if (!hasConnectionDetails) {
      setActivityError("Enter your API URL, restaurant ID, and access token first.");
      return;
    }
    setActivityLoading(true);
    setDailyReport(null);
    try {
      const report = await getDailyOperationsReport(
        apiUrl, restaurantId, accessToken, date,
      );
      setDailyReport(report);
    } catch (cause) {
      setActivityError(errorMessage(
        cause,
        "Something went wrong while loading the daily report.",
      ));
    } finally {
      setActivityLoading(false);
    }
  }

  async function handleCallQueueTicket(ticket: QueueTicket) {
    setActivityError("");
    setActiveActionId(ticket.ticketId);
    try {
      await callQueueTicket(apiUrl, restaurantId, accessToken, ticket.ticketId);
      await loadQueue();
    } catch (cause) {
      setActivityError(errorMessage(cause, "Could not call this queue number."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleAssignDriver(task: DeliveryTask) {
    const driverUserId = (driverInputs[task.id] ?? task.driverUserId ?? "").trim();
    if (!driverUserId) {
      setActivityError("Enter the user UUID of a delivery driver from this restaurant.");
      return;
    }
    setActiveActionId(task.id);
    setActivityError("");
    try {
      await assignDeliveryDriver(apiUrl, restaurantId, accessToken, task.id, driverUserId);
      await loadDeliveries(deliveryPageIndex, deliveryStatusFilter);
    } catch (cause) {
      setActivityError(errorMessage(cause, "Could not assign this delivery."));
    } finally {
      setActiveActionId(null);
    }
  }

  async function handleDeliveryStatus(task: DeliveryTask, nextStatus: string) {
    const failureReason = (failureReasons[task.id] ?? "").trim();
    if (nextStatus === "FAILED" && !failureReason) {
      setActivityError("Enter a reason before marking a delivery as failed.");
      return;
    }
    if (nextStatus === "DELIVERED" && !deliveryConfirmations[task.id]) {
      setActivityError("Confirm delivery completion and collection of any cash-on-delivery payment.");
      return;
    }

    setActiveActionId(task.id);
    setActivityError("");
    try {
      await updateDeliveryStatus(apiUrl, restaurantId, accessToken, task.id, {
        status: nextStatus,
        ...(nextStatus === "FAILED" ? { failureReason } : {}),
        ...(nextStatus === "DELIVERED" ? { cashCollected: true } : {}),
        note: `Updated from the web dashboard to ${nextStatus}.`,
      });
      await loadDeliveries(deliveryPageIndex, deliveryStatusFilter);
    } catch (cause) {
      setActivityError(errorMessage(cause, "Could not update the delivery status."));
    } finally {
      setActiveActionId(null);
    }
  }

  const firstVisibleOrder = totalOrders === 0 ? 0 : currentPage * pageSize + 1;
  const lastVisibleOrder = Math.min((currentPage + 1) * pageSize, totalOrders);
  const viewTitle = activeView === "orders"
    ? "Order overview"
    : activeView === "queue" ? "Queue & pickup"
      : activeView === "deliveries" ? "Deliveries" : "Daily report";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Restaurant Platform home">
          <span className="brand-mark">R</span>
          <span>Restaurant<span className="brand-light">Platform</span></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <button
          type="button"
          className={`nav-item ${activeView === "orders" ? "active" : ""}`}
          onClick={() => {
            setActiveView("orders");
            if (hasConnectionDetails) void loadOrders(0, statusFilter);
          }}
        ><span className="nav-icon">▦</span> Order overview</button>
        <button
          type="button"
          className={`nav-item ${activeView === "queue" ? "active" : ""}`}
          onClick={() => void loadQueue()}
        ><span className="nav-icon">◷</span> Queue & pickup</button>
        <button
          type="button"
          className={`nav-item ${activeView === "deliveries" ? "active" : ""}`}
          onClick={() => void loadDeliveries(0, deliveryStatusFilter)}
        ><span className="nav-icon">↗</span> Deliveries</button>
        <button
          type="button"
          className={`nav-item ${activeView === "reports" ? "active" : ""}`}
          onClick={() => void loadDailyReport()}
        ><span className="nav-icon">▤</span> Daily report</button>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          Backend integration preview
          <p>Access tokens are held in page memory only and are not saved to local storage.</p>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><div className="eyebrow">RESTAURANT OPERATIONS</div><h1>{viewTitle}</h1></div>
          <div className="topbar-pill"><span className="online-dot" /> API preview</div>
        </header>

        <section className="intro">
          <div>
            <p className="intro-kicker">YOUR WORKSPACE, AT A GLANCE</p>
            <h2>Keep service moving.</h2>
            <p className="intro-copy">Connect to your Restaurant Platform backend to manage orders, queue pickup, and deliveries for one restaurant.</p>
          </div>
          <div className="intro-symbol" aria-hidden="true"><span>R</span><i /><b /></div>
        </section>

        <section className="connection-card">
          <div className="section-heading">
            <div><h3>Connect to your backend</h3><p>Use a valid Supabase access token for the restaurant operations you need to access.</p></div>
            <span className="secure-label">Private request</span>
          </div>
          <form onSubmit={handleSubmit} className="connection-form">
            <label>Backend API URL
              <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:8080" autoComplete="url" required />
            </label>
            <label>Restaurant ID
              <input value={restaurantId} onChange={e => setRestaurantId(e.target.value)} placeholder="Restaurant UUID" autoComplete="off" required />
            </label>
            <label className="token-field">Supabase access token
              <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Paste access token" autoComplete="off" required />
            </label>
            <button type="submit" disabled={loading}>{loading ? "Connecting…" : "Load orders"} <span aria-hidden="true">→</span></button>
          </form>
          <p className="privacy-note">Token stays in this page&apos;s memory and is sent only to the API URL above. Don&apos;t use a service-role key here.</p>
          {error && <div className="feedback error" role="alert">{error}</div>}
        </section>

        {activeView === "orders" && <section className="orders-section" aria-busy={loading}>
          <div className="orders-heading">
            <div>
              <h3>Recent orders</h3>
              <p>{loaded
                ? `${totalOrders} order(s) total · showing ${firstVisibleOrder}–${lastVisibleOrder}`
                : "Connect to load live data"}</p>
            </div>
            {loaded && <span className="result-count">{orders.length} shown</span>}
          </div>

          {loaded && <div className="orders-toolbar">
            <label className="filter-field">
              Filter by status
              <select
                value={statusFilter}
                onChange={event => changeStatusFilter(event.target.value)}
                disabled={loading}
                aria-label="Filter orders by status"
              >
                <option value="">All statuses</option>
                {orderStatuses.map(status => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={() => void loadOrders(currentPage)} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>}

          {!loaded && !loading && !error && <div className="empty-state"><div className="empty-icon">▤</div><h4>Your orders will appear here</h4><p>Enter the backend URL, restaurant ID, and a valid user access token above.</p></div>}
          {loading && !loaded && <div className="empty-state"><div className="loader" /><h4>Loading orders</h4><p>Requesting the first page from your backend.</p></div>}
          {loaded && !loading && orders.length === 0 && <div className="empty-state"><div className="empty-icon">✓</div><h4>No orders found</h4><p>The connection worked, but this restaurant has no orders matching the current filter.</p></div>}

          {loaded && orders.length > 0 && <div className="orders-table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Type</th><th>Status</th><th>Total</th><th>Created</th><th>Next action</th></tr></thead>
              <tbody>{orders.map(order => <tr key={order.id}>
                <td><strong>{order.orderNumber}</strong><small>{order.orderChannel}</small></td>
                <td>{humanizeStatus(order.orderType)}</td>
                <td><span className={statusClass(order.status)}>{humanizeStatus(order.status)}</span></td>
                <td className="amount">{formatMoney(order.totalAmount)}</td>
                <td className="date-cell">{formatDate(order.createdAt)}</td>
                <td>{nextOrderStatus(order)
                  ? <button
                      className="secondary-button order-action"
                      type="button"
                      onClick={() => void handleAdvanceOrder(order)}
                      disabled={loading || orderActionId !== null}
                    >{orderActionId === order.id
                      ? "Saving…"
                      : `Move to ${humanizeStatus(nextOrderStatus(order) ?? "")}`}</button>
                  : <span className="order-action-none">Final state</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>}

          {loaded && totalPages > 1 && <div className="pagination">
            <span>Page {currentPage + 1} of {totalPages}</span>
            <div className="pagination-actions">
              <button className="secondary-button" type="button" onClick={() => void loadOrders(currentPage - 1)} disabled={loading || currentPage <= 0}>Previous</button>
              <button className="secondary-button" type="button" onClick={() => void loadOrders(currentPage + 1)} disabled={loading || currentPage + 1 >= totalPages}>Next</button>
            </div>
          </div>}
        </section>}

        {activeView === "queue" && <section className="orders-section" aria-busy={activityLoading}>
          <div className="orders-heading">
            <div><h3>Today&apos;s queue</h3><p>Active Common QR pickup tickets in the restaurant&apos;s local day.</p></div>
            <button className="secondary-button" type="button" onClick={() => void loadQueue()} disabled={activityLoading}>
              {activityLoading ? "Refreshing…" : "Refresh queue"}
            </button>
          </div>
          {activityError && <div className="feedback error" role="alert">{activityError}</div>}
          {activityLoading && !queueLoaded && <div className="empty-state"><div className="loader" /><h4>Loading queue</h4><p>Requesting today&apos;s pickup tickets.</p></div>}
          {queueLoaded && queueTickets.length === 0 && <div className="empty-state"><div className="empty-icon">✓</div><h4>No active pickup tickets</h4><p>New Common QR tickets will appear here after customers submit orders.</p></div>}
          {queueLoaded && queueTickets.length > 0 && <div className="queue-list">
            {queueTickets.map(ticket => <article className="queue-card" key={ticket.ticketId}>
              <div className="queue-number">{ticket.displayCode}</div>
              <div className="queue-details">
                <h4>Queue {ticket.displayCode}</h4>
                <span className={statusClass(ticket.status)}>{humanizeStatus(ticket.status)}</span>
                <p>Placed {formatDate(ticket.createdAt)}</p>
                {ticket.readyAt && <p>Ready {formatDate(ticket.readyAt)}</p>}
                {ticket.calledAt && <p>Called {formatDate(ticket.calledAt)}</p>}
              </div>
              {ticket.status === "READY" && <button
                className="primary-action"
                type="button"
                onClick={() => void handleCallQueueTicket(ticket)}
                disabled={activeActionId === ticket.ticketId || activityLoading}
              >{activeActionId === ticket.ticketId ? "Calling…" : "Call number"}</button>}
            </article>)}
          </div>}
        </section>}

        {activeView === "deliveries" && <section className="orders-section" aria-busy={activityLoading}>
          <div className="orders-heading">
            <div>
              <h3>Delivery tasks</h3>
              <p>{deliveriesPage ? `${deliveriesPage.totalElements} delivery task(s) in total` : "View assigned delivery work and update its progress."}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadDeliveries(deliveryPageIndex)} disabled={activityLoading}>
              {activityLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="orders-toolbar">
            <label className="filter-field">
              Filter by status
              <select
                value={deliveryStatusFilter}
                onChange={event => {
                  setDeliveryStatusFilter(event.target.value);
                  void loadDeliveries(0, event.target.value);
                }}
                disabled={activityLoading}
                aria-label="Filter deliveries by status"
              >
                <option value="">All statuses</option>
                {deliveryStatuses.map(status => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
              </select>
            </label>
          </div>
          {activityError && <div className="feedback error" role="alert">{activityError}</div>}
          {activityLoading && !deliveriesPage && <div className="empty-state"><div className="loader" /><h4>Loading deliveries</h4><p>Requesting delivery tasks from the backend.</p></div>}
          {deliveriesPage && deliveriesPage.content.length === 0 && !activityLoading && <div className="empty-state"><div className="empty-icon">✓</div><h4>No deliveries found</h4><p>No tasks match the selected status.</p></div>}
          {deliveriesPage && deliveriesPage.content.length > 0 && <div className="delivery-list">
            {deliveriesPage.content.map(task => <article className="delivery-card" key={task.id}>
              <div className="delivery-card-heading">
                <div>
                  <h4>{task.orderNumber}</h4>
                  <p>Order status: {humanizeStatus(task.orderStatus)}</p>
                </div>
                <span className={statusClass(task.status)}>{humanizeStatus(task.status)}</span>
              </div>
              <div className="delivery-meta">
                <p><strong>Recipient</strong>{task.customerName || "Name not provided"}{task.customerPhone ? ` · ${task.customerPhone}` : ""}</p>
                <p><strong>Address</strong>{task.deliveryAddress || "Address not provided"}</p>
                {task.deliveryNote && <p><strong>Note</strong>{task.deliveryNote}</p>}
                <p><strong>Total</strong>{formatMoney(task.totalAmount)}</p>
                <p><strong>Driver UUID</strong>{task.driverUserId || "Waiting for assignment"}</p>
                {task.failureReason && <p><strong>Last failure</strong>{task.failureReason}</p>}
              </div>

              {["WAITING_ASSIGNMENT", "FAILED", "ASSIGNED"].includes(task.status) && <div className="inline-action">
                <label>Assign or reassign driver
                  <input
                    value={driverInputs[task.id] ?? task.driverUserId ?? ""}
                    onChange={event => setDriverInputs(previous => ({ ...previous, [task.id]: event.target.value }))}
                    placeholder="Driver user UUID"
                    autoComplete="off"
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => void handleAssignDriver(task)} disabled={activityLoading || activeActionId === task.id}>
                  {activeActionId === task.id ? "Saving…" : "Assign driver"}
                </button>
              </div>}

              {["ASSIGNED", "PICKED_UP"].includes(task.status) && <div className="delivery-actions">
                {task.status === "ASSIGNED" && <button className="primary-action" type="button" onClick={() => void handleDeliveryStatus(task, "PICKED_UP")} disabled={activityLoading || activeActionId === task.id}>Mark picked up</button>}
                <label className="failure-field">If delivery fails, provide a reason
                  <input
                    value={failureReasons[task.id] ?? ""}
                    onChange={event => setFailureReasons(previous => ({ ...previous, [task.id]: event.target.value }))}
                    placeholder="Reason for failed delivery"
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => void handleDeliveryStatus(task, "FAILED")} disabled={activityLoading || activeActionId === task.id || !(failureReasons[task.id] ?? "").trim()}>
                  Mark failed
                </button>
                {task.status === "PICKED_UP" && <div className="delivery-confirm">
                  <label>
                    <input
                      type="checkbox"
                      checked={deliveryConfirmations[task.id] ?? false}
                      onChange={event => setDeliveryConfirmations(previous => ({ ...previous, [task.id]: event.target.checked }))}
                    />
                    I confirm the order was delivered and any cash-on-delivery payment was collected.
                  </label>
                  <button className="primary-action" type="button" onClick={() => void handleDeliveryStatus(task, "DELIVERED")} disabled={activityLoading || activeActionId === task.id || !deliveryConfirmations[task.id]}>
                    Mark delivered
                  </button>
                </div>}
              </div>}
            </article>)}
          </div>}
          {deliveriesPage && deliveriesPage.totalPages > 1 && <div className="pagination">
            <span>Page {deliveryPageIndex + 1} of {deliveriesPage.totalPages}</span>
            <div className="pagination-actions">
              <button className="secondary-button" type="button" onClick={() => void loadDeliveries(deliveryPageIndex - 1)} disabled={activityLoading || deliveryPageIndex <= 0}>Previous</button>
              <button className="secondary-button" type="button" onClick={() => void loadDeliveries(deliveryPageIndex + 1)} disabled={activityLoading || deliveryPageIndex + 1 >= deliveriesPage.totalPages}>Next</button>
            </div>
          </div>}
        </section>}

        {activeView === "reports" && <section className="orders-section" aria-busy={activityLoading}>
          <div className="orders-heading">
            <div>
              <h3>Daily operations report</h3>
              <p>{dailyReport
                ? `${dailyReport.reportDate} · ${dailyReport.timezone}`
                : "Choose a date or use the restaurant's current local day."}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadDailyReport()} disabled={activityLoading}>
              {activityLoading ? "Loading…" : "Refresh report"}
            </button>
          </div>
          <form className="report-date-form" onSubmit={event => {
            event.preventDefault();
            void loadDailyReport(reportDate);
          }}>
            <label className="filter-field">
              Report date
              <input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} />
            </label>
            <button className="primary-action" type="submit" disabled={activityLoading}>
              {activityLoading ? "Loading…" : "Load date"}
            </button>
          </form>
          {activityError && <div className="feedback error" role="alert">{activityError}</div>}
          {activityLoading && !dailyReport && <div className="empty-state"><div className="loader" /><h4>Loading daily report</h4><p>Aggregating order and payment data for the selected local day.</p></div>}
          {dailyReport && <>
            <div className="report-summary-grid">
              <article className="report-metric"><span>Total orders</span><strong>{dailyReport.totalOrders}</strong><small>Created on report date</small></article>
              <article className="report-metric"><span>Order amount</span><strong>{formatMoney(dailyReport.orderAmountExcludingCancelled)}</strong><small>Non-cancelled orders created that day</small></article>
              <article className="report-metric"><span>Payments collected</span><strong>{formatMoney(dailyReport.paidAmount)}</strong><small>Payments marked paid that day</small></article>
            </div>
            <div className="report-status-grid">
              {[
                ["Pending", dailyReport.pendingOrders],
                ["Accepted", dailyReport.acceptedOrders],
                ["Preparing", dailyReport.preparingOrders],
                ["Ready", dailyReport.readyOrders],
                ["Out for delivery", dailyReport.outForDeliveryOrders],
                ["Completed", dailyReport.completedOrders],
                ["Cancelled", dailyReport.cancelledOrders],
              ].map(([label, value]) => <div className="report-status" key={label}>
                <span>{label}</span><strong>{value}</strong>
              </div>)}
            </div>
            <p className="report-note">Order amount is based on orders created that day; payments collected is based on payments marked paid that day. They are different measures and should not be treated as the same revenue figure.</p>
          </>}
        </section>}

        <footer>Restaurant Platform <span>•</span> Web integration preview <span>•</span> No credentials are persisted by this page</footer>
      </section>
    </main>
  );
}
