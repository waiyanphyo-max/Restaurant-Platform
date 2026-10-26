/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import type { Row, View } from "@/types/workspace";
import { useWorkspaceContext } from "@/features/workspace/WorkspaceContext";
import { rid, record, list, label, asMoney, messageOf, nextStates, nextDeliveryStates } from "@/features/workspace/utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { DeliveryStatusBadge } from "@/components/delivery/DeliveryStatusBadge";
import { QueueStatusBadge } from "@/components/queue/QueueStatusBadge";

export function OverviewView() {
  const {
    role,
    view,
    data,
    restaurantName,
    orders,
    queue,
    deliveries,
    members,
    report,
    changeView,
    empty,
  } = useWorkspaceContext();
      if (view === "overview") return <>
        <div className="ws-hero"><div><div className="ws-eyebrow">{role === "OWNER" ? "OWNER DASHBOARD" : "RESTAURANT OPERATIONS"}</div><h2>{role === "OWNER" ? `${restaurantName} at a glance` : "Service, in one workspace."}</h2><p>{role === "OWNER" ? "Check today’s activity, manage your team and keep restaurant operations moving on laptop, tablet or mobile." : "Manage orders, pickup queues, menu items, deliveries and customer workflows from desktop or phone."}</p></div><div className="ws-hero-mark">R<span /></div></div>
        <div className="ws-stat-grid">{[
          ["Orders today", report.totalOrders ?? orders.length], ["Pending", report.pendingOrders ?? orders.filter((x) => x.status === "PENDING").length],
          ["Completed", report.completedOrders ?? orders.filter((x) => x.status === "COMPLETED").length], ["Sales", asMoney(report.orderAmountExcludingCancelled ?? report.paidAmount ?? 0, String(data.currency || "MMK"))],
        ].map(([name, value]) => <div className="ws-stat" key={String(name)}><span>{name}</span><strong>{value}</strong><small>Latest information from backend</small></div>)}</div>
        <div className="ws-grid-two"><section className="ws-card"><div className="ws-card-heading"><div><h3>Recent orders</h3><p>Latest service activity</p></div><button className="ws-link-btn" onClick={() => changeView("orders")}>View all ↗</button></div>{orders.slice(0, 5).map((o) => <div className="ws-list-row" key={String(o.id)}><div><b>{label(o)}</b><small>{String(o.orderType || "")} · {String(o.orderChannel || "")}</small></div><div className="ws-row-end"><OrderStatusBadge status={String(o.status || "UNKNOWN")} /><b>{asMoney(o.totalAmount, String(data.currency || "MMK"))}</b></div></div>)}{!orders.length && empty("Orders appear here when the backend returns records.")}</section><section className="ws-card"><div className="ws-card-heading"><div><h3>Quick actions</h3><p>{role === "OWNER" ? "Common restaurant management tasks" : "Open the workflows your role needs"}</p></div></div><div className="ws-quick-grid">{[["Staff order","staff-order"],["Queue & pickup","queue"],["Delivery tasks","deliveries"],["Edit catalogue","menu"],...(role === "OWNER" ? [["Manage team","members"]] : []),["Daily report","reports"]].map(([name,key]) => <button className="ws-quick" key={String(key)} onClick={() => changeView(key as View)}><b>{name}</b><i>↗</i></button>)}</div></section></div>
      </>;
  return null;
}

