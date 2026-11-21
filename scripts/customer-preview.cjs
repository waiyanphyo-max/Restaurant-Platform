"use strict";

/**
 * Read-only presentation fixture for UXI-08. Runs the real Customer TSX through
 * React DOM SSR and a deliberately small React Native adapter. This is a DOM
 * approximation, not evidence of Android, font, keyboard or TalkBack acceptance.
 * No live auth, API, native configuration or persisted user data is loaded.
 * Run: node scripts/customer-preview.cjs [--lifecycle] [--serve]
 */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { resolveThemeTokens } = require("@restaurant-platform/ui-tokens");
const appRoot = path.resolve(__dirname, "../apps/customer-mobile");
const root = path.resolve(__dirname, "..");
const lifecycle = process.argv.includes("--lifecycle");
const milestone = lifecycle ? "UXI-09" : "UXI-08";
const output = path.join(root, lifecycle ? "target/uxi-09-preview" : "target/uxi-08-preview");
const ts = Module.createRequire(path.join(appRoot, "package.json"))("typescript");
const h = React.createElement;
const noop = () => {};
let fixture;
let route = "/home";
let fontScale = 1;
let previewWidth = 360;
let Screen;
let scenario;

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
const content = () => h(Screen);
const accountPort = () => ({ state: { status: "ready", data: fixture.account }, reload: noop,
  editAddress: noop, dismissOnboarding: noop, editingAddress: scenario === "legacy" ? fixture.legacyAddress : null });
const cartPort = () => ({ lines: fixture.lines, unavailable: [], items: fixture.lines.map(line => line.item),
  saveLine: () => false, remove: noop, clear: noop, replace: noop });
const mocks = {
  "tenant.ts": { readEmbeddedTenant: () => fixture.tenant },
  "auth/AuthProvider.tsx": { useCustomerAuth: () => ({ state: { status: "signed_in", userId: fixture.account.profile.id },
    phoneEnabled: false, emailRecoveryEnabled: false, signOut: noop }), CustomerAuthProvider: props => props.children },
  "branding/RuntimeBrandingProvider.tsx": { useRuntimeBranding: () => ({ displayName: fixture.tenant.branding.displayName,
    logoUrl: null, refresh: async () => true }) },
  "features/profile/AccountProvider.tsx": { useCustomerAccount: accountPort, CustomerAccountProvider: props => props.children,
    homeAddress: addresses => addresses.find(address => address.label.toLowerCase() === "home") },
  "features/cart/CartProvider.tsx": { useCustomerCart: cartPort, CustomerCartProvider: props => props.children },
  "features/checkout/CheckoutProvider.tsx": { useCustomerCheckout: () => ({ state: !lifecycle ? { status: "uncertain" }
    : scenario === "uncertain" ? { status: "uncertain", attempt: fixture.attempt }
      : scenario === "receipt" ? { status: "created", order: fixture.receipt } : { status: "idle" },
    reset: noop, submit: noop, recover: noop, abandonPrevious: noop }),
    CustomerCheckoutProvider: props => props.children },
  "hooks/useApiQuery.ts": { useApiQuery: (_query, key) => ({ state: { status: "ready",
    data: key.startsWith("orders:") ? { content: [fixture.order], last: true, number: 0, totalPages: 1 }
      : key.startsWith("order:") ? fixture.order : [] }, reload: noop }) },
  "features/storefront/MenuProvider.tsx": { usePublicMenu: () => ({ state: { status: "ready", data: fixture.menu }, reload: noop }),
    CustomerMenuProvider: props => props.children },
  "api.ts": { getCustomerApi: () => { throw new Error("Preview blocks all private API access"); },
    getCustomerPublicApi: () => { throw new Error("Preview blocks all public API access"); } },
  "notifications/native.ts": { enableCustomerNotifications: noop, retryCustomerDeviceCleanup: noop },
};
const originalLoad = Module._load;
const oldTs = require.extensions[".ts"];
const oldTsx = require.extensions[".tsx"];
const oldPng = require.extensions[".png"];
Module._load = function(request, parent, isMain) {
  if (request === "react-native") return native;
  if (request === "react-native-safe-area-context") return { SafeAreaView: View, SafeAreaProvider: View };
  if (request === "expo-router") return { Slot: content, Redirect: () => null,
    usePathname: () => route, useLocalSearchParams: () => ({ productId: fixture.product.id, orderId: fixture.order?.id }), useFocusEffect: noop,
    useRouter: () => ({ navigate: noop, push: noop, replace: noop }) };
  if (request === "react-native-maps") return { __esModule: true, default: View, Marker: View, PROVIDER_GOOGLE: "preview" };
  if (request === "expo-location") return {};
  if (request.startsWith(".")) {
    const resolved = Module._resolveFilename(request, parent);
    for (const [suffix, mock] of Object.entries(mocks)) {
      if (resolved === path.join(appRoot, "src", suffix)) return mock;
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};
const compile = (module, filename) => {
  if (!filename.startsWith(appRoot + path.sep)) throw new Error(`Preview cannot transpile non-Customer source: ${filename}`);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { fileName: filename, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } });
  module._compile(compiled.outputText, filename);
};
require.extensions[".ts"] = compile;
require.extensions[".tsx"] = compile;
require.extensions[".png"] = (module, filename) => { module.exports = `data:image/png;base64,${fs.readFileSync(filename).toString("base64")}`; };

