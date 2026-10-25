"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import "../workspace.css";

type View = "overview" | "orders" | "staff-order" | "queue" | "deliveries" | "reports" | "menu" | "tables" | "settings" | "zones" | "members" | "restaurant" | "storefront" | "profile" | "addresses" | "my-orders" | "notifications" | "devices" | "queue-track" | "api" | "create";
// API payloads are schema-driven by backend DTOs; fields are inspected defensively at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Membership = { id: string; name: string; role: string };

const groups = [
  { title: "OPERATIONS", items: [["overview","Overview","⌂"],["orders","Orders","▤"],["staff-order","Staff order","＋"],["queue","Queue & pickup","◷"],["deliveries","Deliveries / driver","➤"],["reports","Daily report","▥"]] },
  { title: "RESTAURANT", items: [["menu","Menu & catalogue","☷"],["tables","Tables & QR","▦"],["settings","Settings","⚙"],["zones","Delivery zones","⌖"],["members","Team & roles","♙"],["restaurant","Restaurant profile","◉"]] },
  { title: "CUSTOMER POV", items: [["storefront","Delivery storefront","🛍"],["profile","My profile","○"],["addresses","Saved addresses","⌖"],["my-orders","My orders","▣"],["notifications","Notifications","♧"],["devices","Push devices","▯"],["queue-track","Track queue ticket","◴"]] },
  { title: "TOOLS", items: [["api","API workbench","⌘"]] },
] as const;

const rid = (id: string, suffix: string) => "/api/v1/restaurants/" + encodeURIComponent(id) + (suffix ? "/" + suffix.replace(/^\/+/, "") : "");
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : (Array.isArray(record(value).content) ? record(value).content.map(record) : Array.isArray(record(value).items) ? record(value).items.map(record) : Array.isArray(record(value).data) ? record(value).data.map(record) : []);
const label = (row: Row) => String(row.name || row.fullName || row.orderNumber || row.displayCode || row.tableNumber || row.label || row.email || row.id || "Record");
const asMoney = (value: unknown, currency = "MMK") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "MMK", maximumFractionDigits: 0 }).format(Number(value || 0));
const messageOf = (payload: unknown, fallback: string) => String(record(payload).message || record(payload).error || fallback);

