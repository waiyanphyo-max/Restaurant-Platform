"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ApiError,
  CreateQrOrderResponse,
  DailyOperationsReport,
  assignDeliveryDriver,
  callQueueTicket,
  getDefaultDeliveryDriver,
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
  setDefaultDeliveryDriver,
  createRestaurant,
  getRestaurantProfile,
  updateRestaurantProfile,
  uploadRestaurantLogo,
  RestaurantProfile,
  CreateRestaurantRequest,
  UpdateRestaurantProfileRequest,
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
type WorkspaceView = "orders" | "queue" | "deliveries" | "reports" | "restaurant-profile" | "customer-pickup";
type GuestCartLine = {
  quantity: number;
  variantId: string;
  specialInstruction: string;
  modifiers: Record<string, number>;
};

type RestaurantFormValues = {
  name: string;
  slug: string;
  description: string;
  phone: string;
  address: string;
  houseNo: string;
  street: string;
  ward: string;
  township: string;
  city: string;
  latitude: string;
  longitude: string;
  logoUrl: string;
  currency: string;
  timezone: string;
};

function emptyRestaurantForm(): RestaurantFormValues {
  return {
    name: "",
    slug: "",
    description: "",
    phone: "",
    address: "",
    houseNo: "",
    street: "",
    ward: "",
    township: "",
    city: "",
    latitude: "",
    longitude: "",
    logoUrl: "",
    currency: "MMK",
    timezone: "Asia/Yangon",
  };
}