export function OrdersView() {
  const {
    view,
    data,
    orders,
    payments,
    setPayments,
    paymentOrderId,
    setPaymentOrderId,
    search,
    setSearch,
    setSelectedOrder,
    fail,
    act,
    restaurantPath,
    loadView,
    changeView,
    showPayments,
    collectPayment,
    intro,
    empty,
    title,
    filteredOrders,
    call,
  } = useWorkspaceContext();
      if (view === "orders") return <>
        {intro("Order management","Inspect order details, change supported statuses, and open payment metadata. Illegal state transitions are rejected by the backend.")}
        <div className="ws-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order number, type, status…" /><button className="ws-btn ws-btn-muted" onClick={() => loadView("orders")}>Refresh</button><button className="ws-btn ws-btn-primary" onClick={() => changeView("staff-order")}>＋ Counter order</button></div>
        <div className="ws-record-list">{filteredOrders.map((o) => <article className="ws-record" key={String(o.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(o)}</b><OrderStatusBadge status={String(o.status || "")} /></div><p>{String(o.orderType || "")} · {String(o.orderChannel || "")} · {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}</p><strong>{asMoney(o.totalAmount, String(data.currency || "MMK"))}</strong><small>Order UUID: {String(o.id || "")}</small></div><div className="ws-record-actions"><button className="ws-btn ws-btn-muted" onClick={() => void (async()=>{try{setSelectedOrder(record(await call(restaurantPath("orders/"+encodeURIComponent(String(o.id))))));}catch(cause){fail(cause);}})()}>Details</button>{nextStates(String(o.status), String(o.orderType)).map((s) => <button className="ws-btn ws-btn-primary" key={s} onClick={() => act(() => call(restaurantPath("orders/" + encodeURIComponent(String(o.id)) + "/status"), "PATCH", { status: s, note: "Updated from workspace." }), "Order updated to " + s + ".")}>{s}</button>)}<button className="ws-btn ws-btn-soft" onClick={() => void showPayments(o)}>Payments</button></div></article>)}</div>{paymentOrderId && <section className="ws-card ws-payments-panel"><div className="ws-card-heading"><div><h3>Payments for order {paymentOrderId.slice(0,8)}…</h3><p>Only safe payment metadata is returned; private transaction references are omitted by the API.</p></div><button className="ws-btn ws-btn-muted" onClick={()=>{setPaymentOrderId("");setPayments([]);}}>Close</button></div>{payments.map((payment)=><div className="ws-list-row" key={String(payment.id)}><div><b>{String(payment.paymentMethod||payment.method||"Payment")}</b><small>{String(payment.status||"")} · {String(payment.paymentType||"")}</small></div><div className="ws-row-end"><b>{asMoney(payment.amount??payment.amountPaid??payment.totalAmount,data.currency||"MMK")}</b>{payment.status==="PENDING"&&<button className="ws-btn ws-btn-primary" onClick={()=>void collectPayment(paymentOrderId,String(payment.id))}>Collect cash</button>}</div></div>)}{!payments.length&&empty("No payment records returned for this order.")}</section>}{!filteredOrders.length && empty("No orders matched this search.")}
      </>;
  return null;
}

export function StaffOrderView() {
  const {
    view,
    data,
    orders,
    products,
    tables,
    act,
    restaurantPath,
    intro,
    field,
    call,
  } = useWorkspaceContext();
      if (view === "staff-order") return <>
        {intro("Create a counter order","Enter an order for a walk-in customer. Menu prices and availability are validated by the server; pending payment is cash at counter.")}
        <section className="ws-card"><form className="ws-form-grid" onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const type = String(fd.get("orderType") || "TAKEAWAY");
          const body: Row = { orderType: type, items: [{ productId: String(fd.get("productId") || ""), quantity: Number(fd.get("quantity") || 1), modifiers: [] }], note: String(fd.get("note") || "") };
          if (type === "DINE_IN") body.tableId = String(fd.get("tableId") || "");
          void act(() => call(restaurantPath("orders/staff"), "POST", body), "Counter order created.");
        }}><label className="ws-field"><span>Order type</span><select name="orderType"><option value="TAKEAWAY">Takeaway</option><option value="DINE_IN">Dine-in</option></select></label>{field("Product", <select name="productId" required><option value="">Choose menu item</option>{products.map((p) => <option key={String(p.id)} value={String(p.id)}>{label(p)} · {asMoney(p.price, String(data.currency || "MMK"))}</option>)}</select>)}{field("Quantity", <input name="quantity" type="number" min="1" defaultValue="1" required />)}{field("Table UUID (dine-in only)", <select name="tableId"><option value="">Choose table</option>{tables.filter((t) => t.active !== false).map((t) => <option key={String(t.id)} value={String(t.id)}>{label(t)}</option>)}</select>)}{field("Order note", <input name="note" placeholder="Kitchen note or special instruction" />, true)}<button type="submit" className="ws-btn ws-btn-primary">Create order</button><p className="ws-muted">For full modifiers or variant selection, use the API workbench or add them in the customer menu.</p></form></section>
      </>;
  return null;
}

export function QueueView() {
  const {
    token,
    view,
    setView,
    queue,
    checkout,
    ticket,
    setTicket,
    act,
    restaurantPath,
    loadView,
    changeView,
    intro,
    empty,
    call,
  } = useWorkspaceContext();
      if (view === "queue") return <>
        {intro("Queue & pickup","Call ready queue numbers. Customers can track status through the ticket UUID and token returned at checkout.")}
        <div className="ws-toolbar"><button className="ws-btn ws-btn-muted" onClick={() => loadView("queue")}>Refresh queue</button><button className="ws-btn ws-btn-soft" onClick={() => changeView("queue-track")}>Open customer tracker</button></div>
        <div className="ws-ticket-grid">{queue.map((t) => <article className="ws-ticket" key={String(t.ticketId || t.id)}><div className="ws-ticket-top"><span>QUEUE NUMBER</span><QueueStatusBadge status={String(t.status || "")} /></div><strong>{String(t.displayCode || t.queueNumber || "—")}</strong><small>{t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}</small>{t.status === "READY" && <button className="ws-btn ws-btn-primary" onClick={() => act(() => call(restaurantPath("queue-tickets/" + encodeURIComponent(String(t.ticketId || t.id)) + "/call"), "PATCH"), "Queue number called.")}>Call this number</button>}<button className="ws-btn ws-btn-muted" onClick={() => { setTicket({ ...ticket, id: String(t.ticketId || t.id || "") }); setView("queue-track"); }}>Track this ticket</button></article>)}{!queue.length && empty("No queue tickets returned.")}</div>
      </>;
  return null;
}