export default function WorkspacePage() {
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connected, setConnected] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("Your restaurant");
  const [role, setRole] = useState("");
  const [view, setView] = useState<View>("overview");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<Row>({});
  const [orders, setOrders] = useState<Row[]>([]);
  const [queue, setQueue] = useState<Row[]>([]);
  const [deliveries, setDeliveries] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [groupsList, setGroupsList] = useState<Row[]>([]);
  const [tables, setTables] = useState<Row[]>([]);
  const [zones, setZones] = useState<Row[]>([]);
  const [members, setMembers] = useState<Row[]>([]);
  const [addresses, setAddresses] = useState<Row[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Row[]>([]);
  const [customerZones, setCustomerZones] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [publicMenu, setPublicMenu] = useState<Row>({});
  const [report, setReport] = useState<Row>({});
  const [search, setSearch] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<{ title: string; path: string; method: string; body: string } | null>(null);
  const [apiTool, setApiTool] = useState({ method: "GET", path: "/api/v1/my/restaurants", body: "{}" });
  const [responseData, setResponseData] = useState<unknown>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryOrder, setCategoryOrder] = useState("0");
  const [productForm, setProductForm] = useState({ name: "", description: "", categoryId: "", price: "0", available: true, trackStock: false, stockQuantity: "0" });
  const [variantForm, setVariantForm] = useState({ productId: "", name: "", price: "0" });
  const [groupForm, setGroupForm] = useState({ name: "", required: false, minSelections: "0", maxSelections: "1" });
  const [optionForm, setOptionForm] = useState({ groupId: "", name: "", additionalPrice: "0" });
  const [tableNumber, setTableNumber] = useState("");
  const [zoneForm, setZoneForm] = useState({ name: "", deliveryFee: "0", minimumOrder: "0", active: true, coverageCity: "", coverageTownship: "" });
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", role: "STAFF" });
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "", preferredLanguage: "en" });
  const [addressForm, setAddressForm] = useState({ label: "Home", recipientName: "", houseNo: "", street: "", ward: "", township: "", city: "", deliveryNote: "", makeDefault: true });
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId: string; specialInstruction: string; modifiers: Record<string, number> }>>({});
  const [checkout, setCheckout] = useState({ addressId: "", zoneId: "", recipientName: "", recipientPhone: "" });
  const [ticket, setTicket] = useState({ id: "", token: "" });
  const [tracking, setTracking] = useState<Row>({});
  const [trackingNotifications, setTrackingNotifications] = useState<Row[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null);

  async function call<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
    const base = apiUrl.trim().replace(/\/+$/, "");
    if (!base) throw new Error("Enter the backend API URL.");
    const isPublic = path.startsWith("/api/v1/public/");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isPublic) {
      if (!token.trim()) throw new Error("Paste a valid Supabase access token first.");
      headers.Authorization = "Bearer " + token.trim();
    }
    let requestBody: BodyInit | undefined;
    if (body instanceof FormData) requestBody = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
    let response: Response;
    try { response = await fetch(base + (path.startsWith("/") ? path : "/" + path), { method, headers, body: requestBody, cache: "no-store" }); }
    catch { throw new Error("Cannot reach the backend. Check the API URL, server state, and CORS configuration."); }
    const raw = await response.text();
    let payload: unknown = null;
    if (raw) { try { payload = JSON.parse(raw); } catch { payload = raw; } }
    if (!response.ok) {
      const msg = typeof payload === "string" ? payload : messageOf(payload, "Backend returned HTTP " + response.status + ".");
      if (response.status === 401) throw new Error("Authentication failed. Refresh your Supabase access token.");
      if (response.status === 403) throw new Error("This role cannot perform that action. " + msg);
      throw new Error(msg);
    }
    return payload as T;
  }

  function fail(cause: unknown, fallback = "The request could not be completed.") {
    setError(cause instanceof Error ? cause.message : fallback); setNotice("");
  }
  function ok(text: string) { setNotice(text); setError(""); }
  async function act(work: () => Promise<unknown>, success: string, refresh: View = view) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await work();
      setResponseData(result);
      ok(success);
      if (!["api","queue-track"].includes(refresh)) await loadView(refresh, restaurantId);
      return result;
    } catch (cause) { fail(cause); return null; }
    finally { setBusy(false); }
  }

  function restaurantPath(suffix: string, id = restaurantId) { return rid(id, suffix); }

  async function loadView(next: View, id = restaurantId) {
    setLoading(true); setError("");
    try {
      switch (next) {
        case "overview": {
          const results = await Promise.allSettled([
            call(restaurantPath("orders") + "?page=0&size=12", "GET"),
            call(restaurantPath("queue-tickets"), "GET"),
            call(role === "DELIVERY_DRIVER" ? restaurantPath("deliveries/mine", id) : restaurantPath("deliveries?page=0&size=20", id), "GET"),
            call(restaurantPath("reports/daily") + "?date=" + reportDate, "GET"),
            call("/api/v1/restaurants/" + encodeURIComponent(id), "GET"),
          ]);
          if (results[0].status === "fulfilled") setOrders(list(results[0].value));
          if (results[1].status === "fulfilled") setQueue(list(results[1].value));
          if (results[2].status === "fulfilled") setDeliveries(list(results[2].value));
          if (results[3].status === "fulfilled") setReport(record(results[3].value));
          if (results[4].status === "fulfilled") { setData(record(results[4].value)); setRestaurantName(String(record(results[4].value).name || restaurantName)); }
          if (results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
          break;
        }
        case "orders": setOrders(list(await call(restaurantPath("orders?page=0&size=100")))); break;
        case "queue": setQueue(list(await call(restaurantPath("queue-tickets")))); break;
        case "deliveries": setDeliveries(list(await call(role === "DELIVERY_DRIVER" ? restaurantPath("deliveries/mine") : restaurantPath("deliveries?page=0&size=100")))); break;
        case "menu": {
          const res = await Promise.all([
            call(restaurantPath("categories")), call(restaurantPath("products")), call(restaurantPath("modifier-groups")),
          ]);
          setCategories(list(res[0])); setProducts(list(res[1])); setGroupsList(list(res[2])); break;
        }
        case "tables": setTables(list(await call(restaurantPath("tables")))); break;
        case "settings": {
          const res = await call(restaurantPath("settings")); setData(record(res)); break;
        }
        case "zones": setZones(list(await call(restaurantPath("delivery-zones")))); break;
        case "members": setMembers(list(await call(restaurantPath("members")))); break;
        case "restaurant": setData(record(await call("/api/v1/restaurants/" + encodeURIComponent(id)))); break;
        case "reports": setReport(record(await call(restaurantPath("reports/daily") + "?date=" + reportDate))); break;
        case "storefront": {
          const res = await Promise.all([
            call("/api/v1/public/restaurants/" + encodeURIComponent(id) + "/menu"),
            call("/api/v1/customer/restaurants/" + encodeURIComponent(id) + "/delivery-zones"),
          ]);
          setPublicMenu(record(res[0])); setCustomerZones(list(res[1])); break;
        }
        case "profile": {
          const p = record(await call("/api/v1/customer/profile")); setData(p);
          setProfileForm({ fullName: String(p.fullName || ""), phone: String(p.phone || ""), preferredLanguage: String(p.preferredLanguage || "en") }); break;
        }
        case "addresses": setAddresses(list(await call("/api/v1/customer/addresses"))); break;
        case "my-orders": setCustomerOrders(list(await call("/api/v1/customer/orders?page=0&size=50"))); break;
        case "notifications": setNotifications(list(await call("/api/v1/notifications"))); break;
        case "devices": setDevices(list(await call("/api/v1/devices"))); break;
        default: break;
      }
    } catch (cause) { fail(cause, "Could not load " + next + "."); }
    finally { setLoading(false); }
  }

  function changeView(next: View) {
    setView(next); setSearch(""); setOneTimeSecret("");
    if (next !== "api" && next !== "queue-track" && next !== "create") void loadView(next);
  }

  async function connect(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = list(await call("/api/v1/my/restaurants"));
      const loaded = result.map((row) => {
        const r = record(row.restaurant);
        return { id: String(row.restaurantId || r.id || row.id || ""), name: String(row.restaurantName || r.name || row.name || "Restaurant"), role: String(row.role || row.membershipRole || "UNKNOWN") };
      }).filter((item) => item.id);
      setMemberships(loaded); setConnected(true);
      if (!loaded.length) { setView("create"); ok("No restaurant membership was found. Create a restaurant to start."); return; }
      const selected = loaded.find((item) => item.id === restaurantId) || loaded[0];
      setRestaurantId(selected.id); setRestaurantName(selected.name); setRole(selected.role);
      ok("Connected as " + selected.role + ". The backend enforces actual permissions.");
      await loadView("overview", selected.id);
    } catch (cause) { fail(cause, "Could not connect."); }
    finally { setBusy(false); }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    let body: unknown;
    try { body = draft.body.trim() ? JSON.parse(draft.body) : undefined; }
    catch { setError("The request must contain valid JSON."); return; }
    await act(() => call(draft.path, draft.method, body), draft.title + " saved.");
    setDraft(null);
  }
  function editRecord(title: string, path: string, row: Row, method = "PUT") {
    const ignored = ["id","restaurantId","createdAt","updatedAt","variants","modifierGroups","options","avatarUrl","signedAvatarUrl"];
    const body = Object.fromEntries(Object.entries(row).filter(([key]) => !ignored.includes(key)));
    setDraft({ title, path, method, body: JSON.stringify(body, null, 2) });
  }
  async function upload(path: string, file?: File) {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    await act(() => call(path, "POST", form), "Image uploaded.");
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("categories"), "POST", { name: categoryName.trim(), displayOrder: Number(categoryOrder), active: true }), "Category created.", "menu");
    setCategoryName("");
  }
  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!productForm.categoryId) { setError("Choose a category first."); return; }
    await act(() => call(restaurantPath("products"), "POST", { name: productForm.name.trim(), description: productForm.description.trim() || null, categoryId: productForm.categoryId, price: Number(productForm.price), available: productForm.available, trackStock: productForm.trackStock, stockQuantity: productForm.trackStock ? Number(productForm.stockQuantity) : null }), "Product created.", "menu");
    setProductForm({ name: "", description: "", categoryId: productForm.categoryId, price: "0", available: true, trackStock: false, stockQuantity: "0" });
  }
  async function createVariant(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("products/" + encodeURIComponent(variantForm.productId) + "/variants"), "POST", { name: variantForm.name.trim(), price: Number(variantForm.price), available: true }), "Variant created.", "menu");
    setVariantForm({ ...variantForm, name: "", price: "0" });
  }
  async function createGroup(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("modifier-groups"), "POST", { name: groupForm.name.trim(), required: groupForm.required, minSelections: Number(groupForm.minSelections), maxSelections: Number(groupForm.maxSelections), active: true }), "Modifier group created.", "menu");
    setGroupForm({ name: "", required: false, minSelections: "0", maxSelections: "1" });
  }
  async function createOption(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("modifier-groups/" + encodeURIComponent(optionForm.groupId) + "/options"), "POST", { name: optionForm.name.trim(), additionalPrice: Number(optionForm.additionalPrice), available: true }), "Modifier option created.", "menu");
    setOptionForm({ ...optionForm, name: "", additionalPrice: "0" });
  }
  async function createTable(event: FormEvent) {
    event.preventDefault();
    const result = await act(() => call(restaurantPath("tables"), "POST", { tableNumber: tableNumber.trim(), active: true }), "Table created. Copy the one-time QR token if the backend returns it.", "tables");
    const obj = record(result); setOneTimeSecret(String(obj.qrToken || obj.token || obj.rawToken || "")); setTableNumber("");
  }
  async function createZone(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("delivery-zones"), "POST", { name: zoneForm.name.trim(), deliveryFee: Number(zoneForm.deliveryFee), minimumOrder: Number(zoneForm.minimumOrder), active: zoneForm.active, coverageCity: zoneForm.coverageCity.trim() || null, coverageTownship: zoneForm.coverageTownship.trim() || null }), "Delivery zone created.", "zones");
    setZoneForm({ name: "", deliveryFee: "0", minimumOrder: "0", active: true, coverageCity: "", coverageTownship: "" });
  }
  async function inviteMember(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("members/invitations"), "POST", inviteForm), "Invitation submitted to Supabase Auth.", "members");
    setInviteForm({ email: "", fullName: "", role: "STAFF" });
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    await act(() => call("/api/v1/customer/profile", "PUT", profileForm), "Customer profile updated.", "profile");
  }
  async function createAddress(event: FormEvent) {
    event.preventDefault();
    const body = { ...addressForm, latitude: null, longitude: null };
    await act(() => call("/api/v1/customer/addresses", "POST", body), "Address saved.", "addresses");
    setAddressForm({ ...addressForm, houseNo: "", street: "", ward: "", township: "", city: "", deliveryNote: "", makeDefault: false });
  }
  function menuProduct(productId: string): Row {
    return list(publicMenu.categories).flatMap((c) => list(c.products)).find((p) => String(p.id) === productId) || {};
  }
  const cartTotal = useMemo(() => Object.entries(cart).reduce((sum, [id, item]) => {
    const product = menuProduct(id);
    const variant = list(product.variants).find((v) => String(v.id) === item.variantId);
    const modifiers = list(product.modifierGroups).reduce((n, group) => n + list(group.options).reduce((m, option) => m + Number(option.additionalPrice || 0) * Number(item.modifiers[String(option.id)] || 0), 0), 0);
    return sum + (Number(variant?.price ?? product.price ?? 0) + modifiers) * item.quantity;
  }, 0), [cart, publicMenu]);

  async function placeDeliveryOrder() {
    const items = Object.entries(cart).filter(([, item]) => item.quantity > 0).map(([productId, item]) => ({
      productId, variantId: item.variantId || null, quantity: item.quantity, specialInstruction: item.specialInstruction || null,
      modifiers: Object.entries(item.modifiers).filter(([, quantity]) => quantity > 0).map(([modifierOptionId, quantity]) => ({ modifierOptionId, quantity })),
    }));
    if (!items.length || !checkout.addressId || !checkout.zoneId) { setError("Add menu items and choose a saved address plus delivery zone."); return; }
    const result = await act(() => call("/api/v1/customer/restaurants/" + encodeURIComponent(restaurantId) + "/orders/delivery", "POST", { addressId: checkout.addressId, deliveryZoneId: checkout.zoneId, recipientName: checkout.recipientName || null, recipientPhone: checkout.recipientPhone || null, paymentMethod: "CASH_ON_DELIVERY", items }), "Delivery order placed. Payment is cash on delivery.", "my-orders");
    if (result) { setCart({}); setView("my-orders"); await loadView("my-orders"); }
  }
  async function updateDelivery(task: Row, status: string) {
    const body: Row = { status, note: "Updated from Restaurant Platform web workspace." };
    if (status === "FAILED") {
      const reason = window.prompt("Reason for failed delivery:");
      if (!reason) return; body.failureReason = reason;
    }
    if (status === "DELIVERED") {
      body.cashCollected = window.confirm("Confirm successful delivery and collection of any cash-on-delivery payment.");
      if (!body.cashCollected) { setError("Please confirm cash collection before marking delivered."); return; }
    }
    await act(() => call(restaurantPath("deliveries/" + encodeURIComponent(String(task.id)) + "/status"), "PATCH", body), "Delivery status updated.");
  }
  async function assignDriver(task: Row) {
    const userId = window.prompt("Enter the user UUID of a DELIVERY_DRIVER in this restaurant:", String(task.driverUserId || ""));
    if (!userId) return;
    await act(() => call(restaurantPath("deliveries/" + encodeURIComponent(String(task.id)) + "/assign"), "PATCH", { driverUserId: userId, note: "Assigned from workspace." }), "Delivery assigned.");
  }
  async function rotateSecret(path: string, message: string) {
    const result = await act(() => call(restaurantPath(path), "POST"), message);
    const obj = record(result); setOneTimeSecret(String(obj.qrToken || obj.token || obj.commonQrToken || obj.rawToken || ""));
  }
  async function trackQueue(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const base = apiUrl.trim().replace(/\/+$/, "");
      const headers = { Accept: "application/json", "X-Queue-Token": ticket.token.trim() };
      const statusRes = await fetch(base + "/api/v1/public/queue-tickets/" + encodeURIComponent(ticket.id) + "/status", { headers, cache: "no-store" });
      const notifRes = await fetch(base + "/api/v1/public/queue-tickets/" + encodeURIComponent(ticket.id) + "/notifications", { headers, cache: "no-store" });
      const statusBody = await statusRes.json();
      const notifBody = await notifRes.json().catch(() => []);
      if (!statusRes.ok) throw new Error(messageOf(statusBody, "Queue tracking failed."));
      setTracking(record(statusBody)); setTrackingNotifications(list(notifBody)); ok("Queue status refreshed.");
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }
  async function submitApi(event: FormEvent) {
    event.preventDefault();
    let body: unknown;
    try { body = ["POST","PUT","PATCH"].includes(apiTool.method) ? JSON.parse(apiTool.body || "{}") : undefined; }
    catch { setError("Request body must be valid JSON."); return; }
    await act(() => call(apiTool.path, apiTool.method, body), "API request completed.", "api");
  }
  async function createRestaurant(event: FormEvent) {
    event.preventDefault();
    await act(() => call("/api/v1/restaurants", "POST", { name: restaurantName, slug: restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), description: "", phone: "", address: "", houseNo: "", street: "", ward: "", township: "", city: "", currency: "MMK", timezone: "Asia/Yangon", latitude: null, longitude: null, logoUrl: null }), "Restaurant created; reconnect to load the new OWNER membership.", "create");
    await connect();
  }

  const titles: Record<View, string> = { overview: "Overview", orders: "Orders", "staff-order": "Staff order", queue: "Queue & pickup", deliveries: "Deliveries / driver", reports: "Daily report", menu: "Menu & catalogue", tables: "Tables & QR", settings: "Settings", zones: "Delivery zones", members: "Team & roles", restaurant: "Restaurant profile", storefront: "Delivery storefront", profile: "My profile", addresses: "Saved addresses", "my-orders": "My orders", notifications: "Notifications", devices: "Push devices", "queue-track": "Track queue ticket", api: "API workbench", create: "Create restaurant" };
  const title = titles[view];
  const filteredOrders = orders.filter((o) => JSON.stringify(o).toLowerCase().includes(search.toLowerCase()));
  const filteredProducts = products.filter((p) => JSON.stringify(p).toLowerCase().includes(search.toLowerCase()));
  const activeCartItems = Object.entries(cart).filter(([, item]) => item.quantity > 0);

  function nav() {
    return groups.map((group) => <div className="ws-nav-group" key={group.title}><div className="ws-nav-label">{group.title}</div>{group.items.map((item) => <button key={item[0]} className={"ws-nav-item " + (view === item[0] ? "is-active" : "")} onClick={() => changeView(item[0] as View)}><span className="ws-nav-icon">{item[2]}</span><span>{item[1]}</span></button>)}</div>);
  }
  function intro(heading: string, sub: string) {
    return <div className="ws-section-intro"><div><span className="ws-eyebrow">WORKSPACE</span><h2>{heading}</h2><p>{sub}</p></div></div>;
  }
  function empty(text: string) { return <div className="ws-empty-state"><span>—</span><p>{text}</p></div>; }
  function field(labelText: string, child: React.ReactNode, wide = false) {
    return <label className={"ws-field " + (wide ? "ws-field-wide" : "")}><span>{labelText}</span>{child}</label>;
  }
  function editorButton(titleText: string, path: string, row: Row, method = "PUT") {
    return <button className="ws-btn ws-btn-muted" onClick={() => editRecord(titleText, path, row, method)}>Edit fields</button>;
  }

  function workspaceContent(): React.ReactNode {
    if (view === "overview") return <>
      <div className="ws-hero"><div><div className="ws-eyebrow">RESTAURANT OPERATIONS</div><h2>Service, in one workspace.</h2><p>Manage orders, pickup queues, menu items, deliveries and customer workflows from desktop or phone.</p></div><div className="ws-hero-mark">R<span /></div></div>
      <div className="ws-stat-grid">{[
        ["Orders today", report.totalOrders ?? orders.length], ["Pending", report.pendingOrders ?? orders.filter((x) => x.status === "PENDING").length],
        ["Completed", report.completedOrders ?? orders.filter((x) => x.status === "COMPLETED").length], ["Sales", asMoney(report.orderAmountExcludingCancelled ?? report.paidAmount ?? 0, String(data.currency || "MMK"))],
      ].map(([name, value]) => <div className="ws-stat" key={String(name)}><span>{name}</span><strong>{value}</strong><small>Latest information from backend</small></div>)}</div>
      <div className="ws-grid-two"><section className="ws-card"><div className="ws-card-heading"><div><h3>Recent orders</h3><p>Latest service activity</p></div><button className="ws-link-btn" onClick={() => changeView("orders")}>View all ↗</button></div>{orders.slice(0, 5).map((o) => <div className="ws-list-row" key={String(o.id)}><div><b>{label(o)}</b><small>{String(o.orderType || "")} · {String(o.orderChannel || "")}</small></div><div className="ws-row-end"><span className="ws-status">{String(o.status || "UNKNOWN")}</span><b>{asMoney(o.totalAmount, String(data.currency || "MMK"))}</b></div></div>)}{!orders.length && empty("Orders appear here when the backend returns records.")}</section><section className="ws-card"><div className="ws-card-heading"><div><h3>Quick actions</h3><p>Open the workflows your role needs</p></div></div><div className="ws-quick-grid">{[["Staff order","staff-order"],["Queue & pickup","queue"],["Delivery tasks","deliveries"],["Edit catalogue","menu"],["Manage team","members"],["Daily report","reports"]].map(([name,key]) => <button className="ws-quick" key={key} onClick={() => changeView(key as View)}><b>{name}</b><i>↗</i></button>)}</div></section></div>
    </>;

    if (view === "orders") return <>
      {intro("Order management","Inspect order details, change supported statuses, and open payment metadata. Illegal state transitions are rejected by the backend.")}
      <div className="ws-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order number, type, status…" /><button className="ws-btn ws-btn-muted" onClick={() => loadView("orders")}>Refresh</button><button className="ws-btn ws-btn-primary" onClick={() => changeView("staff-order")}>＋ Counter order</button></div>
      <div className="ws-record-list">{filteredOrders.map((o) => <article className="ws-record" key={String(o.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(o)}</b><span className="ws-status">{String(o.status || "")}</span></div><p>{String(o.orderType || "")} · {String(o.orderChannel || "")} · {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}</p><strong>{asMoney(o.totalAmount, String(data.currency || "MMK"))}</strong><small>Order UUID: {String(o.id || "")}</small></div><div className="ws-record-actions"><button className="ws-btn ws-btn-muted" onClick={() => setSelectedOrder(o)}>Details</button>{nextStates(String(o.status), String(o.orderType)).map((s) => <button className="ws-btn ws-btn-primary" key={s} onClick={() => act(() => call(restaurantPath("orders/" + encodeURIComponent(String(o.id)) + "/status"), "PATCH", { status: s, note: "Updated from workspace." }), "Order updated to " + s + ".")}>{s}</button>)}<button className="ws-btn ws-btn-soft" onClick={() => { setApiTool({ method:"GET", path:restaurantPath("orders/" + encodeURIComponent(String(o.id)) + "/payments"), body:"{}" }); setView("api"); }}>Payments</button></div></article>)}</div>{!filteredOrders.length && empty("No orders matched this search.")}
    </>;

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

    if (view === "queue") return <>
      {intro("Queue & pickup","Call ready queue numbers. Customers can track status through the ticket UUID and token returned at checkout.")}
      <div className="ws-toolbar"><button className="ws-btn ws-btn-muted" onClick={() => loadView("queue")}>Refresh queue</button><button className="ws-btn ws-btn-soft" onClick={() => changeView("queue-track")}>Open customer tracker</button></div>
      <div className="ws-ticket-grid">{queue.map((t) => <article className="ws-ticket" key={String(t.ticketId || t.id)}><div className="ws-ticket-top"><span>QUEUE NUMBER</span><span className="ws-status">{String(t.status || "")}</span></div><strong>{String(t.displayCode || t.queueNumber || "—")}</strong><small>{t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}</small>{t.status === "READY" && <button className="ws-btn ws-btn-primary" onClick={() => act(() => call(restaurantPath("queue-tickets/" + encodeURIComponent(String(t.ticketId || t.id)) + "/call"), "PATCH"), "Queue number called.")}>Call this number</button>}<button className="ws-btn ws-btn-muted" onClick={() => { setTicket({ ...ticket, id: String(t.ticketId || t.id || "") }); setView("queue-track"); }}>Track this ticket</button></article>)}{!queue.length && empty("No queue tickets returned.")}</div>
    </>;

    if (view === "deliveries") return <>
      {intro(role === "DELIVERY_DRIVER" ? "My delivery tasks" : "Delivery operations", role === "DELIVERY_DRIVER" ? "Only tasks assigned to your signed-in driver account are returned." : "Assign tasks to drivers in this restaurant and track handoffs. Delivery completion requires confirmation of cash collection when applicable.")}
      <div className="ws-toolbar"><button className="ws-btn ws-btn-muted" onClick={() => loadView("deliveries")}>Refresh tasks</button><span className="ws-muted">{deliveries.length} tasks</span></div>
      <div className="ws-record-list">{deliveries.map((t) => <article className="ws-record" key={String(t.id)}><div className="ws-record-main"><div className="ws-record-title"><b>Order {String(t.orderNumber || t.orderId || "").slice(0,24)}</b><span className="ws-status">{String(t.status || "")}</span></div><p>{String(t.customerName || "Customer")}{t.customerPhone ? " · " + t.customerPhone : ""}</p><div className="ws-address">{String(t.deliveryAddress || "No address available")}</div><strong>{asMoney(t.totalAmount, String(data.currency || "MMK"))}</strong>{t.deliveryNote && <small>Note: {String(t.deliveryNote)}</small>}{t.driverUserId && <small>Driver ID: {String(t.driverUserId)}</small>}{t.failureReason && <small className="ws-danger-text">Failure: {String(t.failureReason)}</small>}</div><div className="ws-record-actions">{role !== "DELIVERY_DRIVER" && <button className="ws-btn ws-btn-muted" onClick={() => { const id = window.prompt("Enter DELIVERY_DRIVER user UUID:", String(t.driverUserId || "")); if (id) void act(() => call(restaurantPath("deliveries/" + encodeURIComponent(String(t.id)) + "/assign"), "PATCH", { driverUserId: id, note: "Assigned from workspace." }), "Delivery assigned."); }}>Assign / reassign</button>}{nextDeliveryStates(String(t.status)).map((s) => <button className="ws-btn ws-btn-primary" key={s} onClick={() => {
        const body: Row = { status:s, note:"Updated from workspace." };
        if (s === "FAILED") { const reason = window.prompt("Failure reason:"); if (!reason) return; body.failureReason = reason; }
        if (s === "DELIVERED") { body.cashCollected = window.confirm("Confirm the delivery and any cash collection?"); if (!body.cashCollected) return; }
        void act(() => call(restaurantPath("deliveries/" + encodeURIComponent(String(t.id)) + "/status"), "PATCH", body), "Delivery updated to " + s + ".");
      }}>{s}</button>)}</div></article>)}{!deliveries.length && empty("No tasks assigned or waiting.")}</div>
    </>;

    if (view === "reports") return <>
      {intro("Daily operations report","Review order state counts and sales totals calculated in the restaurant timezone.")}
      <section className="ws-card"><div className="ws-inline-form">{field("Report date", <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />)}<button className="ws-btn ws-btn-primary" onClick={() => loadView("reports")}>Load report</button></div><div className="ws-stat-grid">{[
        ["Total orders",report.totalOrders],["Pending",report.pendingOrders],["Accepted",report.acceptedOrders],["Preparing",report.preparingOrders],["Ready",report.readyOrders],["Out for delivery",report.outForDeliveryOrders],["Completed",report.completedOrders],["Cancelled",report.cancelledOrders],["Paid amount",asMoney(report.paidAmount,String(data.currency||"MMK"))],["Sales excluding cancelled",asMoney(report.orderAmountExcludingCancelled,String(data.currency||"MMK"))],
      ].map(([k,v]) => <div className="ws-stat" key={String(k)}><span>{k}</span><strong>{v ?? "—"}</strong></div>)}</div><p className="ws-muted">Timezone: {String(report.timezone || "returned by backend")}</p></section>
    </>;

    if (view === "menu") return <>
      {intro("Menu & catalogue","Create categories, products, variants and modifier choices. Upload product/variant images and link modifier groups to products. Backend roles control write access.")}
      <div className="ws-toolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" /><button className="ws-btn ws-btn-muted" onClick={() => loadView("menu")}>Refresh</button></div>
      <div className="ws-grid-two">
        <section className="ws-card"><h3>New category</h3><form className="ws-form-grid" onSubmit={createCategory}>{field("Name",<input value={categoryName} onChange={(e)=>setCategoryName(e.target.value)} required />)}{field("Display order",<input type="number" value={categoryOrder} onChange={(e)=>setCategoryOrder(e.target.value)} />)}<button className="ws-btn ws-btn-primary">Create category</button></form><div className="ws-chip-list">{categories.map((c)=><button className="ws-chip" key={String(c.id)} onClick={()=>editRecord("Edit category",restaurantPath("categories/"+encodeURIComponent(String(c.id))),c)}>{label(c)} · Edit</button>)}</div></section>
        <section className="ws-card"><h3>New product</h3><form className="ws-form-grid" onSubmit={createProduct}>{field("Product name",<input value={productForm.name} onChange={(e)=>setProductForm({...productForm,name:e.target.value})} required />)}{field("Category",<select value={productForm.categoryId} onChange={(e)=>setProductForm({...productForm,categoryId:e.target.value})} required><option value="">Select category</option>{categories.map((c)=><option key={String(c.id)} value={String(c.id)}>{label(c)}</option>)}</select>)}{field("Price",<input type="number" min="0" value={productForm.price} onChange={(e)=>setProductForm({...productForm,price:e.target.value})} required />)}{field("Description",<input value={productForm.description} onChange={(e)=>setProductForm({...productForm,description:e.target.value})} />,true)}{field("Availability",<select value={String(productForm.available)} onChange={(e)=>setProductForm({...productForm,available:e.target.value==="true"})}><option value="true">Available</option><option value="false">Unavailable</option></select>)}{field("Track stock",<select value={String(productForm.trackStock)} onChange={(e)=>setProductForm({...productForm,trackStock:e.target.value==="true"})}><option value="false">No</option><option value="true">Yes</option></select>)}{productForm.trackStock&&field("Stock quantity",<input type="number" min="0" value={productForm.stockQuantity} onChange={(e)=>setProductForm({...productForm,stockQuantity:e.target.value})}/>)}<button className="ws-btn ws-btn-primary">Create product</button></form></section>
      </div>
      <section className="ws-card"><div className="ws-card-heading"><div><h3>Products</h3><p>{filteredProducts.length} results · choose a file to upload product or variant image</p></div></div><div className="ws-product-grid">{filteredProducts.map((p)=><article className="ws-product" key={String(p.id)}>{p.imageUrl?<img src={String(p.imageUrl)} alt={String(p.name)}/>:<div className="ws-product-placeholder">MENU</div>}<div className="ws-product-body"><div className="ws-record-title"><b>{label(p)}</b><span className="ws-status">{p.available===false?"Unavailable":"Available"}</span></div><p>{String(p.description||"")}</p><strong>{asMoney(p.price,String(data.currency||"MMK"))}</strong><div className="ws-inline-actions">{editorButton("Edit product",restaurantPath("products/"+encodeURIComponent(String(p.id))),p)}<label className="ws-upload-btn">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>void upload(restaurantPath("products/"+encodeURIComponent(String(p.id))+"/image"),e.target.files?.[0])}/></label></div>{list(p.variants).map((v)=><div className="ws-subitem" key={String(v.id)}><span>{label(v)} · {asMoney(v.price,String(data.currency||"MMK"))}</span>{editorButton("Edit variant",restaurantPath("products/"+encodeURIComponent(String(p.id))+"/variants/"+encodeURIComponent(String(v.id))),v)}<label className="ws-upload-btn">Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>void upload(restaurantPath("products/"+encodeURIComponent(String(p.id))+"/variants/"+encodeURIComponent(String(v.id))+"/image"),e.target.files?.[0])}/></label></div>)}</div></article>)}</div>{!filteredProducts.length&&empty("No products yet.")}</section>
      <div className="ws-grid-two">
        <section className="ws-card"><h3>New variant</h3><form className="ws-form-grid" onSubmit={createVariant}>{field("Product",<select value={variantForm.productId} onChange={(e)=>setVariantForm({...variantForm,productId:e.target.value})} required><option value="">Select product</option>{products.map((p)=><option key={String(p.id)} value={String(p.id)}>{label(p)}</option>)}</select>)}{field("Variant name",<input value={variantForm.name} onChange={(e)=>setVariantForm({...variantForm,name:e.target.value})} required />)}{field("Price",<input type="number" min="0" value={variantForm.price} onChange={(e)=>setVariantForm({...variantForm,price:e.target.value})} required />)}<button className="ws-btn ws-btn-primary">Create variant</button></form></section>
        <section className="ws-card"><h3>Modifier groups & options</h3><form className="ws-form-grid" onSubmit={createGroup}>{field("New group",<input value={groupForm.name} onChange={(e)=>setGroupForm({...groupForm,name:e.target.value})} required />)}{field("Required",<select value={String(groupForm.required)} onChange={(e)=>setGroupForm({...groupForm,required:e.target.value==="true"})}><option value="false">Optional</option><option value="true">Required</option></select>)}{field("Min selections",<input type="number" min="0" value={groupForm.minSelections} onChange={(e)=>setGroupForm({...groupForm,minSelections:e.target.value})}/>)}{field("Max selections",<input type="number" min="1" value={groupForm.maxSelections} onChange={(e)=>setGroupForm({...groupForm,maxSelections:e.target.value})}/>)}<button className="ws-btn ws-btn-primary">Create modifier group</button></form><form className="ws-form-grid ws-form-top" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("modifier-groups/"+encodeURIComponent(optionForm.groupId)+"/options"),"POST",{name:optionForm.name,additionalPrice:Number(optionForm.additionalPrice),available:true}),"Modifier option created.","menu");}}>{field("Group",<select value={optionForm.groupId} onChange={(e)=>setOptionForm({...optionForm,groupId:e.target.value})} required><option value="">Select group</option>{groupsList.map((g)=><option key={String(g.id)} value={String(g.id)}>{label(g)}</option>)}</select>)}{field("Option name",<input value={optionForm.name} onChange={(e)=>setOptionForm({...optionForm,name:e.target.value})} required />)}{field("Extra price",<input type="number" min="0" value={optionForm.additionalPrice} onChange={(e)=>setOptionForm({...optionForm,additionalPrice:e.target.value})}/>)}<button className="ws-btn ws-btn-muted">Add option</button></form><div className="ws-chip-list">{groupsList.map((g)=><button className="ws-chip" key={String(g.id)} onClick={()=>editRecord("Edit modifier group",restaurantPath("modifier-groups/"+encodeURIComponent(String(g.id))),g)}>{label(g)} · {list(g.options).length} options</button>)}</div></section>
      </div>
    </>;

    if (view === "tables") return <>
      {intro("Tables & QR codes","Create table identifiers, rename or deactivate tables, or rotate the token if a printed table QR code should stop working.")}
      <section className="ws-card"><form className="ws-inline-form" onSubmit={createTable}>{field("Table number",<input value={tableNumber} onChange={(e)=>setTableNumber(e.target.value)} placeholder="T1" required />)}<button className="ws-btn ws-btn-primary">＋ Add table</button></form></section>
      <div className="ws-record-list">{tables.map((t)=><article className="ws-record" key={String(t.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(t)}</b><span className="ws-status">{t.active===false?"Inactive":"Active"}</span></div><small>{String(t.id||"")}</small></div><div className="ws-record-actions">{editorButton("Edit table",restaurantPath("tables/"+encodeURIComponent(String(t.id))),t)}<button className="ws-btn ws-btn-primary" onClick={()=>void rotateSecret("tables/"+encodeURIComponent(String(t.id))+"/qr-token/rotate","Table QR token rotated; replace the printed QR.")}>Rotate QR</button></div></article>)}</div>{!tables.length&&empty("No tables set up yet.")}
    </>;

    if (view === "settings") return <>
      {intro("Restaurant settings","Read and update currency, timezone, checkout flags, minimum order, default delivery fee and the default driver setting. The Common QR token is only shown once when rotated.")}
      <div className="ws-grid-two"><section className="ws-card"><div className="ws-card-heading"><div><h3>Operational settings</h3><p>Current server response</p></div>{editorButton("Edit restaurant settings",restaurantPath("settings"),data)}</div><pre className="ws-json-preview">{JSON.stringify(data,null,2)}</pre><button className="ws-btn ws-btn-primary" onClick={()=>void rotateSecret("settings/common-qr-token/rotate","Common QR secret rotated. Replace previously printed codes.")}>Rotate Common QR secret</button></section><section className="ws-card"><h3>Default delivery driver</h3><p>Configure an assigned DELIVERY_DRIVER for newly ready delivery orders.</p><button className="ws-btn ws-btn-muted" onClick={()=>setApiTool({method:"PATCH",path:restaurantPath("delivery-settings/default-driver"),body:'{ "driverUserId": "DRIVER-USER-UUID" }'})||setView("api")}>Configure driver in API workbench</button><p className="ws-muted">Driver UUID must be a member of this restaurant with role DELIVERY_DRIVER.</p></section></div>
    </>;

    if (view === "zones") return <>
      {intro("Delivery zones","Set fee, minimum order and optional city/township restrictions. City and township should be set together for coverage checks.")}
      <section className="ws-card"><form className="ws-form-grid" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("delivery-zones"),"POST",{name:zoneForm.name,deliveryFee:Number(zoneForm.deliveryFee),minimumOrder:Number(zoneForm.minimumOrder),active:zoneForm.active,coverageCity:zoneForm.coverageCity||null,coverageTownship:zoneForm.coverageTownship||null}),"Delivery zone created.","zones");}}>{field("Name",<input value={zoneForm.name} onChange={(e)=>setZoneForm({...zoneForm,name:e.target.value})} required />)}{field("Delivery fee",<input type="number" min="0" value={zoneForm.deliveryFee} onChange={(e)=>setZoneForm({...zoneForm,deliveryFee:e.target.value})}/>)}{field("Minimum order",<input type="number" min="0" value={zoneForm.minimumOrder} onChange={(e)=>setZoneForm({...zoneForm,minimumOrder:e.target.value})}/>)}{field("Active",<select value={String(zoneForm.active)} onChange={(e)=>setZoneForm({...zoneForm,active:e.target.value==="true"})}><option value="true">Yes</option><option value="false">No</option></select>)}{field("Coverage city",<input value={zoneForm.coverageCity} onChange={(e)=>setZoneForm({...zoneForm,coverageCity:e.target.value})}/>)}{field("Coverage township",<input value={zoneForm.coverageTownship} onChange={(e)=>setZoneForm({...zoneForm,coverageTownship:e.target.value})}/>)}<button className="ws-btn ws-btn-primary">Create zone</button></form></section>
      <div className="ws-record-list">{zones.map((z)=><article className="ws-record" key={String(z.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(z)}</b><span className="ws-status">{z.active===false?"Inactive":"Active"}</span></div><p>Fee {asMoney(z.deliveryFee,String(data.currency||"MMK"))} · Minimum {asMoney(z.minimumOrder,String(data.currency||"MMK"))}</p><small>{String(z.coverageCity||"Any city")} · {String(z.coverageTownship||"Any township")}</small></div>{editorButton("Edit delivery zone",restaurantPath("delivery-zones/"+encodeURIComponent(String(z.id))),z)}</article>)}</div>{!zones.length&&empty("No delivery zones configured.")}
    </>;

    if (view === "members") return <>
      {intro("Team & roles","Only the OWNER role can manage memberships in the current backend policy. Invite new users, add existing profiles, change a non-owner role, remove a member or transfer ownership.")}
      <section className="ws-card"><h3>Invite a team member</h3><form className="ws-form-grid" onSubmit={(e)=>{e.preventDefault();void act(()=>call(restaurantPath("members/invitations"),"POST",inviteForm),"Invitation requested.","members");}}>{field("Email",<input type="email" value={inviteForm.email} onChange={(e)=>setInviteForm({...inviteForm,email:e.target.value})} required/>)}{field("Full name",<input value={inviteForm.fullName} onChange={(e)=>setInviteForm({...inviteForm,fullName:e.target.value})} required/>)}{field("Role",<select value={inviteForm.role} onChange={(e)=>setInviteForm({...inviteForm,role:e.target.value})}><option value="MANAGER">Manager</option><option value="STAFF">Staff</option><option value="DELIVERY_DRIVER">Delivery driver</option></select>)}<button className="ws-btn ws-btn-primary">Send invitation</button></form></section>
      <section className="ws-card"><div className="ws-card-heading"><div><h3>Members</h3><p>UUIDs and roles returned by the API</p></div><button className="ws-btn ws-btn-muted" onClick={()=>loadView("members")}>Refresh</button></div><div className="ws-record-list">{members.map((m)=><article className="ws-record" key={String(m.id||m.userId)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(m)}</b><span className="ws-status">{String(m.role||"")}</span></div><p>{String(m.email||"")}</p><small>{String(m.userId||m.id||"")}</small></div><div className="ws-record-actions">{m.role!=="OWNER"&&<><button className="ws-btn ws-btn-muted" onClick={()=>editRecord("Change member role",restaurantPath("members/"+encodeURIComponent(String(m.id))),m)}>Change role</button><button className="ws-btn ws-btn-danger" onClick={()=>window.confirm("Remove this member from the restaurant?")&&void act(()=>call(restaurantPath("members/"+encodeURIComponent(String(m.id))),"DELETE"),"Member removed.")}>Remove</button><button className="ws-btn ws-btn-soft" onClick={()=>window.confirm("Transfer ownership to this member? Your role becomes MANAGER.")&&void act(()=>call(restaurantPath("members/transfer-ownership"),"POST",{newOwnerUserId:m.userId}),"Ownership transferred.")}>Transfer owner</button></>}</div></article>)}</div>{!members.length&&empty("No members loaded, or the account lacks permission.")}</section>
    </>;

    if (view === "restaurant") return <>
      {intro("Restaurant profile","Review restaurant data, update the profile and upload a restaurant logo. Logo update is OWNER-only; the backend validates type and size.")}
      <section className="ws-card"><pre className="ws-json-preview">{JSON.stringify(data,null,2)}</pre><div className="ws-inline-actions">{editorButton("Edit profile", "/api/v1/restaurants/"+encodeURIComponent(restaurantId)+"/profile",data)}<label className="ws-upload-btn">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>void upload("/api/v1/restaurants/"+encodeURIComponent(restaurantId)+"/logo",e.target.files?.[0])}/></label><button className="ws-btn ws-btn-muted" onClick={()=>changeView("storefront")}>Preview customer storefront</button></div></section>
    </>;

    if (view === "storefront") {
      const categories = list(publicMenu.categories);
      return <>
        <div className="ws-storefront-banner"><div>{publicMenu.logoUrl?<img src={String(publicMenu.logoUrl)} alt=""/>:<span className="ws-storefront-logo">R</span>}<div><div className="ws-eyebrow">CUSTOMER STORE</div><h2>{String(publicMenu.restaurantName||restaurantName)}</h2><p>{String(publicMenu.description||"Browse menu and order delivery.")}</p></div></div><span className="ws-status">Delivery</span></div>
        <div className="ws-store-layout"><div className="ws-store-products"><div className="ws-toolbar"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search menu…"/><button className="ws-btn ws-btn-muted" onClick={()=>loadView("storefront")}>Refresh</button></div>{categories.map((c)=><section className="ws-store-category" key={String(c.id)}><h3>{label(c)}</h3><div className="ws-product-grid">{list(c.products).filter((p)=>p.available!==false&&JSON.stringify(p).toLowerCase().includes(search.toLowerCase())).map((p)=>{const key=String(p.id);const item=cart[key]||{quantity:0,variantId:"",specialInstruction:"",modifiers:{}};return <article className="ws-product" key={key}>{p.imageUrl?<img src={String(p.imageUrl)} alt={String(p.name)}/>:<div className="ws-product-placeholder">MENU</div>}<div className="ws-product-body"><b>{label(p)}</b><p>{String(p.description||"")}</p><strong>{asMoney(p.price,String(publicMenu.currency||"MMK"))}</strong>{list(p.variants).length>0&&field("Variant",<select value={item.variantId} onChange={(e)=>setCart({...cart,[key]:{...item,variantId:e.target.value}})}><option value="">Default</option>{list(p.variants).filter((v)=>v.available!==false).map((v)=><option key={String(v.id)} value={String(v.id)}>{label(v)} · {asMoney(v.price,String(publicMenu.currency||"MMK"))}</option>)}</select>)}{list(p.modifierGroups).map((g)=><div className="ws-modifier-box" key={String(g.id)}><small>{label(g)}{g.required?" · Required":""}</small>{list(g.options).filter((o)=>o.available!==false).map((o)=><label className="ws-check-row" key={String(o.id)}><input type="checkbox" checked={Number(item.modifiers[String(o.id)]||0)>0} onChange={(e)=>setCart({...cart,[key]:{...item,modifiers:{...item.modifiers,[String(o.id)]:e.target.checked?1:0}}})}/><span>{label(o)}{Number(o.additionalPrice||0)? " (+"+asMoney(o.additionalPrice,String(publicMenu.currency||"MMK"))+")":""}</span></label>)}</div>)}{field("Special instruction",<input value={item.specialInstruction} onChange={(e)=>setCart({...cart,[key]:{...item,specialInstruction:e.target.value}})} placeholder="Optional"/>) }<div className="ws-store-add"><div className="ws-quantity"><button type="button" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.max(0,item.quantity-1)}})}>−</button><b>{item.quantity}</b><button type="button" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.min(99,item.quantity+1)}})}>＋</button></div><button className="ws-btn ws-btn-primary" onClick={()=>setCart({...cart,[key]:{...item,quantity:Math.max(1,item.quantity)}})}>Add</button></div></div></article>})}</div></section>)}{!categories.length&&empty("No public menu returned.")}</div>
          <aside className="ws-card ws-cart"><h3>Delivery cart</h3><p>{activeCartItems.reduce((n,[,item])=>n+item.quantity,0)} items · estimated subtotal</p>{activeCartItems.map(([id,item])=><div className="ws-cart-row" key={id}><div><b>{label(list(publicMenu.categories).flatMap((c)=>list(c.products)).find((p)=>String(p.id)===id)||{})}</b><small>Qty {item.quantity}</small></div></div>)}<div className="ws-cart-total"><span>Total estimate</span><strong>{asMoney(cartTotal,String(publicMenu.currency||"MMK"))}</strong></div>{field("Saved address",<select value={checkout.addressId} onChange={(e)=>setCheckout({...checkout,addressId:e.target.value})}><option value="">Choose address</option>{addresses.map((a)=><option key={String(a.id)} value={String(a.id)}>{label(a)} · {String(a.city||"")}</option>)}</select>)}{field("Delivery zone",<select value={checkout.zoneId} onChange={(e)=>setCheckout({...checkout,zoneId:e.target.value})}><option value="">Choose zone</option>{customerZones.map((z)=><option key={String(z.id)} value={String(z.id)}>{label(z)} · {asMoney(z.deliveryFee,String(publicMenu.currency||"MMK"))}</option>)}</select>)}{field("Recipient name",<input value={checkout.recipientName} onChange={(e)=>setCheckout({...checkout,recipientName:e.target.value})}/>)}{field("Recipient phone",<input value={checkout.recipientPhone} onChange={(e)=>setCheckout({...checkout,recipientPhone:e.target.value})}/>)}<button className="ws-btn ws-btn-primary ws-btn-block" disabled={!activeCartItems.length||busy} onClick={()=>void placeDeliveryOrder()}>Place cash-on-delivery order</button><button className="ws-link-btn" onClick={()=>changeView("addresses")}>Manage addresses ↗</button></aside></div>
      </>;
    }

    if (view === "profile") return <>
      {intro("My customer profile","Profile ownership is determined by the authenticated JWT subject. The avatar is stored privately and its signed URL expires.")}
      <section className="ws-card"><div className="ws-profile-header">{data.avatarUrl?<img src={String(data.avatarUrl)} alt="Profile"/>:<span>{String(profileForm.fullName||"C").slice(0,1).toUpperCase()}</span>}<div><h3>{String(data.fullName||"Customer")}</h3><p>{String(data.email||"")}</p><label className="ws-upload-btn">Upload avatar<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>{const f=e.target.files?.[0];if(f){const form=new FormData();form.append("file",f);void act(()=>call("/api/v1/customer/profile/avatar","POST",form),"Avatar updated.","profile");}}}/></label></div></div><form className="ws-form-grid" onSubmit={saveProfile}>{field("Full name",<input value={profileForm.fullName} onChange={(e)=>setProfileForm({...profileForm,fullName:e.target.value})} required/>)}{field("Phone",<input value={profileForm.phone} onChange={(e)=>setProfileForm({...profileForm,phone:e.target.value})}/>)}{field("Preferred language",<select value={profileForm.preferredLanguage} onChange={(e)=>setProfileForm({...profileForm,preferredLanguage:e.target.value})}><option value="en">English</option><option value="my-MM">မြန်မာ</option></select>)}<button className="ws-btn ws-btn-primary">Save profile</button></form></section>
    </>;

    if (view === "addresses") return <>
      {intro("Saved delivery addresses","Use city and township consistently with delivery-zone coverage settings.")}
      <section className="ws-card"><h3>Add address</h3><form className="ws-form-grid" onSubmit={createAddress}>{[["label","Label"],["recipientName","Recipient"],["houseNo","House / building"],["street","Street"],["ward","Ward"],["township","Township"],["city","City"],["deliveryNote","Delivery note"]].map(([key,name])=>field(name,<input value={addressForm[key as keyof typeof addressForm] as string} onChange={(e)=>setAddressForm({...addressForm,[key]:e.target.value})} required={["label","recipientName","houseNo","street","township","city"].includes(key)}/>))}<label className="ws-check-row"><input type="checkbox" checked={addressForm.makeDefault} onChange={(e)=>setAddressForm({...addressForm,makeDefault:e.target.checked})}/> Make default</label><button className="ws-btn ws-btn-primary">Save address</button></form></section>
      <div className="ws-record-list">{addresses.map((a)=><article className="ws-record" key={String(a.id)}><div className="ws-record-main"><b>{label(a)} {a.isDefault?" · Default":""}</b><p>{[a.houseNo,a.street,a.ward,a.township,a.city].filter(Boolean).join(", ")}</p><small>{String(a.deliveryNote||"")}</small></div><div className="ws-record-actions">{editorButton("Edit address","/api/v1/customer/addresses/"+encodeURIComponent(String(a.id)),a)}{!a.isDefault&&<button className="ws-btn ws-btn-soft" onClick={()=>act(()=>call("/api/v1/customer/addresses/"+encodeURIComponent(String(a.id))+"/default","PATCH"),"Default address changed.")}>Make default</button>}<button className="ws-btn ws-btn-danger" onClick={()=>window.confirm("Delete this address?")&&void act(()=>call("/api/v1/customer/addresses/"+encodeURIComponent(String(a.id)),"DELETE"),"Address deleted.")}>Delete</button></div></article>)}</div>{!addresses.length&&empty("Save an address before placing a delivery order.")}
    </>;

    if (view === "my-orders") return <>
      {intro("My orders","View your order history. You can cancel only pending orders and reorder eligible delivery orders using current addresses and zones.")}
      <div className="ws-toolbar"><button className="ws-btn ws-btn-muted" onClick={()=>loadView("my-orders")}>Refresh history</button><button className="ws-btn ws-btn-primary" onClick={()=>changeView("storefront")}>Browse delivery menu</button></div><div className="ws-record-list">{customerOrders.map((o)=><article className="ws-record" key={String(o.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{label(o)}</b><span className="ws-status">{String(o.status||"")}</span></div><p>{String(o.orderType||"")} · {o.createdAt?new Date(o.createdAt).toLocaleString():""}</p><strong>{asMoney(o.totalAmount,String(o.currency||"MMK"))}</strong></div><div className="ws-record-actions"><button className="ws-btn ws-btn-muted" onClick={()=>{setSelectedOrder(o);setResponseData(o);}}>Details</button>{o.status==="PENDING"&&<button className="ws-btn ws-btn-danger" onClick={()=>window.confirm("Cancel this pending order?")&&void act(()=>call("/api/v1/customer/orders/"+encodeURIComponent(String(o.id))+"/cancel","POST",{}),"Order cancelled.")}>Cancel</button>}{o.orderType==="DELIVERY"&&["COMPLETED","CANCELLED"].includes(String(o.status))&&<button className="ws-btn ws-btn-soft" onClick={()=>{setApiTool({method:"POST",path:"/api/v1/customer/orders/"+encodeURIComponent(String(o.id))+"/reorder",body:JSON.stringify({addressId:addresses.find((a)=>a.isDefault)?.id||"",deliveryZoneId:customerZones[0]?.id||"",paymentMethod:"CASH_ON_DELIVERY"},null,2)});setView("api");}}>Reorder</button>}</div></article>)}</div>{!customerOrders.length&&empty("Your orders appear here after checkout.")}
    </>;

    if (view === "notifications") return <>
      {intro("Notifications","The backend stores in-app notifications. Browser push delivery and sound playback need a configured push provider on the client.")}
      <button className="ws-btn ws-btn-muted" onClick={()=>loadView("notifications")}>Refresh inbox</button><div className="ws-record-list">{notifications.map((n)=><article className="ws-record" key={String(n.id)}><div className="ws-record-main"><div className="ws-record-title"><b>{String(n.title||n.notificationType||"Notification")}</b><span className="ws-status">{String(n.status||"")}</span></div><p>{String(n.body||"")}</p><small>{String(n.createdAt||"")}</small></div>{n.status!=="READ"&&<button className="ws-btn ws-btn-primary" onClick={()=>void act(()=>call("/api/v1/notifications/"+encodeURIComponent(String(n.id))+"/read","PATCH"),"Notification marked read.")}>Mark read</button>}</article>)}</div>{!notifications.length&&empty("No notifications found.")}
    </>;

    if (view === "devices") return <>
      {intro("Push devices","Registered device metadata only. Device registration needs a push token from a configured SDK; raw tokens are never returned in list responses.")}
      <div className="ws-record-list">{devices.map((d)=><article className="ws-record" key={String(d.id)}><div className="ws-record-main"><b>{String(d.platform||"Device")}</b><small>{String(d.deviceName||d.createdAt||"")}</small><span className="ws-status">{d.active===false?"Inactive":"Active"}</span></div>{d.active!==false&&<button className="ws-btn ws-btn-danger" onClick={()=>void act(()=>call("/api/v1/devices/"+encodeURIComponent(String(d.id)),"DELETE"),"Device deactivated.")}>Deactivate</button>}</article>)}</div>{!devices.length&&empty("No registered devices.")}
    </>;

    if (view === "queue-track") return <>
      {intro("Customer queue tracker","Enter the ticket ID and tracking token provided at Common QR checkout. Requests use the X-Queue-Token header.")}
      <section className="ws-card"><form className="ws-form-grid" onSubmit={trackQueue}>{field("Queue ticket ID",<input value={ticket.id} onChange={(e)=>setTicket({...ticket,id:e.target.value})} required/>)}{field("Tracking token",<input value={ticket.token} onChange={(e)=>setTicket({...ticket,token:e.target.value})} required/>)}<button className="ws-btn ws-btn-primary" disabled={busy}>Track ticket</button></form></section>{Object.keys(tracking).length>0&&<section className="ws-card ws-tracking-status"><span className="ws-eyebrow">CURRENT QUEUE STATUS</span><strong>{String(tracking.displayCode||tracking.queueNumber||"—")}</strong><span className="ws-status">{String(tracking.queueStatus||"")}</span><p>Order {String(tracking.orderNumber||"")} · {String(tracking.orderStatus||"")}</p><div className="ws-record-list">{trackingNotifications.map((n)=><div className="ws-list-row" key={String(n.id)}><div><b>{String(n.title||"")}</b><small>{String(n.body||"")}</small></div></div>)}</div></section>}
    </>;

    if (view === "api") return <>
      {intro("API workbench","Execute other documented backend routes from a structured request editor. Bearer authentication is included automatically for private routes; public routes do not require it.")}
      <section className="ws-card"><form className="ws-form-grid" onSubmit={submitApi}>{field("HTTP method",<select value={apiTool.method} onChange={(e)=>setApiTool({...apiTool,method:e.target.value})}>{["GET","POST","PUT","PATCH","DELETE"].map((m)=><option key={m}>{m}</option>)}</select>)}{field("Path",<input value={apiTool.path} onChange={(e)=>setApiTool({...apiTool,path:e.target.value})} required/>,true)}{["POST","PUT","PATCH"].includes(apiTool.method)&&field("JSON body",<textarea rows={8} value={apiTool.body} onChange={(e)=>setApiTool({...apiTool,body:e.target.value})} spellCheck={false}/>,true)}<button className="ws-btn ws-btn-primary" disabled={busy}>Send request</button></form></section>
      {responseData!==null&&<section className="ws-card"><div className="ws-card-heading"><h3>Last response</h3><button className="ws-btn ws-btn-muted" onClick={()=>setResponseData(null)}>Clear</button></div><pre className="ws-json-preview">{JSON.stringify(responseData,null,2)}</pre></section>}
      <section className="ws-card"><h3>Common API shortcuts</h3><div className="ws-endpoint-grid">{[["My restaurants","GET","/api/v1/my/restaurants"],["Public menu","GET","/api/v1/public/restaurants/"+restaurantId+"/menu"],["Order payments","GET",restaurantPath("orders/{orderId}/payments")],["Default driver","GET",restaurantPath("delivery-settings/default-driver")],["Customer addresses","GET","/api/v1/customer/addresses"],["Device registration","POST","/api/v1/devices"],["Settings","GET",restaurantPath("settings")],["Modifier groups","GET",restaurantPath("modifier-groups")],["Order history","GET","/api/v1/customer/orders?page=0&size=20"]].map(([name,method,path])=><button className="ws-endpoint" key={name} onClick={()=>setApiTool({method,path,body:"{}"})}><small>{method}</small><b>{name}</b><code>{path}</code></button>)}</div></section>
    </>;

    return <>
      {intro("Create your restaurant","Create the first restaurant using the current authenticated user as OWNER. This action creates the initial settings and membership in one transaction.")}
      <section className="ws-card"><form className="ws-form-grid" onSubmit={createRestaurant}>{field("Restaurant name",<input value={restaurantName==="Your restaurant"?"":restaurantName} onChange={(e)=>setRestaurantName(e.target.value)} required/>)}<p className="ws-muted">Default settings are MMK and Asia/Yangon. Add full details from Restaurant profile after setup.</p><button className="ws-btn ws-btn-primary">Create restaurant</button></form></section>
    </>;
  }

  return <main className="ws-shell">
    <aside className="ws-sidebar"><Link className="ws-brand" href="/"><span className="ws-brand-mark">R</span><span>Restaurant<span>Platform</span></span></Link><div className="ws-restaurant-switch"><small>WORKING RESTAURANT</small><select value={restaurantId} onChange={(e)=>{const m=memberships.find((item)=>item.id===e.target.value);setRestaurantId(e.target.value);if(m){setRestaurantName(m.name);setRole(m.role);void loadView(view,e.target.value);}}}><option value="">Choose restaurant</option>{memberships.map((m)=><option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}</select></div><nav className="ws-nav">{nav()}</nav><div className="ws-sidebar-bottom"><span className="ws-online-dot"/>{connected?"API session connected":"Connect to begin"}<p>Token stays in memory only. Access controls remain on the backend.</p><Link href="/">← Existing QR / operations page</Link></div></aside>
    <section className="ws-main"><header className="ws-topbar"><div><div className="ws-eyebrow">RESPONSIVE WORKSPACE / {role||"ACCOUNT"}</div><h1>{title}</h1><p>{restaurantName}</p></div><div className="ws-header-actions"><span className="ws-role-pill">{role||"No role"}</span><button className="ws-btn ws-btn-muted" disabled={loading||!connected} onClick={()=>void loadView(view)}>↻ Refresh</button></div></header>
      <section className="ws-connection"><div className="ws-connection-title"><div><b>{connected?"Backend connection":"Connect your account"}</b><p>Paste a Supabase Auth access token. No password is collected and the token is not saved to local storage.</p></div><span className={"ws-status "+(connected?"ws-completed":"ws-neutral")}>{connected?"Connected":"Disconnected"}</span></div><form className="ws-connection-form" onSubmit={connect}>{field("Backend API URL",<input value={apiUrl} onChange={(e)=>setApiUrl(e.target.value)} placeholder="http://localhost:8080" required/>)}{field("Supabase access token",<span className="ws-token-input"><input type={showToken?"text":"password"} value={token} onChange={(e)=>setToken(e.target.value)} placeholder="Paste access_token" autoComplete="off" required/><button type="button" onClick={()=>setShowToken(!showToken)}>{showToken?"Hide":"Show"}</button></span>)}<button className="ws-btn ws-btn-primary" disabled={busy}>{busy?"Connecting…":connected?"Reconnect / refresh":"Connect account"}</button></form>{memberships.length>0&&<div className="ws-membership-list">Restaurants: {memberships.map((m)=><button className="ws-chip" key={m.id} onClick={()=>{setRestaurantId(m.id);setRestaurantName(m.name);setRole(m.role);void loadView(view,m.id);}}>{m.name} · {m.role}</button>)}</div>}</section>
      {error&&<div className="ws-alert ws-alert-error" role="alert"><b>Request failed</b><span>{error}</span><button onClick={()=>setError("")}>×</button></div>}{notice&&<div className="ws-alert ws-alert-success" role="status"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}
      {oneTimeSecret&&<div className="ws-secret-panel"><div><b>One-time token</b><p>Copy and store this safely now. The backend will not return it again.</p><code>{oneTimeSecret}</code></div><button className="ws-btn ws-btn-muted" onClick={()=>{void navigator.clipboard?.writeText(oneTimeSecret);ok("Copied if clipboard permissions allow it.");}}>Copy</button><button className="ws-btn ws-btn-muted" onClick={()=>setOneTimeSecret("")}>Dismiss</button></div>}
      {!connected?<div className="ws-empty-connect"><div className="ws-empty-icon">↔</div><h2>Connect to begin</h2><p>Enter your API URL and Supabase access token above. Your memberships and roles are loaded from the backend.</p><button className="ws-btn ws-btn-primary" onClick={()=>setView("create")}>Create a restaurant</button></div>:<div className={"ws-content "+(loading?"ws-is-loading":"")}>{loading&&<div className="ws-loading-line">Loading latest data…</div>}{workspaceContent()}</div>}
      <footer className="ws-footer"><span>Restaurant Platform</span><span>Desktop · tablet · mobile</span><span>Backend-authorized actions</span></footer>
    </section>
    {draft&&<div className="ws-modal-backdrop" onClick={()=>setDraft(null)}><section className="ws-modal" role="dialog" aria-modal="true" aria-label={draft.title} onClick={(e)=>e.stopPropagation()}><div className="ws-modal-heading"><div><span className="ws-eyebrow">EDIT RECORD</span><h2>{draft.title}</h2><p>Review the fields before saving. The backend validates the final request.</p></div><button className="ws-modal-close" onClick={()=>setDraft(null)}>×</button></div><form onSubmit={saveDraft}><textarea className="ws-code-editor" rows={18} value={draft.body} onChange={(e)=>setDraft({...draft,body:e.target.value})} spellCheck={false}/><div className="ws-modal-actions"><button type="button" className="ws-btn ws-btn-muted" onClick={()=>setDraft(null)}>Cancel</button><button className="ws-btn ws-btn-primary" disabled={busy}>Save changes</button></div></form></section></div>}
    {selectedOrder&&<div className="ws-modal-backdrop" onClick={()=>setSelectedOrder(null)}><section className="ws-modal" role="dialog" aria-modal="true" aria-label="Order details" onClick={(e)=>e.stopPropagation()}><div className="ws-modal-heading"><div><span className="ws-eyebrow">ORDER DETAILS</span><h2>{label(selectedOrder)}</h2></div><button className="ws-modal-close" onClick={()=>setSelectedOrder(null)}>×</button></div><pre className="ws-json-preview">{JSON.stringify(selectedOrder,null,2)}</pre><button className="ws-btn ws-btn-primary" onClick={()=>setSelectedOrder(null)}>Close</button></section></div>}
  </main>;
}

function nextStates(status: string, type: string): string[] {
  if (status==="PENDING") return ["ACCEPTED","CANCELLED"];
  if (status==="ACCEPTED") return ["PREPARING","CANCELLED"];
  if (status==="PREPARING") return ["READY","CANCELLED"];
  if (status==="READY") return type==="DELIVERY"?["OUT_FOR_DELIVERY"]:["COMPLETED"];
  if (status==="OUT_FOR_DELIVERY") return ["COMPLETED"];
  return [];
}
function nextDeliveryStates(status: string): string[] {
  if (status==="ASSIGNED") return ["PICKED_UP","CANCELLED"];
  if (status==="PICKED_UP") return ["DELIVERED","FAILED"];
  if (status==="FAILED") return ["ASSIGNED"];
  if (status==="WAITING_ASSIGNMENT") return ["ASSIGNED"];
  return [];
}