function makeFixture(letter) {
  const red = letter === "a";
  const prefix = red ? "00000000-0000-4000-8000-00000000" : "10000000-0000-4000-8000-00000000";
  const uuid = number => prefix + String(number).padStart(4, "0");
  const branding = { displayName: red ? "Restaurant A · A longer restaurant name" : "Restaurant B · မြန်မာအစားအစာဆိုင်",
    primaryColor: red ? "#A51D22" : "#086B64", secondaryColor: red ? "#FCEAE7" : "#D9F1EC", backgroundColor: red ? "#FFF8F0" : "#F4FAF9" };
  const product = { id: uuid(10), name: red ? "Garden rice bowl with seasonal vegetables" : "ဟင်းသီးဟင်းရွက်အစုံနှင့် ထမင်းပန်းကန်",
    description: red ? "Freshly prepared with your choice of portion and configured extras." : "လတ်ဆတ်သော ဟင်းသီးဟင်းရွက်များဖြင့် ပြင်ဆင်ထားပါသည်။ အမျိုးကွဲနှင့် အပိုပစ္စည်းများကို ရွေးချယ်ပါ။",
    price: null, imageUrl: null, available: true, trackStock: true, stockQuantity: 12,
    variants: [{ id: uuid(11), name: red ? "Regular" : "ပုံမှန်", price: 6500, imageUrl: null, available: true },
      { id: uuid(12), name: red ? "Large" : "အကြီး", price: 8500, imageUrl: null, available: true }],
    modifierGroups: [{ id: uuid(13), name: red ? "Preparation" : "ပြင်ဆင်ပုံ", required: true, minSelections: 1, maxSelections: 1,
      options: [{ id: uuid(14), name: red ? "Mild" : "မစပ်", additionalPrice: 0, available: true },
        { id: uuid(15), name: red ? "Spicy" : "အစပ်", additionalPrice: 500, available: true }] },
      { id: uuid(16), name: red ? "Extras" : "အပိုပစ္စည်းများ", required: false, minSelections: 0, maxSelections: 2,
        options: [{ id: uuid(17), name: red ? "Extra vegetables" : "ဟင်းသီးဟင်းရွက် ထပ်ထည့်ရန်", additionalPrice: 800, available: true },
          { id: uuid(18), name: red ? "Egg (unavailable)" : "ကြက်ဥ (မရနိုင်ပါ)", additionalPrice: 1000, available: false }] }],
  };
  const noPhoto = { ...product, id: uuid(20), name: red ? "Soup of the day" : "ယနေ့အတွက် ဟင်းချို", price: 3000,
    imageUrl: null, variants: [], modifierGroups: [], trackStock: false, stockQuantity: null };
  const soldOut = { ...noPhoto, id: uuid(21), name: red ? "Seasonal noodles · sold out" : "ရာသီပေါ် ခေါက်ဆွဲ · ကုန်နေပါသည်", available: false };
  const menu = { restaurantId: uuid(1), restaurantName: branding.displayName, currency: "MMK", description: null,
    categories: [{ id: uuid(2), name: red ? "Meals" : "အစားအစာများ", displayOrder: 0, products: [product, noPhoto] },
      { id: uuid(3), name: red ? "Seasonal" : "ရာသီပေါ် အစားအစာများ", displayOrder: 1, products: [soldOut] }],
    featuredProduct: { productId: product.id, status: "AVAILABLE" } };
  const account = { profile: { id: uuid(50), fullName: red ? "Synthetic Customer A" : "စမ်းသပ်အသုံးပြုသူ B", phone: "09123456789", preferredLanguage: red ? "en" : "my-MM" },
    addresses: [{ id: uuid(60), label: "Home", recipientName: red ? "Synthetic Customer A" : "စမ်းသပ်အသုံးပြုသူ B", houseNo: "12",
      street: red ? "Fixture Street" : "စမ်းသပ်လမ်း", ward: "Ward 3", township: red ? "Fixture Township" : "စမ်းသပ်မြို့နယ်", city: "Fixture City", isDefault: true,
      latitude: null, longitude: null, deliveryNote: red ? "Call on arrival" : "ရောက်လျှင် ဖုန်းဆက်ပါ" }] };
  const lines = [{ id: "fixture-line-1", name: product.name, variantName: product.variants[0].name, modifierNames: [product.modifierGroups[0].options[0].name],
    unitPrice: 6500, currency: "MMK", item: { productId: product.id, variantId: uuid(11), quantity: 2,
      modifiers: [{ modifierOptionId: uuid(14), quantity: 1 }], specialInstruction: red ? "Please pack carefully" : "သေချာထုပ်ပိုးပေးပါ" } }];
  const saved = account.addresses[0];
  saved.recipientPhone = account.profile.phone;
  Object.assign(saved, { regionId: uuid(70), districtId: uuid(71), townshipId: uuid(72), regionName: "Fixture Region", districtName: "Fixture District" });
  const legacyAddress = { ...saved, regionId: null, districtId: null, townshipId: null };
  const order = { id: uuid(80), orderNumber: `SYNTHETIC-${letter.toUpperCase()}`, createdAt: "2026-11-21T03:00:00Z",
    status: "COMPLETED", orderType: "DELIVERY", currency: "MMK", subtotal: 13000, deliveryFee: 1500,
    discountAmount: 0, totalAmount: 14500, canCancel: false, deliveryAddress: [saved.houseNo, saved.street, saved.ward, saved.township].join(", "),
    deliveryName: saved.recipientName, deliveryPhone: saved.recipientPhone, deliveryNote: saved.deliveryNote,
    deliveryLatitude: null, deliveryLongitude: null, deliveryLocationSource: "SAVED_ADDRESS",
    items: [{ id: uuid(81), productId: product.id, productName: product.name, variantId: uuid(11), variantName: product.variants[0].name,
      quantity: 2, unitPrice: 6500, subtotal: 13000, specialInstruction: lines[0].item.specialInstruction,
      modifiers: [{ id: uuid(83), modifierOptionId: uuid(14), name: product.modifierGroups[0].options[0].name, quantity: 1, additionalPrice: 0 }] }],
    payments: [{ id: uuid(82), method: "CASH_ON_DELIVERY", status: red ? "PENDING" : "PAID", amount: 14500 }],
    statusHistory: [{ status: "PENDING", changedAt: "2026-11-21T03:00:00Z" }, { status: "COMPLETED", changedAt: "2026-11-21T03:25:00Z" }],
    delivery: { status: "DELIVERED", statusHistory: [{ status: "DELIVERED", changedAt: "2026-11-21T03:40:00Z" }] } };
  const receipt = { orderId: order.id, orderNumber: order.orderNumber, totalAmount: order.totalAmount, currency: order.currency,
    createdAt: order.createdAt, status: "PENDING" };
  const attempt = { body: { items: lines.map(line => line.item), addressId: saved.id, recipientName: saved.recipientName,
    recipientPhone: saved.recipientPhone, confirmationToken: "synthetic-confirmation" },
    quote: { destination: { address: order.deliveryAddress }, idempotencyKey: "synthetic-original-key" } };
  const quote = { restaurantName: branding.displayName, currency: "MMK", subtotal: order.subtotal, deliveryFee: order.deliveryFee,
    discountAmount: order.discountAmount, totalAmount: order.totalAmount, lines: order.items,
    destination: { address: order.deliveryAddress, recipientName: saved.recipientName, recipientPhone: saved.recipientPhone,
      township: saved.township, city: saved.city, regionName: saved.regionName, districtName: saved.districtName,
      deliveryNote: saved.deliveryNote, latitude: null, longitude: null }, confirmationToken: "synthetic-confirmation", idempotencyKey: "synthetic-original-key" };
  return { menu, product, lines, account, legacyAddress, order, receipt, attempt, quote,
    tenant: { restaurantId: uuid(1), apiBaseUrl: `https://api-${letter}.example.test`, environment: "development", branding, notificationsEnabled: false } };
}

