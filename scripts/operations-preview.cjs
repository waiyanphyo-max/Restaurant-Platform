"use strict";

/**
 * Read-only presentation fixture for UXI-10/11/12. Runs the real Operations TSX through
 * React DOM SSR and a deliberately small React Native adapter. This is a DOM
 * approximation, not evidence of Android, font, keyboard or TalkBack acceptance.
 * No live auth, API, native configuration or persisted user data is loaded.
 * Run: node scripts/operations-preview.cjs [--catalog|--finance] [--serve]
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { resolveThemeTokens } = require("@restaurant-platform/ui-tokens");
const appRoot = path.resolve(__dirname, "../apps/operations-mobile");
const root = path.resolve(__dirname, "..");
const catalogMode = process.argv.includes("--catalog");
const financeMode = process.argv.includes("--finance");
const output = path.join(root, financeMode ? "target/uxi-12-preview" : catalogMode ? "target/uxi-11-preview" : "target/uxi-10-preview");
const ts = Module.createRequire(path.join(appRoot, "package.json"))("typescript");
const h = React.createElement;
const noop = () => {};
let fixture;
let route = "/home";
let fontScale = 1;
let previewWidth = 360;
let Screen;

function flatten(value) {
  if (typeof value === "function") return flatten(value({ pressed: false }));
  return Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {};
}
function style(value, text = false) {
  const source = flatten(value);
  const result = text ? { minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
    : { display: "flex", flexDirection: "column", position: "relative", minWidth: 0, minHeight: 0, flexShrink: 0 };
  for (const [key, raw] of Object.entries(source)) {
    if (key === "paddingHorizontal" || key === "marginHorizontal") {
      const prefix = key.startsWith("padding") ? "padding" : "margin";
      result[`${prefix}Left`] = raw; result[`${prefix}Right`] = raw;
    } else if (key === "paddingVertical" || key === "marginVertical") {
      const prefix = key.startsWith("padding") ? "padding" : "margin";
      result[`${prefix}Top`] = raw; result[`${prefix}Bottom`] = raw;
    } else if (key === "transform") {
      result.transform = raw.map(item => Object.entries(item).map(([name, amount]) => `${name}(${amount}px)`).join(" ")).join(" ");
    } else if (key === "lineHeight") {
      // Native line height is an absolute pixel value; CSS numeric line height
      // is a font-size multiplier and would create enormous blank text rows.
      result[key] = `${raw * fontScale}px`;
    } else if (key === "fontSize") {
      result[key] = raw * fontScale;
    } else if (!["tintColor", "elevation", "shadowOffset", "shadowOpacity", "shadowRadius", "shadowColor"].includes(key)) {
      result[key] = raw;
    }
  }
  if (source.borderWidth || source.borderTopWidth) result.borderStyle = "solid";
  if (typeof source.flex === "number" && source.flex > 0) {
    result.flexGrow = source.flex; result.flexShrink = 1; result.flexBasis = 0;
    delete result.flex;
  }
  return result;
}
function attributes(props) {
  const state = props.accessibilityState || {};
  return {
    id: props.nativeID,
    role: props.accessibilityRole === "header" ? "heading" : props.accessibilityRole === "text" ? undefined : props.accessibilityRole,
    "aria-label": props.accessibilityLabel,
    "aria-selected": state.selected,
    "aria-checked": state.checked,
    "aria-disabled": state.disabled,
    "aria-busy": state.busy,
    "aria-live": props.accessibilityLiveRegion,
  };
}
function View(props) { return h("div", { ...attributes(props), style: style(props.style) }, props.children); }
function Text(props) { return h("div", { ...attributes(props), style: style(props.style, true) }, props.children); }
function Pressable(props) {
  return h("button", { ...attributes(props), type: "button", disabled: props.disabled,
    style: { fontFamily: "inherit", cursor: "default", ...style(props.style) } }, props.children);
}
function ScrollView(props) {
  const outer = { ...style(props.style), overflow: "auto" };
  // React Native's ScrollView base style grows and shrinks inside its parent.
  outer.flexGrow = flatten(props.style).flexGrow ?? 1;
  outer.flexShrink = flatten(props.style).flexShrink ?? 1;
  const inner = { ...style(props.contentContainerStyle), ...(props.horizontal ? { flexDirection: "row", width: "max-content", minWidth: "100%" } : {}) };
  return h("div", { style: outer }, h("div", { style: inner }, props.children));
}
function TextInput(props) {
  return h(props.multiline ? "textarea" : "input", { ...attributes(props), value: props.value ?? "", readOnly: true,
    placeholder: props.placeholder, type: props.secureTextEntry ? "password" : "text",
    style: { fontFamily: "inherit", width: "100%", ...style(props.style, true) } });
}
function Image(props) {
  const uri = typeof props.source === "string" ? props.source : props.source?.uri;
  return h("img", { ...attributes(props), alt: props.accessible === false ? "" : props.accessibilityLabel || "",
    src: uri,
    style: { ...style(props.style), display: "block", objectFit: props.resizeMode === "cover" ? "cover" : "contain" } });
}
function SectionList(props) {
  return h("div", { style: { ...style(props.style), overflow: "auto", flexShrink: 1 } },
    h("div", { style: style(props.contentContainerStyle) }, props.ListHeaderComponent,
      props.sections.some(section => section.data.length) ? props.sections.flatMap(section => [
        h(React.Fragment, { key: `${section.id}-title` }, props.renderSectionHeader?.({ section })),
        ...section.data.map((item, index) => h(React.Fragment, { key: props.keyExtractor(item) }, props.renderItem({ item, index, section }))),
      ]) : props.ListEmptyComponent, props.ListFooterComponent));
}
const native = {
  View, Text, Pressable, ScrollView, TextInput, Image, SectionList,
  Switch: props => h("input", { ...attributes(props), type: "checkbox", checked: props.value, readOnly: true }),
  AppState: { currentState: "active", addEventListener: () => ({ remove: noop }) },
  SafeAreaView: View, KeyboardAvoidingView: View,
  StyleSheet: { create: value => value, flatten, hairlineWidth: 1 },
  Modal: props => props.visible ? h(View, props) : null,
  RefreshControl: () => null,
  ActivityIndicator: props => h("span", { ...attributes(props), style: { ...style(props.style), color: props.color } }, "◌"),
  AccessibilityInfo: { announceForAccessibility: noop, setAccessibilityFocus: noop },
  findNodeHandle: () => null, Platform: { OS: "android", select: value => value.android ?? value.default },
  useWindowDimensions: () => ({ width: previewWidth, height: 900, fontScale, scale: 1 }),
};

// These ports never call real auth, APIs, storage, notification providers or maps.
const noopAsync = async () => undefined;
const mocks = {
  "tenant.ts": { readEmbeddedTenant: () => fixture.tenant },
  "auth/AuthProvider.tsx": { useOperationsAuth: () => ({ state: fixture.access, workspace: fixture.access,
    signOut: noopAsync, retryMembership: noopAsync, verifyWorkspaceAccess: noopAsync, assertWorkspaceAccess: noop }),
    OperationsWorkspaceContext: props => props.children },
  "auth/WorkspaceBoundary.tsx": { WorkspaceBoundary: props => props.children },
  "auth/native.ts": { getOperationsAuth: () => { throw new Error("Preview blocks native authentication"); } },
  "branding/RuntimeBrandingProvider.tsx": { RuntimeBrandingProvider: props => props.children,
    useRuntimeBranding: () => ({ displayName: fixture.tenant.branding.displayName, logoUrl: null, refresh: noopAsync,
      scopeKey: fixture.tenant.restaurantId, branding: { restaurantId: fixture.tenant.restaurantId, displayName: fixture.tenant.branding.displayName,
        logoUrl: null, revision: 3, palette: fixture.palette }, loading: false, refreshing: false, error: null }) },
  "hooks/useApiMutation.ts": { useApiMutation: () => ({ busy: false, error: null, message: null, reset: noop, run: noopAsync }) },
  "hooks/useApiQuery.ts": { useApiQuery: (_query, key) => ({ state: { status: "ready", data: queryData(key) }, reload: noop }) },
  "api.ts": { getOperationsApi: () => { throw new Error("Preview blocks all API access"); } },
  "components/useImageUpload.ts": { useImageUpload: () => noopAsync },
  "components/imageUpload.ts": { pickImage: noopAsync },
  "features/accounting/purchase-attempt-native.ts": { createNativePurchaseAttemptStore: () => ({ load: async () => null,
    begin: () => { throw new Error("Preview blocks purchase attempts"); }, complete: noopAsync, reject: noopAsync }) },
};
function page(content) { return { content, number: 0, totalPages: content.length ? 1 : 0, totalElements: content.length, first: true, last: true }; }
function queryData(key) {
  if (financeMode) {
    if (!fixture.management) throw new Error("A denied role attempted a private finance query");
    if (key === "financial-overview" || key.startsWith("financial-report:")) return fixture.finance.report;
    if (key.startsWith("sales-dashboard:")) return fixture.finance.dashboard;
    if (key.startsWith("sales-ledger:") || key.startsWith("sales-export:")) return procurementPage([fixture.finance.sale]);
    if (key.startsWith("sales-products:")) return procurementPage(fixture.finance.dashboard.topProducts);
    if (key.includes("shopping-settings") || key.includes("purchasing-settings")) return fixture.settings;
    if (key.includes("shopping-sheets") || key.includes("purchase-source-sheets")) return procurementPage([fixture.finance.sheet]);
    if (key.includes("shopping-items")) return procurementPage([fixture.finance.item]);
    if (key.startsWith("purchase-detail:")) return fixture.finance.purchase;
    if (key.includes("purchase-report")) return fixture.finance.purchaseReport;
    if (key.includes("purchases")) return procurementPage([fixture.finance.purchase.purchase]);
    if (key.includes("payables")) return procurementPage([fixture.finance.payable]);
    if (key.includes("suppliers")) return procurementPage([fixture.finance.supplier]);
    if (key.includes("expense-report")) return fixture.finance.expenseReport;
    if (key.includes("expenses")) return expensePage([fixture.finance.expense]);
    if (key.includes("cash-transactions")) return expensePage(fixture.finance.cash);
    if (key.startsWith("cash-day:")) return fixture.finance.day;
    if (key.includes("cash-closings")) return expensePage([fixture.finance.closing]);
    if (key.includes("accounting-audit")) return procurementPage(fixture.finance.audit);
    throw new Error(`Missing synthetic finance query fixture: ${key}`);
  }
  if (key.startsWith("delivery-config:")) return key.endsWith(":true")
    ? { zones: fixture.zones, drivers: fixture.members.filter(member => member.role === "DELIVERY_DRIVER"), defaultDriver: { restaurantId: fixture.tenant.restaurantId, defaultDriverUserId: fixture.members[2].userId } }
    : null;
  if (key.startsWith("owner-menu:")) return { products: fixture.products, categories: fixture.categories, groups: fixture.groups, currency: "MMK" };
  if (key === "menu-featured-product") return { restaurantId: fixture.tenant.restaurantId, productId: fixture.products[0].id, status: "AVAILABLE", revision: 2 };
  if (key === "managed-profile") return fixture.restaurant;
  if (key === "managed-settings") return fixture.settings;
  if (key === "managed-team") return fixture.members;
  if (key === "managed-tables") return fixture.tables;
  if (key.startsWith("order-payments:")) return fixture.payments;
  if (key.startsWith("order:")) return fixture.order;
  if (key.startsWith("orders:")) return page([fixture.order]);
  if (key.startsWith("queue:")) return fixture.queue;
  if (key.startsWith("assigned-delivery:")) return fixture.detail;
  if (key.startsWith("deliveries:")) return { kind: fixture.management ? "management" : "assigned", page: page([fixture.detail.task]) };
  if (key.startsWith("dashboard:")) return fixture.dashboard;
  if (key.startsWith("counter-order:")) return null;
  if (key.startsWith("notifications:")) return [];
  return [];
}
function procurementPage(content) { return { content, page: 0, size: 20, totalElements: content.length }; }
function expensePage(items) { return { items, page: 0, size: 20, total: items.length }; }
const originalLoad = Module._load;
const oldTs = require.extensions[".ts"];
const oldTsx = require.extensions[".tsx"];
const oldPng = require.extensions[".png"];
Module._load = function(request, parent, isMain) {
  if (request === "react-native") return { ...native, Linking: { openURL: noopAsync } };
  if (request === "react-native-safe-area-context") return { SafeAreaView: View, SafeAreaProvider: View };
  if (request === "expo-router") return { Slot: () => h(Screen), Redirect: () => null, usePreventRemove: () => noop,
    Link: props => props.asChild ? props.children : h("a", { href: typeof props.href === "string" ? props.href : "#", style: style(props.style), ...attributes(props) }, props.children),
    usePathname: () => route, useLocalSearchParams: () => ({}), useFocusEffect: noop,
    useRouter: () => ({ navigate: noop, push: noop, replace: noop }) };
  if (["expo-file-system/legacy", "expo-sharing"].includes(request)) return {};
  if (request === "react-native-qrcode-svg") return () => h("div", null, "Synthetic preview: no QR credential");
  if (request.startsWith(".")) {
    const resolved = Module._resolveFilename(request, parent);
    for (const [suffix, mock] of Object.entries(mocks)) if (resolved === path.join(appRoot, "src", suffix)) return mock;
  }
  return originalLoad.call(this, request, parent, isMain);
};
const compile = (module, filename) => {
  if (!filename.startsWith(appRoot + path.sep)) throw new Error(`Preview cannot transpile non-Operations source: ${filename}`);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, filename);
};
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;
require.extensions[".png"] = (module, filename) => { module.exports = `data:image/png;base64,${fs.readFileSync(filename).toString("base64")}`; };

function makeFixture(letter, role) {
  const red = letter === "a";
  const prefix = red ? "00000000-0000-4000-8000-00000000" : "10000000-0000-4000-8000-00000000";
  const uuid = number => prefix + String(number).padStart(4, "0");
  const branding = { displayName: red ? "Restaurant A · A longer restaurant name" : "Restaurant B · မြန်မာအစားအစာဆိုင်",
    primaryColor: red ? "#A51D22" : "#086B64", secondaryColor: red ? "#FCEAE7" : "#D9F1EC", backgroundColor: red ? "#FFF8F0" : "#F4FAF9" };
  const management = ["OWNER", "MANAGER"].includes(role);
  const item = { id: uuid(11), productName: red ? "Vegetable rice with seasonal greens" : "ဟင်းသီးဟင်းရွက်အစုံနှင့် ထမင်းပန်းကန်",
    variantName: red ? "Regular" : "ပုံမှန်", quantity: 2, unitPrice: 6500, subtotal: 13000,
    specialInstruction: red ? "No peanuts.\nPlease pack the sauce separately." : "မြေပဲမထည့်ပါနှင့်။\nအချဉ်ရည်ကို သီးခြားထုပ်ပိုးပါ။", modifiers: [] };
  const order = { id: uuid(10), orderNumber: `SYNTHETIC-${letter.toUpperCase()}`, orderType: "TAKEAWAY", orderChannel: "STAFF",
    status: "PENDING", createdAt: "2026-11-21T10:00:00+06:30", subtotal: 13000, totalAmount: 13000, discountAmount: 0,
    deliveryFee: 0, queueTicketId: uuid(20), tableLabel: null, availableActions: ["ACCEPT", "CANCEL"], items: [item],
    statusHistory: [{ id: uuid(12), status: "PENDING", createdAt: "2026-11-21T10:00:00+06:30", changedByUserId: uuid(2), note: "Synthetic fixture" }] };
  const queue = [{ ticketId: uuid(20), orderId: order.id, displayCode: "SYN-017", status: "READY", createdAt: order.createdAt },
    { ticketId: uuid(21), orderId: uuid(22), displayCode: "SYN-018", status: "CALLED", createdAt: order.createdAt }];
  const task = { id: uuid(30), orderId: uuid(31), orderNumber: `SYNTHETIC-DELIVERY-${letter.toUpperCase()}`,
    driverUserId: uuid(2), driverName: "Synthetic assignee", status: "PICKED_UP", orderStatus: "OUT_FOR_DELIVERY", totalAmount: 14500,
    customerName: "Synthetic recipient", customerPhone: "Fixture contact", deliveryAddress: red ? "12 Fixture Street, Synthetic Township" : "စမ်းသပ်လမ်း၊ စမ်းသပ်မြို့နယ်",
    deliveryCity: "Fixture City", deliveryTownship: "Fixture Township", deliveryNote: "Call on arrival", assignedAt: order.createdAt,
    updatedAt: order.createdAt, pickedUpAt: order.createdAt, cashCollectionRequired: true, statusHistory: [] };
  const detail = { task, cashCollectionRequired: true, items: [item], pickup: { name: branding.displayName, address: "Synthetic pickup address", latitude: null, longitude: null },
    destination: { name: task.customerName, address: task.deliveryAddress, latitude: null, longitude: null } };
  const ready = data => ({ status: "ready", data });
  const counts = [1, 2, 1, 3, 1].map(ready);
  const settings = { acceptsOrders: true, allowQrOrder: true, allowDelivery: true, allowTakeaway: true,
    minimumOrder: 1500, defaultDeliveryFee: 500, currency: "MMK", timezone: "Asia/Yangon" };
  const categories = [{ id: uuid(50), name: red ? "Meals and seasonal specials" : "ထမင်းနှင့် ရာသီအလိုက်ဟင်းလျာများ", displayOrder: 0, active: true }];
  const products = [{ id: uuid(51), categoryId: categories[0].id,
    name: item.productName + " · " + item.productName, description: item.specialInstruction, price: 6500, imageUrl: null,
    available: true, trackStock: true, stockQuantity: 14, createdAt: order.createdAt, updatedAt: order.createdAt },
    { id: uuid(52), categoryId: categories[0].id, name: red ? "Soup · unavailable today" : "ဟင်းချို", description: null,
      price: 9007199254740991, imageUrl: "https://unsafe.example.test/photo.png#qrToken=blocked", available: false,
      trackStock: true, stockQuantity: 0, createdAt: order.createdAt, updatedAt: order.createdAt }];
  const groups = [{ id: uuid(55), name: red ? "Required selection\nChoose spice level" : "လိုအပ်သော ရွေးချယ်မှု\nအရသာရွေးချယ်ပါ", required: true, minSelections: 1, maxSelections: 1, active: true }];
  const members = [{ id: uuid(60), userId: uuid(2), fullName: "Synthetic Owner", email: "owner@example.test", role: "OWNER", createdAt: order.createdAt },
    { id: uuid(61), userId: uuid(3), fullName: "Synthetic current Manager", email: "manager@example.test", role: "MANAGER", createdAt: order.createdAt },
    { id: uuid(62), userId: uuid(4), fullName: "Synthetic Delivery Driver", email: "driver@example.test", role: "DELIVERY_DRIVER", createdAt: order.createdAt }];
  return { management, order, queue, detail, settings, categories, products, groups, members,
    finance: makeFinanceFixture(uuid, letter, settings),
    palette: { primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor, backgroundColor: branding.backgroundColor },
    restaurant: { id: uuid(1), name: branding.displayName, slug: `synthetic-${letter}`, description: "Synthetic restaurant fixture", address: "Fixture address", phone: null,
      township: "Synthetic Township", city: "Synthetic City", active: true, logoUrl: null },
    tables: [{ id: uuid(70), tableNumber: "Synthetic table with a longer label", active: true }, { id: uuid(71), tableNumber: "Inactive table", active: false }],
    zones: [{ id: uuid(80), restaurantId: uuid(1), name: "Canonical synthetic zone", deliveryFee: 500, minimumOrder: 1000, active: true,
      coverageCity: "Synthetic Region", coverageTownship: "Synthetic Township", regionId: uuid(81), districtId: uuid(82), townshipId: uuid(83), regionName: "Synthetic Region", districtName: "Synthetic District" },
    { id: uuid(84), restaurantId: uuid(1), name: "Legacy label · original preserved", deliveryFee: 9007199254740991, minimumOrder: 0, active: false,
      coverageCity: "Original legacy city", coverageTownship: "မူရင်းမြို့နယ် · Ambiguous township", regionId: null, districtId: null, townshipId: null }],
    payments: [{ id: uuid(40), method: "CASH_AT_COUNTER", status: "PENDING", amount: 13000, paidAt: null }],
    tenant: { restaurantId: uuid(1), apiBaseUrl: `https://api-${letter}.example.test`, environment: "development", branding, notificationsEnabled: false },
    access: { status: "ready", userId: uuid(2), membership: { restaurantId: uuid(1), active: true, role, name: branding.displayName } },
    dashboard: { orders: role === "DELIVERY_DRIVER" ? null : counts, queue: role === "DELIVERY_DRIVER" ? null : ready(queue),
      deliveries: ready(page([task])), assignment: management ? ready(1) : null, notifications: ready([]),
      daily: management ? ready({ reportDate: "2026-11-21", timezone: "Asia/Yangon", totalOrders: 9, completedOrders: 2, cancelledOrders: 1, orderAmountExcludingCancelled: 13000 }) : null },
  };
}

function makeFinanceFixture(uuid, letter, settings) {
  const date = "2026-11-21";
  const timestamp = `${date}T10:00:00+06:30`;
  const large = "9007199254740993";
  const sales = { from: date, to: date, grossSales: large, discounts: "0", netSales: large, collectedPayments: "8000",
    outstandingPayments: "9007199254732993", refundedAmounts: "500", orders: 2, cancelledOrders: 0, productsSold: 3, legacyRefundsWithoutEventTime: "100" };
  const product = { productId: uuid(51), historicalName: letter === "a" ? "Historical rice · original modifier price" : "ယခင်ထမင်းနှင့် ရွေးချယ်မှုဈေးနှုန်း", quantity: 3, lineSalesBeforeOrderDiscounts: large };
  const dashboard = { timezone: settings.timezone, currency: settings.currency, today: sales, selectedDay: sales,
    selectedMonth: { ...sales, from: "2026-11-01", to: "2026-11-30" }, selectedYear: { ...sales, from: "2026-01-01", to: "2026-12-31" },
    dailyTrend: [{ period: date, grossSales: large, discounts: "0", netSales: large, orders: 2, productsSold: 3 }],
    monthlyTrend: [{ period: "2026-10", grossSales: "7000", discounts: "0", netSales: "7000", orders: 1, productsSold: 2 },
      { period: "2026-11", grossSales: large, discounts: "0", netSales: large, orders: 2, productsSold: 3 }],
    topProducts: [product], definitions: { sales: "Synthetic order-cohort sales include unpaid orders; collections follow actual payment timestamps." },
    missingInputs: ["Synthetic legacy refund timestamp unavailable"] };
  const supplier = { id: uuid(100), name: `Synthetic ${letter.toUpperCase()} supplier · ပေးသွင်းသူ`, contact: "Synthetic contact only", active: true,
    createdBy: uuid(2), createdAt: timestamp, updatedBy: uuid(2), updatedAt: timestamp };
  const item = { id: uuid(101), name: "Rice · ဆန်", defaultUnit: "kg", defaultQuantity: null, supplierId: null, suggestionEnabled: true,
    latestUnitCost: "200", latestCostUnit: "kg", lastConfirmedPurchaseDate: date, suggested: true, createdBy: uuid(2), createdAt: timestamp, updatedBy: uuid(2), updatedAt: timestamp };
  const sheet = { id: uuid(102), shoppingDate: date, status: "PLANNED", paymentStatus: "UNPAID", purchaseId: null,
    lines: [{ id: uuid(103), itemId: item.id, itemName: item.name, quantity: "1.5", unit: "kg" }],
    createdBy: uuid(2), createdAt: timestamp, updatedBy: uuid(2), updatedAt: timestamp };
  const purchase = { purchase: { id: uuid(104), purchaseDate: date, purchasedAt: timestamp, supplierId: supplier.id, supplierName: supplier.name,
    totalAmount: large, amountPaid: "100", outstandingAmount: "9007199254740893", paymentStatus: "PARTIALLY_PAID", status: "CONFIRMED",
    dueDate: "2026-11-30", invoiceReference: "SYNTHETIC-INVOICE", receiptId: null, correctionOfId: null, createdBy: uuid(2), createdAt: timestamp },
    lines: [{ id: uuid(105), itemId: item.id, itemName: "Historical rice · ဆန်", quantity: "1.5", unit: "kg", unitCost: "6004799503160662", lineTotal: large, supplierId: supplier.id }],
    payments: [{ id: uuid(106), amount: "100", method: "CASH", paidAt: timestamp, createdBy: uuid(2), createdAt: timestamp, reversalId: null, reversalReason: null, reversedBy: null, reversedAt: null }], cancellations: [], corrections: [] };
  const expense = { id: uuid(107), category: "RENT", expenseDate: date, amount: large, description: "Synthetic operating obligation · ငှားရမ်းခ",
    payee: "Synthetic landlord", status: "POSTED", paymentStatus: "PARTIALLY_PAID", paidAmount: "100", outstandingAmount: "9007199254740893", receiptId: null,
    createdBy: uuid(2), createdAt: timestamp };
  const cash = [{ id: uuid(108), source: "SALES_PAYMENT", sourceId: uuid(109), signedAmount: "8000", occurredAt: timestamp, description: "Synthetic actual cash receipt", recordedBy: uuid(2) },
    { id: uuid(110), source: "PURCHASE_PAYMENT", sourceId: uuid(106), signedAmount: "-100", occurredAt: timestamp, description: "Synthetic actual purchase cash payment", recordedBy: uuid(2) }];
  const closing = { id: uuid(111), date: "2026-11-20", revision: 1, expectedCash: large, actualCash: "9007199254740994", variance: "1", closedAt: timestamp,
    responsibleMember: uuid(2), reconciliationNote: "Synthetic counted cash includes driver-held cash", reversedAt: null, reversedBy: null, reversalReason: null };
  return { report: { restaurantId: uuid(1), from: date, to: date, timezone: settings.timezone, currency: settings.currency, reportType: "CASH_FLOW_AND_EXPENSE_SUMMARY",
    sales, confirmedPurchases: large, registeredOperatingExpenses: large, purchasePayments: "100", expensePayments: "100", tradingPaymentNet: "7300",
    expensesByCategory: [{ category: "RENT", amount: large }], costOfGoodsSold: null, grossProfit: null, netOperatingProfit: null,
    missingInputs: ["Inventory consumption and complete historical costs are unavailable"] }, dashboard, item, sheet, supplier, purchase, expense, cash, closing,
    payable: { supplierId: supplier.id, supplierName: supplier.name, confirmedObligations: large, amountPaid: "100", outstandingAmount: "9007199254740893", earliestUnpaidDueDate: "2026-11-30" },
    purchaseReport: { from: date, to: date, confirmedTotal: large, cancelledTotal: "0", purchaseCount: 1, monthlyTotals: [{ month: "2026-11", confirmedTotal: large, purchaseCount: 1 }] },
    expenseReport: { from: date, to: date, totals: [{ periodStart: date, category: "RENT", postedAmount: large, cancelledAmount: "0", expenseAmount: large }] },
    day: { date, timezone: settings.timezone, openingBalance: null, expectedClosingCash: null, cashSalesReceived: "8000", cashRefundsPaid: "500",
      cashPurchasePayments: "100", cashExpensePayments: "100", otherReceipts: "0", otherPayments: "0",
      missingInputs: ["Initial counted opening is missing; synthetic historical input is unknown"], closing: null },
    audit: [{ id: uuid(112), actorId: uuid(2), entityType: "PURCHASE", entityId: uuid(104), action: "CONFIRM", reason: "Synthetic confirmed goods", detailJson: "{}", createdAt: timestamp }],
    sale: { id: uuid(113), orderNumber: `SYNTHETIC-SALE-${letter.toUpperCase()}`, createdAt: timestamp, createdByUserId: null, orderChannel: "STAFF", orderType: "TAKEAWAY", status: "COMPLETED",
      tableId: null, tableNumber: null, queueTicketId: null, queueDisplayCode: null, subtotal: large, deliveryFee: "0", discountAmount: "0", totalAmount: large, paymentStatus: "UNPAID",
      lines: [{ id: uuid(114), productId: product.productId, productName: product.historicalName, variantId: null, variantName: null, quantity: 1, unitPrice: large, lineDiscount: "0", lineTotal: large, modifiers: [] }],
      payments: [], refunds: [], refundReversals: [], timeline: [] } };
}

try {
  const finance = require(path.join(appRoot, "src/features/accounting/financial-requests.ts"));
  const keys = () => new finance.FinancialRequestKeys();
  const wrapPage = (title, Component, props) => () => h(require(path.join(appRoot, "src/components/ui.tsx")).Page, { title }, h(Component, typeof props === "function" ? props() : props));
  const screens = financeMode ? {
    finance: require(path.join(appRoot, "src/features/accounting/AccountingScreen.tsx")).AccountingScreen,
    summary: wrapPage("Financial summary", require(path.join(appRoot, "src/features/operations/ReportsScreen.tsx")).FinancialSummaryScreen),
    shopping: require(path.join(appRoot, "src/features/accounting/ShoppingScreen.tsx")).ShoppingScreen,
    purchasing: require(path.join(appRoot, "src/features/accounting/PurchasingScreen.tsx")).PurchasingScreen,
    purchases: wrapPage("Purchase history", require(path.join(appRoot, "src/features/accounting/PurchaseScreens.tsx")).PurchaseHistory, () => ({ today: "2026-11-21", requests: keys(), onReplace: noop })),
    purchase_detail: wrapPage("Purchase detail", require(path.join(appRoot, "src/features/accounting/PurchaseScreens.tsx")).PurchaseDetailScreen, () => ({ id: fixture.finance.purchase.purchase.id, requests: keys(), onBack: noop, onChanged: noop, onSelectPurchase: noop, onReplace: noop })),
    payables: wrapPage("Supplier payables", require(path.join(appRoot, "src/features/accounting/SupplierScreens.tsx")).Payables),
    sales: wrapPage("Sales reports", require(path.join(appRoot, "src/features/accounting/SalesDashboardPanel.tsx")).SalesDashboardPanel),
    sales_history: require(path.join(appRoot, "src/features/accounting/SalesLedgerScreen.tsx")).SalesLedgerScreen,
    expenses: () => h(require(path.join(appRoot, "src/features/accounting/ExpenseCashScreens.tsx")).ExpenseScreen, { requestKeys: keys() }),
    cashbook: () => h(require(path.join(appRoot, "src/features/accounting/CashbookScreens.tsx")).CashbookScreen, { requestKeys: keys() }),
    closing: () => h(require(path.join(appRoot, "src/features/accounting/CashbookScreens.tsx")).DailyCashClosingScreen, { requestKeys: keys() }),
    audit: require(path.join(appRoot, "src/features/accounting/AccountingAuditScreen.tsx")).AccountingAuditScreen,
    exports: wrapPage("Private exports", require(path.join(appRoot, "src/features/accounting/ExportReportsScreen.tsx")).ExportReportsScreen),
  } : catalogMode ? {
    menu: require(path.join(appRoot, "src/features/menu/MenuScreen.tsx")).MenuScreen,
    settings: require(path.join(appRoot, "src/features/management/SettingsScreen.tsx")).SettingsScreen,
    team: require(path.join(appRoot, "src/features/management/TeamScreen.tsx")).TeamScreen,
    tables: require(path.join(appRoot, "src/features/management/TablesScreen.tsx")).TablesScreen,
    zones: () => {
      const { Page, StateView } = require(path.join(appRoot, "src/components/ui.tsx"));
      const { DeliveryConfiguration, ZoneEditor } = require(path.join(appRoot, "src/features/operations/DeliveryConfiguration.tsx"));
      return h(Page, { title: "Delivery zones" }, fixture.management
        ? [h(DeliveryConfiguration, { key: "configuration" }), ...fixture.zones.map(zone => h(ZoneEditor, { key: zone.id, zone, restaurantId: fixture.tenant.restaurantId, reload: noop }))]
        : h(StateView, { kind: "forbidden", message: "Only the restaurant Owner or Manager can configure coverage." }));
    },
  } : {
    dashboard: require(path.join(appRoot, "src/features/operations/DashboardScreen.tsx")).DashboardScreen,
    orders: require(path.join(appRoot, "src/features/operations/OrdersScreen.tsx")).OrdersScreen,
    queue: require(path.join(appRoot, "src/features/operations/QueueScreen.tsx")).QueueScreen,
    deliveries: require(path.join(appRoot, "src/features/operations/DeliveriesScreen.tsx")).DeliveriesScreen,
    order: () => h(require(path.join(appRoot, "src/features/operations/OrderDetailScreen.tsx")).OrderDetailScreen, { orderId: fixture.order.id }),
    delivery: () => h(require(path.join(appRoot, "src/features/operations/DeliveryDetailScreen.tsx")).DeliveryDetailScreen, { deliveryId: fixture.detail.task.id }),
  };
  const Layout = require(path.join(appRoot, "app/(workspace)/_layout.tsx")).default;
  const { ThemeProvider } = require(path.join(appRoot, "src/components/ui.tsx"));
  const { ScreenGuard } = require(path.join(appRoot, "src/navigation/ScreenGuard.tsx"));
  fs.mkdirSync(output, { recursive: true });
  const links = [];
  for (const tenant of ["a", "b"]) for (const role of ["OWNER", "MANAGER", "STAFF", "DELIVERY_DRIVER"]) for (const width of [320, 720]) for (const scale of [1, 2]) {
    for (const [name, component] of Object.entries(screens)) {
      if (role === "DELIVERY_DRIVER" && ["orders", "queue", "order"].includes(name)) continue;
      fixture = makeFixture(tenant, role); Screen = financeMode ? () => h(ScreenGuard, { screenId: "accounting" }, h(component)) : component; previewWidth = width; fontScale = scale;
      route = name === "order" ? `/order/${fixture.order.id}` : name === "delivery" ? `/delivery/${fixture.detail.task.id}` : `/${name}`;
      const markup = renderToStaticMarkup(h(ThemeProvider, { restaurantId: fixture.tenant.restaurantId, branding: fixture.tenant.branding }, h(Layout)));
      if (financeMode && !fixture.management && (markup.includes("9,007,199,254") || !markup.includes("Screen unavailable"))) throw new Error("Finance preview denial leaked or failed");
      const filename = `${tenant}-${role.toLowerCase()}-${name}-${width}-${scale * 100}.html`;
      const title = `Restaurant ${tenant.toUpperCase()} · ${role} · ${name} · ${width}px · ${scale * 100}% text`;
      const theme = resolveThemeTokens(fixture.tenant.branding);
      fs.writeFileSync(path.join(output, filename), `<!doctype html><html lang="${tenant === "a" ? "en" : "my"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#dce1e7;font-family:Arial,'Myanmar Text',sans-serif}button{margin:0;text-align:left;border:0;background:none;padding:0}img{max-width:100%}.preview-note{flex-shrink:0;padding:8px;font-size:12px;background:#17212e;color:white}.device{width:${width}px;max-width:100vw;flex:1;min-height:0;margin:0 auto;background:${theme.color.background};display:flex;flex-direction:column}.device>div{min-height:0;flex:1;overflow:hidden}a{color:inherit}</style><div class="preview-note"><a href="index.html">All previews</a> · ${title}<br>Actual Operations TSX · synthetic data · static DOM approximation · no Android acceptance</div><main class="device">${markup}</main></html>`);
      links.push(`<li><a href="${filename}">${title}</a></li>`);
    }
  }
  fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html><meta charset="utf-8"><title>UXI-${financeMode ? "12" : catalogMode ? "11" : "10"} Operations DOM previews</title><h1>Operations DOM approximations</h1><p>${links.length} actual-TSX static previews, synthetic restaurants A/B, red/teal, four roles, 320/720px, 100/200% text. No live API, device, keyboard, TalkBack or Figma acceptance claim. Dialog and editor interaction states are covered by component tests, not this SSR. ${financeMode ? "Purchasing initial recovery is intentionally still checking because SSR does not run effects. Actual purchase history/detail are separate specimens. No real financial action or CSV download can run." : ""}</p><ul>${links.join("")}</ul></html>`);
  console.log(`Generated ${links.length} Operations DOM approximation previews in ${output}`);
} finally {
  Module._load = originalLoad;
  if (oldTs) require.extensions[".ts"] = oldTs; else delete require.extensions[".ts"];
  if (oldTsx) require.extensions[".tsx"] = oldTsx; else delete require.extensions[".tsx"];
  if (oldPng) require.extensions[".png"] = oldPng; else delete require.extensions[".png"];
}

if (process.argv.includes("--serve")) {
  const port = financeMode ? 4183 : catalogMode ? 4181 : 4179;
  require("node:http").createServer((request, response) => {
    const basename = path.basename(new URL(request.url, "http://127.0.0.1").pathname) || "index.html";
    if (!/^(?:index|[ab]-(?:owner|manager|staff|delivery_driver)-(?:dashboard|orders|queue|deliveries|order|delivery|menu|settings|team|tables|zones|finance|summary|shopping|purchasing|purchases|purchase_detail|payables|sales|sales_history|expenses|cashbook|closing|audit|exports)-(?:320|720)-(?:100|200))\.html$/.test(basename)) {
      response.writeHead(404); response.end("Not found"); return;
    }
    const stream = fs.createReadStream(path.join(output, basename));
    stream.on("error", () => { if (!response.headersSent) response.writeHead(404); response.end("Not found"); });
    stream.on("open", () => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      stream.pipe(response);
    });
  }).listen(port, "127.0.0.1", () => console.log(`Operations DOM preview: http://127.0.0.1:${port}/index.html`));
}