function nullableText(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function coordinateValue(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function restaurantToForm(restaurant: RestaurantProfile): RestaurantFormValues {
  return {
    name: restaurant.name ?? "",
    slug: restaurant.slug ?? "",
    description: restaurant.description ?? "",
    phone: restaurant.phone ?? "",
    address: restaurant.address ?? "",
    houseNo: restaurant.houseNo ?? "",
    street: restaurant.street ?? "",
    ward: restaurant.ward ?? "",
    township: restaurant.township ?? "",
    city: restaurant.city ?? "",
    latitude: restaurant.latitude == null ? "" : String(restaurant.latitude),
    longitude: restaurant.longitude == null ? "" : String(restaurant.longitude),
    logoUrl: restaurant.logoUrl ?? "",
    currency: "MMK",
    timezone: "Asia/Yangon",
  };
}

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
  const [defaultDriverUserId, setDefaultDriverUserId] = useState("");
  const [defaultDriverLoaded, setDefaultDriverLoaded] = useState(false);
  const [defaultDriverLoading, setDefaultDriverLoading] = useState(false);
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

  const [createRestaurantForm, setCreateRestaurantForm] = useState<RestaurantFormValues>(() => emptyRestaurantForm());
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [loadedRestaurantProfile, setLoadedRestaurantProfile] = useState<RestaurantProfile | null>(null);
  const [editRestaurantForm, setEditRestaurantForm] = useState<RestaurantFormValues | null>(null);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");

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
  const pendingCommonCheckoutRef = useRef<{ fingerprint: string; key: string } | null>(null);

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
    if (activeView === "customer-pickup") {
      await loadPublicMenu();
      return;
    }
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

  async function loadDefaultDriver() {
    setActivityError("");
    if (!hasConnectionDetails) {
      setActivityError("Enter your API URL, restaurant ID, and access token first.");
      return;
    }
    setDefaultDriverLoading(true);
    try {
      const settings = await getDefaultDeliveryDriver(apiUrl, restaurantId, accessToken);
      setDefaultDriverUserId(settings.defaultDriverUserId ?? "");
      setDefaultDriverLoaded(true);
    } catch (cause) {
      setActivityError(errorMessage(
        cause,
        "Could not read the default driver setting. This requires SETTINGS_MANAGE permission.",
      ));
    } finally {
      setDefaultDriverLoading(false);
    }
  }

  async function saveDefaultDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivityError("");
    const driverUserId = defaultDriverUserId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverUserId)) {
      setActivityError("Enter a valid driver user UUID from this restaurant.");
      return;
    }
    setDefaultDriverLoading(true);
    try {
      const settings = await setDefaultDeliveryDriver(
        apiUrl, restaurantId, accessToken, driverUserId,
      );
      setDefaultDriverUserId(settings.defaultDriverUserId ?? "");
      setDefaultDriverLoaded(true);
      setActivityError("");
    } catch (cause) {
      setActivityError(errorMessage(
        cause,
        "Could not save the default driver. The user must be a DELIVERY_DRIVER member of this restaurant and your account needs SETTINGS_MANAGE permission.",
      ));
    } finally {
      setDefaultDriverLoading(false);
    }
  }

  function buildCreateRestaurantRequest(form: RestaurantFormValues): CreateRestaurantRequest {
    return {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: nullableText(form.description),
      phone: nullableText(form.phone),
      address: nullableText(form.address),
      houseNo: nullableText(form.houseNo),
      street: nullableText(form.street),
      ward: nullableText(form.ward),
      township: form.township.trim(),
      city: form.city.trim(),
      latitude: coordinateValue(form.latitude),
      longitude: coordinateValue(form.longitude),
      logoUrl: null,
      currency: form.currency.trim() || "MMK",
      timezone: form.timezone.trim() || "Asia/Yangon",
    };
  }

  function buildUpdateRestaurantRequest(form: RestaurantFormValues): UpdateRestaurantProfileRequest {
    return {
      name: form.name.trim(),
      description: nullableText(form.description),
      phone: nullableText(form.phone),
      address: nullableText(form.address),
      houseNo: nullableText(form.houseNo),
      street: nullableText(form.street),
      ward: nullableText(form.ward),
      township: form.township.trim(),
      city: form.city.trim(),
      latitude: coordinateValue(form.latitude),
      longitude: coordinateValue(form.longitude),
      logoUrl: loadedRestaurantProfile?.logoUrl ?? null,
    };
  }

  async function handleCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileNotice("");
    if (!accessToken.trim()) {
      setProfileError("Enter the restaurant owner's Supabase access token in the connection panel first.");
      return;
    }
    setProfileBusy(true);
    try {
      const created = await createRestaurant(
        apiUrl, accessToken, buildCreateRestaurantRequest(createRestaurantForm),
      );
      setRestaurantId(created.restaurant.id);
      setLoadedRestaurantProfile(created.restaurant);
      setEditRestaurantForm(restaurantToForm(created.restaurant));
      setEditLogoFile(null);
      setCreateRestaurantForm(emptyRestaurantForm());
      const logoFile = createLogoFile;
      setCreateLogoFile(null);

      if (logoFile) {
        try {
          const uploaded = await uploadRestaurantLogo(
            apiUrl, created.restaurant.id, accessToken, logoFile,
          );
          const withLogo = { ...created.restaurant, logoUrl: uploaded.logoUrl };
          setLoadedRestaurantProfile(withLogo);
          setEditRestaurantForm(restaurantToForm(withLogo));
          setProfileNotice(`Restaurant created and logo uploaded. Restaurant ID: ${created.restaurant.id}`);
        } catch (cause) {
          setProfileNotice(`Restaurant was created. Its ID is ${created.restaurant.id}. The logo upload did not complete.`);
          setProfileError(errorMessage(cause, "The restaurant was created, but the logo could not be uploaded. Select a logo in the update form and try again."));
        }
      } else {
        setProfileNotice(`Restaurant created successfully. Restaurant ID: ${created.restaurant.id}`);
      }
    } catch (cause) {
      setProfileError(errorMessage(cause, "Could not create the restaurant. Check the owner token and required fields."));
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadRestaurantProfile() {
    setProfileError("");
    setProfileNotice("");
    if (!restaurantId.trim() || !accessToken.trim()) {
      setProfileError("Enter the restaurant ID and the restaurant owner's access token in the connection panel first.");
      return;
    }
    setProfileBusy(true);
    try {
      const restaurant = await getRestaurantProfile(apiUrl, restaurantId, accessToken);
      setLoadedRestaurantProfile(restaurant);
      setEditRestaurantForm(restaurantToForm(restaurant));
      setEditLogoFile(null);
      setProfileNotice("Restaurant profile loaded.");
    } catch (cause) {
      setProfileError(errorMessage(cause, "Could not load this restaurant profile."));
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleUpdateRestaurantProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileNotice("");
    if (!editRestaurantForm || !restaurantId.trim() || !accessToken.trim()) {
      setProfileError("Load a restaurant profile and enter the owner's access token first.");
      return;
    }
    setProfileBusy(true);
    try {
      let updated = await updateRestaurantProfile(
        apiUrl,
        restaurantId,
        accessToken,
        buildUpdateRestaurantRequest(editRestaurantForm),
      );
      setLoadedRestaurantProfile(updated);
      setEditRestaurantForm(restaurantToForm(updated));

      if (editLogoFile) {
        try {
          const uploaded = await uploadRestaurantLogo(
            apiUrl, restaurantId, accessToken, editLogoFile,
          );
          updated = { ...updated, logoUrl: uploaded.logoUrl };
          setLoadedRestaurantProfile(updated);
          setEditRestaurantForm(restaurantToForm(updated));
          setEditLogoFile(null);
          setProfileNotice("Restaurant profile and logo updated successfully.");
        } catch (cause) {
          setProfileNotice("Restaurant details were saved, but the logo upload failed.");
          setProfileError(errorMessage(cause, "Could not upload the new logo. Check Storage configuration and Owner permissions."));
        }
      } else {
        setProfileNotice("Restaurant profile updated successfully.");
      }
    } catch (cause) {
      setProfileError(errorMessage(cause, "Could not update this restaurant profile."));
    } finally {
      setProfileBusy(false);
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

  async function loadPublicMenu() {
    setActiveView("customer-pickup");
    setGuestError("");
    setError("");
    if (!hasRestaurantDetails) {
      setGuestError("Enter the backend API URL and restaurant ID first.");
      return;
    }
    setGuestLoading(true);
    setPublicMenu(null);
    setMenuLoaded(false);
    try {
      const menu = await getPublicMenu(apiUrl, restaurantId);
      setPublicMenu(menu);
      setMenuLoaded(true);
    } catch (cause) {
      setGuestError(errorMessage(cause, "Could not load the public menu."));
    } finally {
      setGuestLoading(false);
    }
  }

  function updateGuestCartLine(productId: string, changes: Partial<GuestCartLine>) {
    setGuestCart(previous => {
      const current = previous[productId] ?? {
        quantity: 0,
        variantId: "",
        specialInstruction: "",
        modifiers: {},
      };
      return { ...previous, [productId]: { ...current, ...changes } };
    });
  }

  function toggleGuestModifier(
    productId: string,
    modifierOptionId: string,
    checked: boolean,
  ) {
    setGuestCart(previous => {
      const current = previous[productId] ?? {
        quantity: 0,
        variantId: "",
        specialInstruction: "",
        modifiers: {},
      };
      const modifiers = { ...current.modifiers };
      if (checked) modifiers[modifierOptionId] = 1;
      else delete modifiers[modifierOptionId];
      return { ...previous, [productId]: { ...current, modifiers } };
    });
  }

  async function handlePlaceCommonOrder() {
    setGuestError("");
    if (!publicMenu || !menuLoaded) {
      setGuestError("Load the restaurant menu before placing an order.");
      return;
    }
    if (!commonQrToken.trim()) {
      setGuestError("Enter the Common QR token printed on the restaurant's QR.");
      return;
    }

    const products = publicMenu.categories.flatMap(category => category.products);
    const selectedProducts = products.filter(
      product => (guestCart[product.id]?.quantity ?? 0) > 0,
    );
    if (selectedProducts.length === 0) {
      setGuestError("Choose at least one available product and set its quantity.");
      return;
    }

    for (const product of selectedProducts) {
      const line = guestCart[product.id];
      if (!product.available) {
        setGuestError(`${product.name} is no longer available.`);
        return;
      }
      if (product.variants.length > 0
          && !product.variants.some(variant =>
            variant.id === line.variantId && variant.available)) {
        setGuestError(`Choose an available size/variant for ${product.name}.`);
        return;
      }
      for (const group of product.modifierGroups) {
        const selectedCount = group.options.filter(
          option => (line.modifiers[option.id] ?? 0) > 0,
        ).length;
        if (selectedCount < group.minSelections || selectedCount > group.maxSelections) {
          setGuestError(
            `${product.name}: choose between ${group.minSelections} and ${group.maxSelections} options for ${group.name}.`,
          );
          return;
        }
      }
    }

    const request = {
      qrToken: commonQrToken.trim(),
      items: selectedProducts.map(product => {
        const line = guestCart[product.id];
        return {
          productId: product.id,
          variantId: line.variantId || null,
          quantity: line.quantity,
          specialInstruction: line.specialInstruction.trim() || null,
          modifiers: product.modifierGroups.flatMap(group =>
            group.options
              .filter(option => (line.modifiers[option.id] ?? 0) > 0)
              .map(option => ({
                modifierOptionId: option.id,
                quantity: line.modifiers[option.id],
              })),
          ),
        };
      }),
    };
    // Reuse the same key after a transient failure only if the checkout payload
    // is unchanged; a modified cart receives a new idempotency key.
    const fingerprint = JSON.stringify(request);
    const pending = pendingCommonCheckoutRef.current;
    const idempotencyKey = pending?.fingerprint === fingerprint
      ? pending.key
      : window.crypto.randomUUID();
    pendingCommonCheckoutRef.current = { fingerprint, key: idempotencyKey };

    setGuestLoading(true);
    try {
      const response = await createCommonQrOrder(
        apiUrl, restaurantId, request, idempotencyKey,
      );
      if (!response.queue) {
        throw new ApiError("No queue tracking ticket was returned for this Common QR order.");
      }
      setCommonOrder(response);
      setTrackedTicketId(response.queue.ticketId);
      setTrackingToken(response.queue.trackingToken);
      setCopiedTrackingToken(false);
      setTrackedStatus({
        ticketId: response.queue.ticketId,
        queueNumber: response.queue.queueNumber,
        displayCode: response.queue.displayCode,
        queueStatus: response.queue.status,
        orderNumber: response.orderNumber,
        orderStatus: response.status,
        createdAt: new Date().toISOString(),
        readyAt: null,
        calledAt: null,
        completedAt: null,
      });
      previousQueueStatusRef.current = response.queue.status;
      setTrackedNotifications([]);
      setTrackingError("");
      setGuestCart({});
      pendingCommonCheckoutRef.current = null;
    } catch (cause) {
      setGuestError(errorMessage(cause, "Could not place this Common QR order."));
    } finally {
      setGuestLoading(false);
    }
  }

  async function copyTrackingToken() {
    if (!trackingToken) return;
    try {
      await navigator.clipboard.writeText(trackingToken);
      setCopiedTrackingToken(true);
      setTrackingError("");
    } catch {
      setTrackingError("Your browser could not copy the tracking token. Keep this page open to continue tracking.");
    }
  }

  function enablePickupSound() {
    try {
      if (typeof window.AudioContext !== "function") {
        setTrackingError("This browser does not support sound alerts. Queue status will still refresh on screen.");
        return;
      }
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new window.AudioContext();
      }
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      setTrackingError("");
      playQueueAlert(audioContextRef.current);
    } catch {
      setTrackingError("The browser blocked audio. Queue status will continue without sound.");
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const scannedRestaurantId = query.get("restaurantId");
    const scannedQrToken = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("qrToken");
    const customerMode = query.get("view") === "customer-pickup" || Boolean(scannedQrToken);

    if (scannedRestaurantId) {
      setRestaurantId(scannedRestaurantId);
    }
    if (customerMode) {
      setActiveView("customer-pickup");
    }
    if (scannedQrToken) {
      setCommonQrToken(scannedQrToken);
      // Keep the Common QR credential in the URL fragment only long enough to load it.
      // Remove it from the visible address bar before making any API requests.
      const cleanQuery = new URLSearchParams(window.location.search);
      cleanQuery.set("view", "customer-pickup");
      if (scannedRestaurantId) cleanQuery.set("restaurantId", scannedRestaurantId);
      const queryString = cleanQuery.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${queryString ? `?${queryString}` : ""}`,
      );
    }
  }, []);

  useEffect(() => {
    if (!trackedTicketId || !trackingToken) return;
    let stopped = false;
    let inFlight = false;

    async function pollQueue() {
      if (inFlight) return;
      inFlight = true;
      try {
        const [status, notifications] = await Promise.all([
          getQueueTrackingStatus(apiUrl, trackedTicketId, trackingToken),
          getTicketNotifications(apiUrl, trackedTicketId, trackingToken),
        ]);
        if (stopped) return;
        const previousStatus = previousQueueStatusRef.current;
        if (soundEnabledRef.current
            && previousStatus !== status.queueStatus
            && ["READY", "CALLED"].includes(status.queueStatus)) {
          playQueueAlert(audioContextRef.current);
        }
        previousQueueStatusRef.current = status.queueStatus;
        setTrackedStatus(status);
        setTrackedNotifications(notifications);
        setTrackingError("");
      } catch (cause) {
        if (!stopped) {
          setTrackingError(errorMessage(
            cause,
            "Could not refresh queue status. Check your connection and tracking token.",
          ));
        }
      } finally {
        inFlight = false;
      }
    }

    void pollQueue();
    const intervalId = window.setInterval(() => void pollQueue(), 5000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [apiUrl, trackedTicketId, trackingToken]);

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
      : activeView === "deliveries" ? "Deliveries"
        : activeView === "reports" ? "Daily report"
          : activeView === "restaurant-profile" ? "Restaurant profile" : "Common QR order";

  const menuProducts = publicMenu?.categories.flatMap(category => category.products) ?? [];
  const selectedMenuProducts = menuProducts.filter(
    product => (guestCart[product.id]?.quantity ?? 0) > 0,
  );
  const estimatedGuestSubtotal = selectedMenuProducts.reduce((total, product) => {
    const line = guestCart[product.id];
    const variantPrice = product.variants.find(variant => variant.id === line.variantId)?.price;
    const modifierPrice = product.modifierGroups.reduce((groupTotal, group) =>
      groupTotal + group.options
        .filter(option => (line.modifiers[option.id] ?? 0) > 0)
        .reduce((sum, option) => sum + option.additionalPrice * line.modifiers[option.id], 0), 0);
    return total + ((variantPrice ?? product.price) + modifierPrice) * line.quantity;
  }, 0);

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
        <button
          type="button"
          className={`nav-item ${activeView === "restaurant-profile" ? "active" : ""}`}
          onClick={() => {
            setActiveView("restaurant-profile");
            setProfileError("");
            setProfileNotice("");
          }}
        ><span className="nav-icon">◉</span> Restaurant profile</button>
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
            <div><h3>Connect to your backend</h3><p>Staff operations need a Supabase access token; public Common QR checkout does not.</p></div>
            <span className="secure-label">Private request</span>
          </div>
          <form onSubmit={handleSubmit} className="connection-form">
            <label>Backend API URL
              <input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:8080" autoComplete="url" required />
            </label>
            <label>Restaurant ID
              <input value={restaurantId} onChange={e => setRestaurantId(e.target.value)} placeholder="Restaurant UUID" autoComplete="off" required />
            </label>
            <label className="token-field">Supabase access token (staff only)
              <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Optional for Common QR checkout" autoComplete="off" />
            </label>
            <button type="submit" disabled={loading || guestLoading}>{loading || guestLoading ? "Connecting…" : activeView === "customer-pickup" ? "Load menu" : "Load orders"} <span aria-hidden="true">→</span></button>
          </form>
          <p className="privacy-note">Staff access tokens stay in page memory only. The guest Common QR flow uses public endpoints and its queue tracking token; never use a service-role key here.</p>
          {error && <div className="feedback error" role="alert">{error}</div>}
        </section>

        {activeView === "restaurant-profile" && <section className="orders-section restaurant-profile-section" aria-busy={profileBusy}>
          <div className="orders-heading">
            <div>
              <h3>Create or update a restaurant</h3>
              <p>Create a restaurant with an optional logo, or load an existing restaurant to update its profile and logo.</p>
            </div>
          </div>
          {profileNotice && <div className="feedback success" role="status">{profileNotice}</div>}
          {profileError && <div className="feedback error" role="alert">{profileError}</div>}
          <div className="restaurant-profile-grid">
            <article className="restaurant-profile-card">
              <div className="restaurant-profile-card-heading">
                <span className="profile-step">01</span>
                <div><h4>Create restaurant</h4><p>The signed-in user becomes the initial owner.</p></div>
              </div>
              <form className="restaurant-profile-form" onSubmit={handleCreateRestaurant}>
                <div className="restaurant-form-grid">
                  <label>Restaurant name
                    <input value={createRestaurantForm.name} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, name: event.target.value }))} maxLength={150} required />
                  </label>
                  <label>Restaurant slug
                    <input value={createRestaurantForm.slug} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") }))} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} placeholder="my-restaurant" required />
                  </label>
                  <label className="wide">Description
                    <textarea value={createRestaurantForm.description} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, description: event.target.value }))} maxLength={4000} rows={2} />
                  </label>
                  <label>Phone
                    <input value={createRestaurantForm.phone} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, phone: event.target.value }))} maxLength={30} />
                  </label>
                  <label>House number
                    <input value={createRestaurantForm.houseNo} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, houseNo: event.target.value }))} maxLength={50} />
                  </label>
                  <label className="wide">Address
                    <input value={createRestaurantForm.address} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, address: event.target.value }))} maxLength={2000} />
                  </label>
                  <label>Street
                    <input value={createRestaurantForm.street} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, street: event.target.value }))} maxLength={100} />
                  </label>
                  <label>Ward
                    <input value={createRestaurantForm.ward} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, ward: event.target.value }))} maxLength={100} />
                  </label>
                  <label>Township
                    <input value={createRestaurantForm.township} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, township: event.target.value }))} maxLength={100} required />
                  </label>
                  <label>City
                    <input value={createRestaurantForm.city} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, city: event.target.value }))} maxLength={100} required />
                  </label>
                  <label>Latitude (optional)
                    <input type="number" min={-90} max={90} step="any" value={createRestaurantForm.latitude} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, latitude: event.target.value }))} />
                  </label>
                  <label>Longitude (optional)
                    <input type="number" min={-180} max={180} step="any" value={createRestaurantForm.longitude} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, longitude: event.target.value }))} />
                  </label>
                  <label>Currency
                    <input value={createRestaurantForm.currency} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, currency: event.target.value.toUpperCase() }))} pattern="[A-Za-z]{3}" maxLength={3} required />
                  </label>
                  <label>Timezone
                    <input value={createRestaurantForm.timezone} onChange={event => setCreateRestaurantForm(previous => ({ ...previous, timezone: event.target.value }))} maxLength={60} required />
                  </label>
                </div>
                <label className="logo-upload-field">Restaurant logo (PNG, JPEG, or WebP; max 5 MB)
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                    const file = event.target.files?.[0] ?? null;
                    setProfileError("");
                    if (file && file.size > 5 * 1024 * 1024) {
                      setCreateLogoFile(null);
                      event.target.value = "";
                      setProfileError("Logo images must be 5 MB or smaller.");
                      return;
                    }
                    setCreateLogoFile(file);
                  }} />
                  <small>{createLogoFile ? `Selected: ${createLogoFile.name}` : "Optional. The restaurant is created first, then the logo is uploaded securely."}</small>
                </label>
                <div className="profile-form-actions">
                  <button className="primary-action" type="submit" disabled={profileBusy}>
                    {profileBusy ? "Creating…" : "Create restaurant"}
                  </button>
                </div>
              </form>
            </article>

            <article className="restaurant-profile-card">
              <div className="restaurant-profile-card-heading">
                <span className="profile-step">02</span>
                <div><h4>Update restaurant profile</h4><p>Use the restaurant ID above and the owner&apos;s access token.</p></div>
              </div>
              <div className="profile-load-row">
                <span className="profile-restaurant-id">{restaurantId.trim() || "No restaurant selected"}</span>
                <button className="secondary-button" type="button" onClick={() => void loadRestaurantProfile()} disabled={profileBusy || !restaurantId.trim() || !accessToken.trim()}>
                  {profileBusy ? "Loading…" : "Load profile"}
                </button>
              </div>
              {loadedRestaurantProfile?.logoUrl && <div className="restaurant-logo-current">
                <Image src={loadedRestaurantProfile.logoUrl} alt={`${loadedRestaurantProfile.name} logo`} width={68} height={68} unoptimized />
                <div><strong>Current logo</strong><a href={loadedRestaurantProfile.logoUrl} target="_blank" rel="noreferrer">Open image</a></div>
              </div>}
              {!editRestaurantForm && <div className="empty-state compact-empty"><div className="empty-icon">◉</div><h4>Load a restaurant first</h4><p>Enter its ID in the connection panel, then load its profile here.</p></div>}
              {editRestaurantForm && <form className="restaurant-profile-form" onSubmit={handleUpdateRestaurantProfile}>
                <div className="restaurant-form-grid">
                  <label>Restaurant name
                    <input value={editRestaurantForm.name} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, name: event.target.value }) : previous)} maxLength={150} required />
                  </label>
                  <label>Slug (cannot be changed here)
                    <input value={editRestaurantForm.slug} readOnly />
                  </label>
                  <label className="wide">Description
                    <textarea value={editRestaurantForm.description} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, description: event.target.value }) : previous)} maxLength={4000} rows={2} />
                  </label>
                  <label>Phone
                    <input value={editRestaurantForm.phone} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, phone: event.target.value }) : previous)} maxLength={30} />
                  </label>
                  <label>House number
                    <input value={editRestaurantForm.houseNo} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, houseNo: event.target.value }) : previous)} maxLength={50} />
                  </label>
                  <label className="wide">Address
                    <input value={editRestaurantForm.address} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, address: event.target.value }) : previous)} maxLength={2000} />
                  </label>
                  <label>Street
                    <input value={editRestaurantForm.street} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, street: event.target.value }) : previous)} maxLength={100} />
                  </label>
                  <label>Ward
                    <input value={editRestaurantForm.ward} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, ward: event.target.value }) : previous)} maxLength={100} />
                  </label>
                  <label>Township
                    <input value={editRestaurantForm.township} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, township: event.target.value }) : previous)} maxLength={100} required />
                  </label>
                  <label>City
                    <input value={editRestaurantForm.city} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, city: event.target.value }) : previous)} maxLength={100} required />
                  </label>
                  <label>Latitude (optional)
                    <input type="number" min={-90} max={90} step="any" value={editRestaurantForm.latitude} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, latitude: event.target.value }) : previous)} />
                  </label>
                  <label>Longitude (optional)
                    <input type="number" min={-180} max={180} step="any" value={editRestaurantForm.longitude} onChange={event => setEditRestaurantForm(previous => previous ? ({ ...previous, longitude: event.target.value }) : previous)} />
                  </label>
                </div>
                <label className="logo-upload-field">Replace restaurant logo (PNG, JPEG, or WebP; max 5 MB)
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                    const file = event.target.files?.[0] ?? null;
                    setProfileError("");
                    if (file && file.size > 5 * 1024 * 1024) {
                      setEditLogoFile(null);
                      event.target.value = "";
                      setProfileError("Logo images must be 5 MB or smaller.");
                      return;
                    }
                    setEditLogoFile(file);
                  }} />
                  <small>{editLogoFile ? `Selected: ${editLogoFile.name}` : "Choose a new image to replace the current logo. Leave empty to keep it."}</small>
                </label>
                <div className="profile-form-actions">
                  <button className="primary-action" type="submit" disabled={profileBusy}>
                    {profileBusy ? "Saving…" : editLogoFile ? "Save profile and logo" : "Save profile"}
                  </button>
                </div>
              </form>}
            </article>
          </div>
        </section>}

        {activeView === "customer-pickup" && <section className="orders-section guest-order-section" aria-busy={guestLoading}>
          <div className="orders-heading">
            <div>
              <h3>Common QR pickup order</h3>
              <p>Browse the public menu, place a pickup order, and track its queue number without signing in.</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadPublicMenu()} disabled={guestLoading || !hasRestaurantDetails}>
              {guestLoading ? "Loading…" : "Refresh menu"}
            </button>
          </div>

          {publicMenu && <div className="guest-restaurant-info">
            <h4>{publicMenu.restaurantName}</h4>
            {publicMenu.description && <p>{publicMenu.description}</p>}
            {publicMenu.address && <p>{publicMenu.address}</p>}
            <label className="filter-field guest-token-field">
              Common QR token
              <input type="password" value={commonQrToken} onChange={event => setCommonQrToken(event.target.value)}
                placeholder="Token from the restaurant's Common QR" autoComplete="off" />
            </label>
          </div>}

          {guestError && <div className="feedback error" role="alert">{guestError}</div>}
          {guestLoading && !menuLoaded && <div className="empty-state"><div className="loader" /><h4>Loading menu</h4><p>Fetching the active public menu for this restaurant.</p></div>}
          {!publicMenu && !guestLoading && !guestError && <div className="empty-state"><div className="empty-icon">☷</div><h4>Load a restaurant menu</h4><p>Enter the backend URL and restaurant UUID above, then choose Load menu.</p></div>}

          {menuLoaded && publicMenu && <div className="guest-menu">
            {publicMenu.categories.length === 0 && <div className="empty-state"><h4>No active menu yet</h4><p>This restaurant has not published any active categories.</p></div>}
            {publicMenu.categories.map(category => <section className="guest-category" key={category.id}>
              <div className="guest-category-heading"><h4>{category.name}</h4><span>{category.products.length} item(s)</span></div>
              <div className="guest-product-list">
                {category.products.map(product => {
                  const line = guestCart[product.id] ?? {
                    quantity: 0, variantId: "", specialInstruction: "", modifiers: {},
                  };
                  const selectedCount = (groupId: string) => {
                    const group = product.modifierGroups.find(item => item.id === groupId);
                    return group?.options.filter(option => (line.modifiers[option.id] ?? 0) > 0).length ?? 0;
                  };
                  const selectedVariantPrice = product.variants.find(
                    variant => variant.id === line.variantId,
                  )?.price ?? product.price;
                  const selectedModifierPrice = product.modifierGroups.reduce((groupTotal, group) =>
                    groupTotal + group.options
                      .filter(option => (line.modifiers[option.id] ?? 0) > 0)
                      .reduce((sum, option) => sum + option.additionalPrice * line.modifiers[option.id], 0), 0);
                  const lineTotal = (selectedVariantPrice + selectedModifierPrice) * line.quantity;

                  return <article className={`guest-product ${product.available ? "" : "unavailable"}`} key={product.id}>
                    <div className="guest-product-heading">
                      <div><h5>{product.name}</h5>{product.description && <p>{product.description}</p>}</div>
                      <strong>{formatMoney(product.price)} {publicMenu.currency}</strong>
                    </div>
                    {!product.available && <p className="unavailable-label">Currently unavailable</p>}
                    {product.variants.length > 0 && <label className="guest-control">
                      Size / variant
                      <select value={line.variantId}
                        onChange={event => updateGuestCartLine(product.id, { variantId: event.target.value })}
                        disabled={!product.available || guestLoading}>
                        <option value="">Choose a variant</option>
                        {product.variants.filter(variant => variant.available).map(variant =>
                          <option key={variant.id} value={variant.id}>{variant.name} — {formatMoney(variant.price)} {publicMenu.currency}</option>,
                        )}
                      </select>
                    </label>}
                    {product.modifierGroups.map(group => {
                      const count = selectedCount(group.id);
                      return <fieldset className="guest-modifier-group" key={group.id} disabled={!product.available || guestLoading}>
                        <legend>{group.name} <span>{group.minSelections}–{group.maxSelections} choice(s){group.required ? " · Required" : ""}</span></legend>
                        {group.options.length === 0 && <p className="modifier-empty">No selectable options are available for this group.</p>}
                        {group.options.map(option => {
                          const selected = (line.modifiers[option.id] ?? 0) > 0;
                          const maxReached = count >= group.maxSelections;
                          return <label className="guest-modifier-option" key={option.id}>
                            <input type="checkbox" checked={selected}
                              disabled={!option.available || (!selected && maxReached)}
                              onChange={event => toggleGuestModifier(product.id, option.id, event.target.checked)} />
                            <span>{option.name}</span><small>+{formatMoney(option.additionalPrice)} {publicMenu.currency}</small>
                          </label>;
                        })}
                      </fieldset>;
                    })}
                    <label className="guest-control">Special instruction
                      <input value={line.specialInstruction}
                        onChange={event => updateGuestCartLine(product.id, { specialInstruction: event.target.value })}
                        maxLength={500} placeholder="Optional request" disabled={!product.available || guestLoading} />
                    </label>
                    <div className="guest-product-footer">
                      <label className="quantity-field">Qty
                        <input type="number" min={0} max={50} step={1} value={line.quantity}
                          onChange={event => {
                            const parsed = Number.parseInt(event.target.value, 10);
                            const quantity = Number.isFinite(parsed) ? Math.min(50, Math.max(0, parsed)) : 0;
                            updateGuestCartLine(product.id, { quantity });
                          }}
                          disabled={!product.available || guestLoading} />
                      </label>
                      <strong className="guest-line-total">{formatMoney(lineTotal)} {publicMenu.currency}</strong>
                    </div>
                  </article>;
                })}
              </div>
            </section>)}
            <div className="guest-cart-summary">
              <div><span>Estimated subtotal</span><strong>{formatMoney(estimatedGuestSubtotal)} {publicMenu.currency}</strong><small>Final prices, options, availability, and stock are verified by the backend when you place the order.</small></div>
              <button className="primary-action" type="button" onClick={() => void handlePlaceCommonOrder()}
                disabled={guestLoading || selectedMenuProducts.length === 0 || !commonQrToken.trim()}>
                {guestLoading ? "Placing order…" : "Place pickup order"}
              </button>
            </div>
          </div>}

          {commonOrder?.queue && trackedStatus && <section className="guest-tracking-card">
            <div className="guest-tracking-heading">
              <div><p className="intro-kicker">ORDER CONFIRMED</p><h4>{commonOrder.orderNumber}</h4><p>Keep this screen open to follow your pickup number.</p></div>
              <div className="queue-number">{trackedStatus.displayCode}</div>
            </div>
            <div className="guest-tracking-status">
              <span>Pickup status</span>
              <strong className={statusClass(trackedStatus.queueStatus)}>{humanizeStatus(trackedStatus.queueStatus)}</strong>
              <p>Queue {trackedStatus.displayCode} · Order {humanizeStatus(trackedStatus.orderStatus)}</p>
              {trackedStatus.readyAt && <p>Ready at {formatDate(trackedStatus.readyAt)}</p>}
              {trackedStatus.calledAt && <p>Called at {formatDate(trackedStatus.calledAt)}</p>}
              {trackedStatus.completedAt && <p>Completed at {formatDate(trackedStatus.completedAt)}</p>}
            </div>
            <div className="guest-tracking-actions">
              <button className="secondary-button" type="button" onClick={enablePickupSound}>
                {soundEnabled ? "Sound enabled" : "Enable sound alert"}
              </button>
              <button className="secondary-button" type="button" onClick={() => void copyTrackingToken()}>
                {copiedTrackingToken ? "Tracking token copied" : "Copy tracking token"}
              </button>
            </div>
            <p className="privacy-note">The tracking token is a secret that allows access to this queue ticket. It stays in this page&apos;s memory and is not put in the URL or saved to browser storage.</p>
            {trackingError && <div className="feedback error" role="alert">{trackingError}</div>}
            {trackedNotifications.some(notification =>
              ["QUEUE_READY", "QUEUE_CALLED"].includes(notification.notificationType),
            ) && <div className="guest-notification-list">
              {trackedNotifications.filter(notification =>
                ["QUEUE_READY", "QUEUE_CALLED"].includes(notification.notificationType),
              ).map(notification => <article className="guest-notification" key={notification.id}>
                <strong>{notification.title}</strong><p>{notification.body}</p><small>{formatDate(notification.createdAt)}</small>
              </article>)}
            </div>}
            <p className="tracking-poll-note">Queue status refreshes automatically every 5 seconds while this screen stays open. Sound alerts play after you enable sound in your browser.</p>
          </section>}
        </section>}

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
          <section className="default-driver-panel">
            <div className="default-driver-info">
              <h4>Restaurant default driver</h4>
              <p>New delivery orders use this driver automatically when they become READY. The user must already be a DELIVERY_DRIVER member of this restaurant.</p>
              <small>{defaultDriverLoaded
                ? defaultDriverUserId || "No default driver currently saved"
                : "Load the current setting or enter a driver UUID to set it."}</small>
            </div>
            <form className="default-driver-form" onSubmit={saveDefaultDriver}>
              <label>Default driver user UUID
                <input
                  value={defaultDriverUserId}
                  onChange={event => setDefaultDriverUserId(event.target.value)}
                  placeholder="Driver user UUID"
                  autoComplete="off"
                />
              </label>
              <div className="default-driver-actions">
                <button className="secondary-button" type="button" onClick={() => void loadDefaultDriver()} disabled={defaultDriverLoading || activityLoading}>
                  {defaultDriverLoading && !defaultDriverLoaded ? "Loading…" : "Load current"}
                </button>
                <button className="primary-action" type="submit" disabled={defaultDriverLoading || activityLoading || !defaultDriverUserId.trim()}>
                  {defaultDriverLoading ? "Saving…" : "Save default"}
                </button>
              </div>
            </form>
          </section>
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
