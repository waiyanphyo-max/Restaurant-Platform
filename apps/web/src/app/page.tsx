"use client";

import { FormEvent, useState } from "react";
import { ApiError, listOrders, OrderSummary } from "@/lib/api";

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

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
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

export default function HomePage() {
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [restaurantId, setRestaurantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
      setError(cause instanceof ApiError ? cause.message : "Something went wrong while loading orders.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoaded(false);
    await loadOrders(0, statusFilter);
  }

  function changeStatusFilter(nextStatus: string) {
    setStatusFilter(nextStatus);
    if (loaded) void loadOrders(0, nextStatus);
  }

  const firstVisibleOrder = totalOrders === 0 ? 0 : currentPage * pageSize + 1;
  const lastVisibleOrder = Math.min((currentPage + 1) * pageSize, totalOrders);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Restaurant Platform home">
          <span className="brand-mark">R</span>
          <span>Restaurant<span className="brand-light">Platform</span></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active"><span className="nav-icon">▦</span> Order overview</div>
        <div className="nav-item muted"><span className="nav-icon">◷</span> Queue & pickup <span className="soon">API</span></div>
        <div className="nav-item muted"><span className="nav-icon">↗</span> Deliveries <span className="soon">API</span></div>
        <div className="nav-item muted"><span className="nav-icon">☷</span> Menu & tables <span className="soon">API</span></div>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          Backend integration preview
          <p>Access tokens are held in page memory only and are not saved to local storage.</p>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><div className="eyebrow">RESTAURANT OPERATIONS</div><h1>Order overview</h1></div>
          <div className="topbar-pill"><span className="online-dot" /> API preview</div>
        </header>

        <section className="intro">
          <div>
            <p className="intro-kicker">YOUR WORKSPACE, AT A GLANCE</p>
            <h2>Keep service moving.</h2>
            <p className="intro-copy">Connect to your Restaurant Platform backend to view live orders for one restaurant.</p>
          </div>
          <div className="intro-symbol" aria-hidden="true"><span>R</span><i /><b /></div>
        </section>

        <section className="connection-card">
          <div className="section-heading">
            <div><h3>Connect to your backend</h3><p>Use a valid Supabase access token with the restaurant&apos;s ORDER_READ permission.</p></div>
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

        <section className="orders-section" aria-busy={loading}>
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
              <thead><tr><th>Order</th><th>Type</th><th>Status</th><th>Total</th><th>Created</th></tr></thead>
              <tbody>{orders.map(order => <tr key={order.id}>
                <td><strong>{order.orderNumber}</strong><small>{order.orderChannel}</small></td>
                <td>{humanizeStatus(order.orderType)}</td>
                <td><span className={statusClass(order.status)}>{humanizeStatus(order.status)}</span></td>
                <td className="amount">{formatMoney(order.totalAmount)}</td>
                <td className="date-cell">{formatDate(order.createdAt)}</td>
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
        </section>
        <footer>Restaurant Platform <span>•</span> Web integration preview <span>•</span> No credentials are persisted by this page</footer>
      </section>
    </main>
  );
}