try {
  const { HomeScreen, MenuScreen } = require(path.join(appRoot, "src/features/storefront/Storefront.tsx"));
  const { ProductScreen } = require(path.join(appRoot, "src/features/storefront/ProductScreen.tsx"));
  const { CartScreen } = require(path.join(appRoot, "src/features/cart/CartScreen.tsx"));
  const { ProfileScreen } = require(path.join(appRoot, "src/features/profile/ProfileScreen.tsx"));
  const StoreLayout = require(path.join(appRoot, "app/(store)/_layout.tsx")).default;
  const { ThemeProvider } = require(path.join(appRoot, "src/components/ui.tsx"));
  const screens = { home: HomeScreen, menu: MenuScreen, product: ProductScreen, cart: CartScreen, account: ProfileScreen };
  if (lifecycle) {
    for (const name of Object.keys(screens)) delete screens[name];
    const Address = require(path.join(appRoot, "app/(store)/address.tsx")).default;
    const Checkout = require(path.join(appRoot, "app/(store)/checkout.tsx")).default;
    const { QuoteReview } = require(path.join(appRoot, "src/features/checkout/CheckoutScreen.tsx"));
    const { Page } = require(path.join(appRoot, "src/components/ui.tsx"));
    Object.assign(screens, { address: Address, legacy: Address, checkout: Checkout, uncertain: Checkout, receipt: Checkout,
      quote: () => h(Page, { title: fixture.account.profile.preferredLanguage === "en" ? "Review & confirm" : "စစ်ဆေးပြီး အတည်ပြုရန်" },
        h(QuoteReview, { quote: fixture.quote, locationLabel: "Home", onSubmit: noop, onChange: noop })),
      orders: require(path.join(appRoot, "app/(store)/orders.tsx")).default,
      order: require(path.join(appRoot, "app/(store)/order/[orderId].tsx")).default });
  }
  fs.mkdirSync(output, { recursive: true });
  const links = [];
  for (const tenant of ["a", "b"]) for (const width of [360, 720]) for (const scale of [1, 2]) for (const [name, component] of Object.entries(screens)) {
    fixture = makeFixture(tenant); Screen = component; scenario = name; fontScale = scale; previewWidth = width;
    route = name === "account" ? "/profile" : name === "product" ? `/product/${fixture.product.id}`
      : name === "order" ? `/order/${fixture.order.id}` : name === "legacy" ? "/address"
        : ["uncertain", "receipt", "quote"].includes(name) ? "/checkout" : `/${name}`;
    const markup = renderToStaticMarkup(h(ThemeProvider, { restaurantId: fixture.tenant.restaurantId, branding: fixture.tenant.branding }, h(StoreLayout)));
    const filename = `${tenant}-${name}-${width}-${scale * 100}.html`;
    const title = `Restaurant ${tenant.toUpperCase()} · ${name} · ${width}px · ${scale * 100}% text`;
    const theme = resolveThemeTokens(fixture.tenant.branding);
    const html = `<!doctype html><html lang="${tenant === "a" ? "en" : "my"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#dce1e7;font-family:Arial,'Myanmar Text',sans-serif}button{margin:0;text-align:left;border:0;background:none;padding:0}img{max-width:100%}.preview-note{flex-shrink:0;padding:12px;font-size:14px;background:#17212e;color:white;line-height:1.5}.device{width:${width}px;max-width:100vw;flex:1;min-height:0;margin:0 auto;background:${theme.color.background};display:flex;flex-direction:column}.device>div{min-height:0;flex:1;overflow:hidden}a{color:inherit}</style><div class="preview-note"><a href="index.html">All previews</a> · ${title}<br>Actual Customer TSX, synthetic fixtures, DOM approximation. Static controls and no-image fixtures. No Android/device acceptance.</div><main class="device">${markup}</main></html>`;
    fs.writeFileSync(path.join(output, filename), html);
    links.push(`<li><a href="${filename}">${title}</a></li>`);
  }
  fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html><meta charset="utf-8"><title>${milestone} Customer DOM previews</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:1000px;margin:32px auto;padding:0 24px}</style><h1>${milestone} Customer DOM previews</h1><p>These ${links.length} previews render actual screen and shared-shell TSX with synthetic, isolated two-tenant providers. The adapter approximates native flexbox and font scaling. Controls are static. These fixtures exercise the actual no-image fallback; image load and failure transitions require separate component or native checks. This does not establish Android typography, keyboard, device, TalkBack or final Figma acceptance.</p><p>Restaurant A uses a red palette and English. Restaurant B uses teal and Burmese. Each screen has 360/720px and 100/200% text cases. ${lifecycle ? "Historical delivered A remains COD pending; B records a paid COD response. Address geography is loading in this static renderer. Maps and live APIs are disabled." : "Checkout recovery is intentionally visible."}</p><ul>${links.join("")}</ul></html>`);
  console.log(`Generated ${links.length} actual-TSX DOM approximation previews in ${output}`);
} finally {
  Module._load = originalLoad;
  if (oldTs) require.extensions[".ts"] = oldTs; else delete require.extensions[".ts"];
  if (oldTsx) require.extensions[".tsx"] = oldTsx; else delete require.extensions[".tsx"];
  if (oldPng) require.extensions[".png"] = oldPng; else delete require.extensions[".png"];
}

if (process.argv.includes("--serve")) {
  const http = require("node:http");
  http.createServer((request, response) => {
    const basename = path.basename(new URL(request.url, "http://127.0.0.1").pathname) || "index.html";
    if (!/^(?:index|[ab]-(?:home|menu|product|cart|account|address|legacy|checkout|uncertain|receipt|quote|orders|order)-(?:360|720)-(?:100|200))\.html$/.test(basename)) {
      response.writeHead(404); response.end("Not found"); return;
    }
    const file = path.join(output, basename);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(response);
  }).listen(4178, "127.0.0.1", () => console.log("Customer DOM approximation preview: http://127.0.0.1:4178/index.html"));
}