export function DeliveriesView() {
  const {
    role,
    view,
    data,
    deliveries,
    act,
    restaurantPath,
    loadView,
    intro,
    empty,
    title,
    call,
  } = useWorkspaceContext();
      if (view === "deliveries") return <>
        {intro(role === "DELIVERY_DRIVER" ? "My delivery tasks" : "Delivery operations", role === "DELIVERY_DRIVER" ? "Only tasks assigned to your signed-in driver account are returned." : "Assign tasks to drivers in this restaurant and track handoffs. Delivery completion requires confirmation of cash collection when applicable.")}
        <div className="ws-toolbar"><button className="ws-btn ws-btn-muted" onClick={() => loadView("deliveries")}>Refresh tasks</button><span className="ws-muted">{deliveries.length} tasks</span></div>
        <div className="ws-record-list">{deliveries.map((t) => <article className="ws-record" key={String(t.id)}><div className="ws-record-main"><div className="ws-record-title"><b>Order {String(t.orderNumber || t.orderId || "").slice(0,24)}</b><DeliveryStatusBadge status={String(t.status || "")} /></div><p>{String(t.customerName || "Customer")}{t.customerPhone ? " · " + t.customerPhone : ""}</p><div className="ws-address">{String(t.deliveryAddress || "No address available")}</div><strong>{asMoney(t.totalAmount, String(data.currency || "MMK"))}</strong>{t.deliveryNote && <small>Note: {String(t.deliveryNote)}</small>}{t.driverUserId && <small>Driver ID: {String(t.driverUserId)}</small>}{t.failureReason && <small className="ws-danger-text">Failure: {String(t.failureReason)}</small>}</div><div className="ws-record-actions">{role !== "DELIVERY_DRIVER" && <button className="ws-btn ws-btn-muted" onClick={() => { const id = window.prompt("Enter DELIVERY_DRIVER user UUID:", String(t.driverUserId || "")); if (id) void act(() => call(restaurantPath("deliveries/" + encodeURIComponent(String(t.id)) + "/assign"), "PATCH", { driverUserId: id, note: "Assigned from workspace." }), "Delivery assigned."); }}>Assign / reassign</button>}{nextDeliveryStates(String(t.status)).map((s) => <button className="ws-btn ws-btn-primary" key={s} onClick={() => {
          const body: Row = { status:s, note:"Updated from workspace." };
          if (s === "FAILED") { const reason = window.prompt("Failure reason:"); if (!reason) return; body.failureReason = reason; }
          if (s === "DELIVERED") { body.cashCollected = window.confirm("Confirm the delivery and any cash collection?"); if (!body.cashCollected) return; }
          void act(() => call(restaurantPath("deliveries/" + encodeURIComponent(String(t.id)) + "/status"), "PATCH", body), "Delivery updated to " + s + ".");
        }}>{s}</button>)}</div></article>)}{!deliveries.length && empty("No tasks assigned or waiting.")}</div>
      </>;
  return null;
}

export function ReportsView() {
  const {
    view,
    data,
    orders,
    report,
    reportDate,
    setReportDate,
    loadView,
    intro,
    field,
  } = useWorkspaceContext();
      if (view === "reports") return <>
        {intro("Daily operations report","Review order state counts and sales totals calculated in the restaurant timezone.")}
        <section className="ws-card"><div className="ws-inline-form">{field("Report date", <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />)}<button className="ws-btn ws-btn-primary" onClick={() => loadView("reports")}>Load report</button></div><div className="ws-stat-grid">{[
          ["Total orders",report.totalOrders],["Pending",report.pendingOrders],["Accepted",report.acceptedOrders],["Preparing",report.preparingOrders],["Ready",report.readyOrders],["Out for delivery",report.outForDeliveryOrders],["Completed",report.completedOrders],["Cancelled",report.cancelledOrders],["Paid amount",asMoney(report.paidAmount,String(data.currency||"MMK"))],["Sales excluding cancelled",asMoney(report.orderAmountExcludingCancelled,String(data.currency||"MMK"))],
        ].map(([k,v]) => <div className="ws-stat" key={String(k)}><span>{k}</span><strong>{v ?? "—"}</strong></div>)}</div><p className="ws-muted">Timezone: {String(report.timezone || "returned by backend")}</p></section>
      </>;
  return null;
}

