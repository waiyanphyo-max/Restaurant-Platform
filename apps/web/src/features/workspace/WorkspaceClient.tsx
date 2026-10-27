"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/features/auth/AuthProvider";
import AccountMenu from "@/features/auth/AccountMenu";
import { apiRequest } from "@/lib/api-request";
import type { View, Row, Membership } from "@/types/workspace";
import { rid, record, list, label, asMoney, messageOf, nextStates, nextDeliveryStates } from "@/features/workspace/utils";
import WorkspaceNavigation from "@/components/layout/WorkspaceNavigation";
import { SectionIntro, EmptyState, FormField } from "@/components/shared/WorkspacePrimitives";
import { WorkspaceProvider, type WorkspaceViewContext } from "@/features/workspace/WorkspaceContext";
import WorkspaceViews from "@/features/workspace/WorkspaceViews";

export default function WorkspaceClient() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8080";
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
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Row[]>>({});
  const [linkedGroupsByProduct, setLinkedGroupsByProduct] = useState<Record<string, Row[]>>({});
  const [groupsList, setGroupsList] = useState<Row[]>([]);
  const [linkForm, setLinkForm] = useState({ productId: "", groupId: "" });
  const [defaultDriver, setDefaultDriver] = useState("");
  const [payments, setPayments] = useState<Row[]>([]);
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [tables, setTables] = useState<Row[]>([]);
  const [zones, setZones] = useState<Row[]>([]);
  const [members, setMembers] = useState<Row[]>([]);
  const [addresses, setAddresses] = useState<Row[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Row[]>([]);
  const [customerZones, setCustomerZones] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [deviceForm, setDeviceForm] = useState({ pushToken: "", platform: "WEB" });
  const [publicMenu, setPublicMenu] = useState<Row>({});
  const [tableQrToken, setTableQrToken] = useState("");
  const [tableQrResult, setTableQrResult] = useState<Row>({});
  const [tableIdempotencyKey, setTableIdempotencyKey] = useState("");
  const [report, setReport] = useState<Row>({});
  const [search, setSearch] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<{ title: string; path: string; method: string; body: string } | null>(null);
  const [apiTool, setApiTool] = useState({ method: "GET", path: "/api/v1/my/restaurants", body: "{}" });
  const [responseData, setResponseData] = useState<unknown>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState("");
  const [oneTimeQrLink, setOneTimeQrLink] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryOrder, setCategoryOrder] = useState("0");
  const [productForm, setProductForm] = useState({ name: "", description: "", categoryId: "", price: "0", available: true, trackStock: false, stockQuantity: "0" });
  const [variantForm, setVariantForm] = useState({ productId: "", name: "", price: "0" });
  const [groupForm, setGroupForm] = useState({ name: "", required: false, minSelections: "0", maxSelections: "1" });
  const [optionForm, setOptionForm] = useState({ groupId: "", name: "", additionalPrice: "0" });
  const [tableNumber, setTableNumber] = useState("");
  const [zoneForm, setZoneForm] = useState({ name: "", deliveryFee: "0", minimumOrder: "0", active: true, coverageCity: "", coverageTownship: "" });
  const [inviteForm, setInviteForm] = useState({ email: "", fullName: "", role: "STAFF" });
  const [existingMemberForm, setExistingMemberForm] = useState({ userId: "", role: "STAFF" });
  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "", preferredLanguage: "en" });
  const [addressForm, setAddressForm] = useState({ label: "Home", recipientName: "", houseNo: "", street: "", ward: "", township: "", city: "", deliveryNote: "", makeDefault: true });
  const [driverInput, setDriverInput] = useState("");
  const [restaurantCreate, setRestaurantCreate] = useState({ name: "", slug: "", description: "", phone: "", address: "", houseNo: "", street: "", ward: "", township: "", city: "", currency: "MMK", timezone: "Asia/Yangon" });
  const [cart, setCart] = useState<Record<string, { quantity: number; variantId: string; specialInstruction: string; modifiers: Record<string, number> }>>({});
  const [checkout, setCheckout] = useState({ addressId: "", zoneId: "", recipientName: "", recipientPhone: "" });
  const [ticket, setTicket] = useState({ id: "", token: "" });
  const [tracking, setTracking] = useState<Row>({});
  const [trackingNotifications, setTrackingNotifications] = useState<Row[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null);

  async function call<T = unknown>(path: string, method = "GET", body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const base = apiUrl.trim().replace(/\/+$/, "");
    if (!base) throw new Error("Enter the backend API URL.");
    const isPublic = path.startsWith("/api/v1/public/");
    const headers: Record<string, string> = { Accept: "application/json" };
    Object.entries(extraHeaders).forEach(([name, value]) => { headers[name] = value; });
    let requestBody: BodyInit | undefined;
    if (body instanceof FormData) requestBody = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
    return apiRequest<T>(base + (path.startsWith("/") ? path : "/" + path), {
      method,
      headers,
      body: requestBody,
    }, { auth: isPublic ? "public" : "required" });
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
          const productRows = list(res[1]);
          setCategories(list(res[0])); setProducts(productRows); setGroupsList(list(res[2]));
          const [variantResults, groupResults] = await Promise.all([
            Promise.allSettled(productRows.map((product) => call(restaurantPath("products/" + encodeURIComponent(String(product.id)) + "/variants")))),
            Promise.allSettled(productRows.map((product) => call(restaurantPath("products/" + encodeURIComponent(String(product.id)) + "/modifier-groups")))),
          ]);
          const variantMap: Record<string, Row[]> = {};
          const linkMap: Record<string, Row[]> = {};
          variantResults.forEach((result, index) => { if (result.status === "fulfilled") variantMap[String(productRows[index].id)] = list(result.value); });
          groupResults.forEach((result, index) => { if (result.status === "fulfilled") linkMap[String(productRows[index].id)] = list(result.value); });
          setVariantsByProduct(variantMap); setLinkedGroupsByProduct(linkMap);
          break;
        }
        case "tables": setTables(list(await call(restaurantPath("tables")))); break;
        case "settings": {
          const results = await Promise.allSettled([call(restaurantPath("settings")), call(restaurantPath("delivery-settings/default-driver"))]);
          if (results[0].status === "fulfilled") setData(record(results[0].value));
          if (results[1].status === "fulfilled") { const driver = String(record(results[1].value).defaultDriverUserId || ""); setDefaultDriver(driver); setDriverInput(driver); }
          if (results[0].status === "rejected") throw results[0].reason;
          break;
        }
        case "zones": setZones(list(await call(restaurantPath("delivery-zones")))); break;
        case "members": setMembers(list(await call(restaurantPath("members")))); break;
        case "restaurant": setData(record(await call("/api/v1/restaurants/" + encodeURIComponent(id)))); break;
        case "reports": setReport(record(await call(restaurantPath("reports/daily") + "?date=" + reportDate))); break;
        case "staff-order": {
          const res = await Promise.all([call(restaurantPath("products")), call(restaurantPath("tables"))]);
          setProducts(list(res[0])); setTables(list(res[1])); break;
        }
        case "table-order": setPublicMenu(record(await call("/api/v1/public/restaurants/" + encodeURIComponent(id) + "/menu"))); break;
        case "storefront": {
          const res = await Promise.allSettled([
            call("/api/v1/public/restaurants/" + encodeURIComponent(id) + "/menu"),
            call("/api/v1/customer/restaurants/" + encodeURIComponent(id) + "/delivery-zones"),
            call("/api/v1/customer/addresses"),
            call("/api/v1/customer/profile"),
          ]);
          if (res[0].status === "fulfilled") setPublicMenu(record(res[0].value)); else throw res[0].reason;
          if (res[1].status === "fulfilled") setCustomerZones(list(res[1].value));
          if (res[2].status === "fulfilled") setAddresses(list(res[2].value));
          if (res[3].status === "fulfilled") { const profile = record(res[3].value); setData(profile); setCheckout((old) => ({ ...old, recipientName: old.recipientName || String(profile.fullName || ""), recipientPhone: old.recipientPhone || String(profile.phone || "") })); }
          break;
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
    setView(next); setSearch(""); setOneTimeSecret(""); setOneTimeQrLink("");
    if (next !== "api" && next !== "queue-track" && next !== "create") void loadView(next);
  }

  async function connect(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!user) {
      setBusy(false);
      router.push(`/login?next=${encodeURIComponent("/workspace")}`);
      return;
    }
    try {
      const result = list(await call("/api/v1/my/restaurants"));
      const loaded = result.map((row) => {
        const r = record(row.restaurant);
        return { id: String(row.restaurantId || r.id || row.id || ""), name: String(row.restaurantName || r.name || row.name || "Restaurant"), role: String(row.role || row.membershipRole || "UNKNOWN") };
      }).filter((item) => item.id);
      setMemberships(loaded); setConnected(true);
      if (!loaded.length) { setRole("CUSTOMER"); setView("profile"); ok("No restaurant membership was found. Customer account screens are available. Enter a Restaurant UUID in the connection panel to open its storefront; use Create restaurant only if you are setting up a business."); await loadView("profile"); return; }
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
    // Build request DTOs from response DTOs explicitly. Sending response-only fields
    // (for example options, isDefault, slug, or createdAt) can fail strict API validation.
    let body: Row;
    switch (title) {
      case "Edit category":
        body = { name: row.name, displayOrder: row.displayOrder, active: row.active };
        break;
      case "Edit product":
        body = { categoryId: row.categoryId, name: row.name, description: row.description, price: row.price, imageUrl: row.imageUrl ?? null, trackStock: row.trackStock, stockQuantity: row.stockQuantity ?? null, available: row.available };
        break;
      case "Edit variant":
        body = { name: row.name, price: row.price, imageUrl: row.imageUrl ?? null, available: row.available };
        break;
      case "Edit modifier group":
        body = { name: row.name, required: row.required, minSelections: row.minSelections, maxSelections: row.maxSelections, active: row.active };
        break;
      case "Edit modifier option":
        body = { name: row.name, additionalPrice: row.additionalPrice, available: row.available };
        break;
      case "Edit delivery zone":
        body = { name: row.name, deliveryFee: row.deliveryFee, minimumOrder: row.minimumOrder, active: row.active, coverageCity: row.coverageCity ?? null, coverageTownship: row.coverageTownship ?? null };
        break;
      case "Edit table":
        body = { tableNumber: row.tableNumber, active: row.active };
        break;
      case "Edit address":
      case "Edit saved address":
        body = { label: row.label, recipientName: row.recipientName ?? null, houseNo: row.houseNo ?? null, street: row.street ?? null, ward: row.ward ?? null, township: row.township, city: row.city, latitude: row.latitude ?? null, longitude: row.longitude ?? null, deliveryNote: row.deliveryNote ?? null, makeDefault: Boolean(row.isDefault) };
        break;
      case "Edit restaurant settings":
        body = { currency: row.currency, timezone: row.timezone, minimumOrder: row.minimumOrder, defaultDeliveryFee: row.defaultDeliveryFee, acceptsOrders: row.acceptsOrders, allowQrOrder: row.allowQrOrder, allowDelivery: row.allowDelivery, allowTakeaway: row.allowTakeaway };
        break;
      case "Edit profile":
        body = { name: row.name, description: row.description ?? null, phone: row.phone ?? null, address: row.address ?? null, houseNo: row.houseNo ?? null, street: row.street ?? null, ward: row.ward ?? null, township: row.township, city: row.city, latitude: row.latitude ?? null, longitude: row.longitude ?? null, logoUrl: row.logoUrl ?? null };
        break;
      default: {
        const ignored = ["id","restaurantId","userId","createdAt","updatedAt","variants","modifierGroups","options","avatarUrl","signedAvatarUrl","slug","active","defaultDeliveryDriverUserId","isDefault"];
        body = Object.fromEntries(Object.entries(row).filter(([key]) => !ignored.includes(key)));
      }
    }
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
    const result = await act(() => call(restaurantPath("tables"), "POST", { tableNumber: tableNumber.trim(), active: true }), "Table created. Scan or print the generated QR code.", "tables");
    const obj = record(result);
    const secret = String(obj.qrToken || obj.token || obj.rawToken || "");
    setOneTimeSecret(secret);
    setOneTimeQrLink(secret ? window.location.origin + "/workspace?view=table-order&restaurantId=" + encodeURIComponent(restaurantId) + "#qrToken=" + encodeURIComponent(secret) : "");
    setTableNumber("");
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
  async function addExistingMember(event: FormEvent) {
    event.preventDefault();
    await act(() => call(restaurantPath("members"), "POST", existingMemberForm), "Existing profile added to this restaurant.", "members");
    setExistingMemberForm({ userId: "", role: "STAFF" });
  }
  async function registerDevice(event: FormEvent) {
    event.preventDefault();
    await act(() => call("/api/v1/devices", "POST", deviceForm), "Push device registered.", "devices");
    setDeviceForm({ pushToken: "", platform: "WEB" });
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
  async function showPayments(order: Row) {
    const id = String(order.id || "");
    try {
      const result = await call(restaurantPath("orders/" + encodeURIComponent(id) + "/payments"));
      setPayments(list(result)); setPaymentOrderId(id); setResponseData(result); setError("");
    } catch (cause) { fail(cause); }
  }
  async function collectPayment(orderId: string, paymentId: string) {
    await act(() => call(restaurantPath("orders/" + encodeURIComponent(orderId) + "/payments/" + encodeURIComponent(paymentId) + "/collect"), "PATCH"), "Counter payment collected.");
    try { setPayments(list(await call(restaurantPath("orders/" + encodeURIComponent(orderId) + "/payments")))); setPaymentOrderId(orderId); } catch (cause) { fail(cause); }
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
    const obj = record(result);
    const secret = String(obj.qrToken || obj.token || obj.commonQrToken || obj.rawToken || "");
    setOneTimeSecret(secret);
    const tableQr = path.startsWith("tables/") && path.endsWith("/qr-token/rotate");
    setOneTimeQrLink(!secret ? "" : tableQr
      ? window.location.origin + "/workspace?view=table-order&restaurantId=" + encodeURIComponent(restaurantId) + "#qrToken=" + encodeURIComponent(secret)
      : window.location.origin + "/?view=customer-pickup&restaurantId=" + encodeURIComponent(restaurantId) + "#qrToken=" + encodeURIComponent(secret));
  }
  async function loadTableMenu(event: FormEvent) {
    event.preventDefault();
    if (!restaurantId.trim()) { setError("Enter the restaurant UUID shown in the Table QR link."); return; }
    try { setPublicMenu(record(await call("/api/v1/public/restaurants/" + encodeURIComponent(restaurantId) + "/menu"))); setError(""); ok("Public menu loaded. Enter the table QR token and add your items."); }
    catch (cause) { fail(cause); }
  }
  async function placeTableQrOrder() {
    const items = Object.entries(cart).filter(([,item])=>item.quantity>0).map(([productId,item])=>({productId,variantId:item.variantId||null,quantity:item.quantity,specialInstruction:item.specialInstruction.trim()||null,modifiers:Object.entries(item.modifiers).filter(([,quantity])=>quantity>0).map(([modifierOptionId,quantity])=>({modifierOptionId,quantity}))}));
    if (!restaurantId.trim() || !tableQrToken.trim()) { setError("Enter both the restaurant UUID and table QR token."); return; }
    if (!items.length) { setError("Add at least one item to the cart."); return; }
    const idempotencyKey = tableIdempotencyKey || crypto.randomUUID();
    setTableIdempotencyKey(idempotencyKey);
    const result = await act(() => call("/api/v1/public/restaurants/" + encodeURIComponent(restaurantId) + "/orders/table-qr", "POST", { qrToken: tableQrToken.trim(), items }, { "Idempotency-Key": idempotencyKey }), "Your table order was submitted.", "table-order");
    if (result) { setTableQrResult(record(result)); setCart({}); setTableIdempotencyKey(""); }
  }
  async function reorderOrder(order: Row) {
    try {
      const addrRows = addresses.length ? addresses : list(await call("/api/v1/customer/addresses"));
      setAddresses(addrRows);
      if (!addrRows.length) { setError("Add a saved address before reordering."); setView("addresses"); return; }
      const restaurantForOrder = String(order.restaurantId || restaurantId);
      const zoneRows = list(await call("/api/v1/customer/restaurants/" + encodeURIComponent(restaurantForOrder) + "/delivery-zones"));
      setCustomerZones(zoneRows);
      if (!zoneRows.length) { setError("No active delivery zones are available for this restaurant."); return; }
      const addressChoices = addrRows.map((a,i)=>(i+1)+". "+label(a)+" — "+[a.houseNo,a.street,a.township,a.city].filter(Boolean).join(", ")).join("\n");
      const addressNo = Number(window.prompt("Choose the saved address number:\n"+addressChoices, String(Math.max(1,addrRows.findIndex((a)=>a.isDefault)+1))));
      const address = addrRows[addressNo-1];
      if (!address) return;
      const zoneChoices = zoneRows.map((z,i)=>(i+1)+". "+label(z)+" — fee "+asMoney(z.deliveryFee,String(data.currency||"MMK"))).join("\n");
      const zoneNo = Number(window.prompt("Choose the delivery zone number:\n"+zoneChoices, "1"));
      const zone = zoneRows[zoneNo-1];
      if (!zone) return;
      await act(() => call("/api/v1/customer/orders/"+encodeURIComponent(String(order.id))+"/reorder","POST",{addressId:address.id,deliveryZoneId:zone.id,paymentMethod:"CASH_ON_DELIVERY"}),"A new delivery order was placed from your previous order.","my-orders");
    } catch (cause) { fail(cause); }
  }
  async function trackQueue(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const headers = { "X-Queue-Token": ticket.token.trim() };
      const [status, notifications] = await Promise.all([
        call("/api/v1/public/queue-tickets/" + encodeURIComponent(ticket.id) + "/status", "GET", undefined, headers),
        call("/api/v1/public/queue-tickets/" + encodeURIComponent(ticket.id) + "/notifications", "GET", undefined, headers),
      ]);
      setTracking(record(status)); setTrackingNotifications(list(notifications)); ok("Queue status refreshed.");
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
    const name = restaurantCreate.name.trim();
    const slug = (restaurantCreate.slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    const result = await act(() => call("/api/v1/restaurants", "POST", { ...restaurantCreate, name, slug, latitude: null, longitude: null, logoUrl: null }), "Restaurant created; reconnect to load the new OWNER membership.", "create");
    const payload = record(result);
    const secret = String(payload.commonQrToken || "");
    const newId = String(payload.restaurantId || payload.id || restaurantId);
    if (newId) setRestaurantId(newId);
    setOneTimeSecret(secret);
    setOneTimeQrLink(secret ? window.location.origin + "/?view=customer-pickup&restaurantId=" + encodeURIComponent(newId) + "#qrToken=" + encodeURIComponent(secret) : "");
    await connect();
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("restaurantId") || "";
    if (id) setRestaurantId(id);
    if (params.get("view") !== "table-order") return;
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const qrToken = fragment.get("qrToken") || "";
    setView("table-order");
    if (id) {
      setRestaurantId(id);
      void call("/api/v1/public/restaurants/" + encodeURIComponent(id) + "/menu")
        .then((result) => setPublicMenu(record(result)))
        .catch((cause) => fail(cause, "Could not load the table menu."));
    }
    if (qrToken) setTableQrToken(qrToken);
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titles: Record<View, string> = { overview: "Overview", orders: "Orders", "staff-order": "Staff order", queue: "Queue & pickup", deliveries: "Deliveries / driver", reports: "Daily report", menu: "Menu & catalogue", tables: "Tables & QR", settings: "Settings", zones: "Delivery zones", members: "Team & roles", restaurant: "Restaurant profile", storefront: "Delivery storefront", "table-order": "Table QR order", profile: "My profile", addresses: "Saved addresses", "my-orders": "My orders", notifications: "Notifications", devices: "Push devices", "queue-track": "Track queue ticket", api: "API workbench", create: "Create restaurant" };
  const title = titles[view];
  const filteredOrders = orders.filter((o) => JSON.stringify(o).toLowerCase().includes(search.toLowerCase()));
  const filteredProducts = products.filter((p) => JSON.stringify(p).toLowerCase().includes(search.toLowerCase()));
  const activeCartItems = Object.entries(cart).filter(([, item]) => item.quantity > 0);

  function nav() {
    return <WorkspaceNavigation connected={connected} role={role} view={view} onNavigate={changeView} />;
  }
  function intro(heading: string, sub: string) { return <SectionIntro heading={heading} sub={sub} />; }
  function empty(text: string) { return <EmptyState>{text}</EmptyState>; }
  function field(labelText: string, child: React.ReactNode, wide = false) { return <FormField labelText={labelText} wide={wide}>{child}</FormField>; }
  function editorButton(titleText: string, path: string, row: Row, method = "PUT") {
    return <button className="ws-btn ws-btn-muted" onClick={() => editRecord(titleText, path, row, method)}>Edit fields</button>;
  }

  const workspaceContextValue: WorkspaceViewContext = {
    call,
    connected,
    setConnected,
    memberships,
    setMemberships,
    restaurantId,
    setRestaurantId,
    restaurantName,
    setRestaurantName,
    role,
    setRole,
    view,
    setView,
    busy,
    setBusy,
    loading,
    setLoading,
    error,
    setError,
    notice,
    setNotice,
    data,
    setData,
    orders,
    setOrders,
    queue,
    setQueue,
    deliveries,
    setDeliveries,
    categories,
    setCategories,
    products,
    setProducts,
    variantsByProduct,
    setVariantsByProduct,
    linkedGroupsByProduct,
    setLinkedGroupsByProduct,
    groupsList,
    setGroupsList,
    linkForm,
    setLinkForm,
    defaultDriver,
    setDefaultDriver,
    payments,
    setPayments,
    paymentOrderId,
    setPaymentOrderId,
    tables,
    setTables,
    zones,
    setZones,
    members,
    setMembers,
    addresses,
    setAddresses,
    customerOrders,
    setCustomerOrders,
    customerZones,
    setCustomerZones,
    notifications,
    setNotifications,
    devices,
    setDevices,
    deviceForm,
    setDeviceForm,
    publicMenu,
    setPublicMenu,
    tableQrToken,
    setTableQrToken,
    tableQrResult,
    setTableQrResult,
    tableIdempotencyKey,
    setTableIdempotencyKey,
    report,
    setReport,
    search,
    setSearch,
    reportDate,
    setReportDate,
    draft,
    setDraft,
    apiTool,
    setApiTool,
    responseData,
    setResponseData,
    oneTimeSecret,
    setOneTimeSecret,
    oneTimeQrLink,
    setOneTimeQrLink,
    categoryName,
    setCategoryName,
    categoryOrder,
    setCategoryOrder,
    productForm,
    setProductForm,
    variantForm,
    setVariantForm,
    groupForm,
    setGroupForm,
    optionForm,
    setOptionForm,
    tableNumber,
    setTableNumber,
    zoneForm,
    setZoneForm,
    inviteForm,
    setInviteForm,
    existingMemberForm,
    setExistingMemberForm,
    profileForm,
    setProfileForm,
    addressForm,
    setAddressForm,
    driverInput,
    setDriverInput,
    restaurantCreate,
    setRestaurantCreate,
    cart,
    setCart,
    checkout,
    setCheckout,
    ticket,
    setTicket,
    tracking,
    setTracking,
    trackingNotifications,
    setTrackingNotifications,
    selectedOrder,
    setSelectedOrder,
    fail,
    ok,
    act,
    restaurantPath,
    loadView,
    changeView,
    connect,
    saveDraft,
    editRecord,
    upload,
    createCategory,
    createProduct,
    createVariant,
    createGroup,
    createOption,
    createTable,
    createZone,
    inviteMember,
    addExistingMember,
    registerDevice,
    saveProfile,
    createAddress,
    menuProduct,
    placeDeliveryOrder,
    showPayments,
    collectPayment,
    updateDelivery,
    assignDriver,
    rotateSecret,
    loadTableMenu,
    placeTableQrOrder,
    reorderOrder,
    trackQueue,
    submitApi,
    createRestaurant,
    nav,
    intro,
    empty,
    field,
    editorButton,
    title,
    filteredOrders,
    filteredProducts,
    activeCartItems,
    cartTotal,
    rid,
    record,
    list,
    label,
    asMoney,
    messageOf,
    nextStates,
    nextDeliveryStates,
  };

  return <WorkspaceProvider value={workspaceContextValue}><main className="ws-shell">
    <aside className="ws-sidebar"><Link className="ws-brand" href="/"><span className="ws-brand-mark">R</span><span>Restaurant<span>Platform</span></span></Link><div className="ws-restaurant-switch"><small>WORKING RESTAURANT</small><select value={restaurantId} onChange={(e)=>{const m=memberships.find((item)=>item.id===e.target.value);setRestaurantId(e.target.value);if(m){setRestaurantName(m.name);setRole(m.role);void loadView(view,e.target.value);}}}><option value="">Choose restaurant</option>{memberships.map((m)=><option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}</select></div><nav className="ws-nav">{nav()}{connected&&memberships.length===0&&<button className={"ws-nav-item "+(view==="create"?"is-active":"")} onClick={()=>changeView("create")}><span className="ws-nav-icon">＋</span><span>Create restaurant</span></button>}</nav><div className="ws-sidebar-bottom"><span className="ws-online-dot"/>{connected?"API session connected":user?"Account signed in":"Sign in to begin"}<p>Restaurant actions are authorized by the backend.</p><Link href="/">← Existing QR / operations page</Link></div></aside>
    <section className="ws-main"><header className="ws-topbar"><div><div className="ws-eyebrow">RESPONSIVE WORKSPACE / {role||"ACCOUNT"}</div><h1>{title}</h1><p>{restaurantName}</p></div><div className="ws-header-actions"><span className="ws-role-pill">{role||"No role"}</span><button className="ws-btn ws-btn-muted" disabled={loading||!connected} onClick={()=>void loadView(view)}>↻ Refresh</button><AccountMenu returnTo="/workspace" /></div></header>
      {view !== "table-order" && <section className="ws-connection"><div className="ws-connection-title"><div><b>{connected?"Backend connection":"Connect your account"}</b><p>{user ? "Your Supabase session is restored automatically. Restaurant memberships and roles come from the backend." : "Sign in with your restaurant account to open private workspace screens."}</p></div><span className={"ws-status "+(connected?"ws-completed":"ws-neutral")}>{connected?"Connected":user?"Signed in":"Signed out"}</span></div><form className="ws-connection-form" onSubmit={connect}>{user&&<>{memberships.length>0?field("Restaurant",<select value={restaurantId} onChange={(e)=>{const selected=memberships.find((item)=>item.id===e.target.value);if(selected){setRestaurantId(selected.id);setRestaurantName(selected.name);setRole(selected.role);void loadView(view,selected.id);}}}><option value="">Choose a restaurant</option>{memberships.map((m)=><option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}</select>):field("Restaurant UUID (customer store)",<input value={restaurantId} onChange={(e)=>setRestaurantId(e.target.value)} placeholder="Required for menu / delivery checkout" />)}</>}{user?<button className="ws-btn ws-btn-primary" disabled={busy||authLoading}>{busy?"Loading workspace…":connected?"Refresh workspace":"Load workspace"}</button>:<Link className="ws-btn ws-btn-primary" href={`/login?next=${encodeURIComponent("/workspace")}`}>Sign in</Link>}</form>{memberships.length>0&&<div className="ws-membership-list">Restaurants: {memberships.map((m)=><button className="ws-chip" key={m.id} onClick={()=>{setRestaurantId(m.id);setRestaurantName(m.name);setRole(m.role);void loadView(view,m.id);}}>{m.name} · {m.role}</button>)}</div>}</section>}
      {error&&<div className="ws-alert ws-alert-error" role="alert"><b>Request failed</b><span>{error}</span><button onClick={()=>setError("")}>×</button></div>}{notice&&<div className="ws-alert ws-alert-success" role="status"><span>{notice}</span><button onClick={()=>setNotice("")}>×</button></div>}
      {oneTimeSecret&&<div className="ws-secret-panel"><div><b>One-time QR credential</b><p>Keep the raw token private. Scan or print the QR below to open the correct guest checkout.</p><code>{oneTimeSecret}</code>{oneTimeQrLink&&<div className="ws-qr-preview"><QRCodeSVG value={oneTimeQrLink} size={190} marginSize={2} level="M"/><div><b>Guest checkout link</b><code>{oneTimeQrLink}</code><div className="ws-inline-actions"><button className="ws-btn ws-btn-muted" onClick={()=>{void navigator.clipboard?.writeText(oneTimeQrLink);ok("Guest link copied if clipboard access was allowed.");}}>Copy link</button><button className="ws-btn ws-btn-muted" onClick={()=>window.print()}>Print</button></div></div></div>}</div><button className="ws-btn ws-btn-muted" onClick={()=>{void navigator.clipboard?.writeText(oneTimeSecret);ok("Token copied if clipboard access was allowed.");}}>Copy token</button><button className="ws-btn ws-btn-muted" onClick={()=>{setOneTimeSecret("");setOneTimeQrLink("");}}>Dismiss</button></div>}
      {view === "table-order" ? <div className={"ws-content "+(loading?"ws-is-loading":"")}>{loading&&<div className="ws-loading-line">Loading latest data…</div>}<WorkspaceViews /></div> : !connected?<div className="ws-empty-connect"><div className="ws-empty-icon">↔</div><h2>{user?"Load your workspace":"Sign in to continue"}</h2><p>{user?"Your role and available restaurants are read from the backend after you connect.":"Sign in to access restaurant operations or your customer account. Table QR ordering remains available without an account."}</p>{user?<button className="ws-btn ws-btn-primary" onClick={()=>void connect()}>Load workspace</button>:<Link className="ws-btn ws-btn-primary" href={`/login?next=${encodeURIComponent("/workspace")}`}>Sign in</Link>}</div>:<div className={"ws-content "+(loading?"ws-is-loading":"")}>{loading&&<div className="ws-loading-line">Loading latest data…</div>}<WorkspaceViews /></div>}
      <footer className="ws-footer"><span>Restaurant Platform</span><span>Desktop · tablet · mobile</span><span>Backend-authorized actions</span></footer>
    </section>
    {draft&&<div className="ws-modal-backdrop" onClick={()=>setDraft(null)}><section className="ws-modal" role="dialog" aria-modal="true" aria-label={draft.title} onClick={(e)=>e.stopPropagation()}><div className="ws-modal-heading"><div><span className="ws-eyebrow">EDIT RECORD</span><h2>{draft.title}</h2><p>Review the fields before saving. The backend validates the final request.</p></div><button className="ws-modal-close" onClick={()=>setDraft(null)}>×</button></div><form onSubmit={saveDraft}><textarea className="ws-code-editor" rows={18} value={draft.body} onChange={(e)=>setDraft({...draft,body:e.target.value})} spellCheck={false}/><div className="ws-modal-actions"><button type="button" className="ws-btn ws-btn-muted" onClick={()=>setDraft(null)}>Cancel</button><button className="ws-btn ws-btn-primary" disabled={busy}>Save changes</button></div></form></section></div>}
    {selectedOrder&&<div className="ws-modal-backdrop" onClick={()=>setSelectedOrder(null)}><section className="ws-modal" role="dialog" aria-modal="true" aria-label="Order details" onClick={(e)=>e.stopPropagation()}><div className="ws-modal-heading"><div><span className="ws-eyebrow">ORDER DETAILS</span><h2>{label(selectedOrder)}</h2></div><button className="ws-modal-close" onClick={()=>setSelectedOrder(null)}>×</button></div><pre className="ws-json-preview">{JSON.stringify(selectedOrder,null,2)}</pre><button className="ws-btn ws-btn-primary" onClick={()=>setSelectedOrder(null)}>Close</button></section></div>}
  </main></WorkspaceProvider>;
}

