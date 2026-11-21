import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAddressResponse, DeliveryQuoteRequest, DeliveryQuoteResponse } from "@restaurant-platform/shared-types";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { CustomerAccount } from "../profile/AccountProvider";
import type { CheckoutAttempt } from "./CheckoutProvider";
import type { QueryState } from "../../hooks/useApiQuery";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0,
  quote: vi.fn(), submit: vi.fn(), abandon: vi.fn(), reset: vi.fn(), locate: vi.fn(), reloadZones: vi.fn(), map: true, language: "en",
  zoneState: { status: "loading" } as QueryState<unknown[]>,
  addresses: null as CustomerAddressResponse[] | null,
  items: [{ productId: "product", quantity: 1 }],
  displayName: "Current Restaurant A",
  checkoutState: { status: "idle" } as { status: "idle" } | { status: "uncertain"; attempt: CheckoutAttempt }
}));
vi.mock("react", async load => ({
  ...await load<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.state++;
    if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? initial() : initial;
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = harness.ref++;
    return harness.refs[index] ??= { current: initial };
  },
  useEffect: vi.fn()
}));
vi.mock("react-native", () => ({ Text: "Text" }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", Page: "Page", StateView: "StateView" }));
vi.mock("../../i18n", () => ({ useCustomerLanguage: () => harness.language,
  localize: (language: string, en: string, my: string) => language === "en" ? en : my,
  useCustomerText: () => (en: string, my: string) => harness.language === "en" ? en : my }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ mapsConfigured: harness.map, branding: { displayName: "Restaurant" } }) }));
vi.mock("../../branding/RuntimeBrandingProvider", () => ({ useRuntimeBranding: () => ({ displayName: harness.displayName }) }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ quoteDelivery: harness.quote }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: () => ({ state: harness.zoneState, reload: harness.reloadZones }) }));
vi.mock("../../components/LocationSelector", () => ({ LocationSelector: "LocationSelector" }));
vi.mock("../addresses/AddressMap", () => ({ AddressMap: "AddressMap" }));
vi.mock("../addresses/DestinationPin", () => ({ DestinationPin: "DestinationPin" }));
vi.mock("../addresses/native-location", () => ({ suggestCurrentLocation: harness.locate }));
vi.mock("../cart/CartProvider", () => {
  return { useCustomerCart: () => ({ items: harness.items }) };
});
vi.mock("./CheckoutProvider", () => ({ useCustomerCheckout: () => ({ state: harness.checkoutState, submit: harness.submit,
  abandonPrevious: harness.abandon, reset: harness.reset }) }));

import { LocationSelectionError, type Coordinates, type PinSelection } from "../addresses/location";
import { CheckoutScreen } from "./CheckoutScreen";
import { normalizeRecipientPhone } from "./destination";

const home = Object.freeze<CustomerAddressResponse>({ regionId: "region", districtId: "district", townshipId: "township", regionName: "Yangon", districtName: "East Yangon", id: "home", label: "Home", recipientName: "Customer", houseNo: "12",
  street: "Main Rd", ward: "Ward 1", township: "Tamwe", city: "Yangon", latitude: 16.8, longitude: 96.1, deliveryNote: "Home gate",
  isDefault: true, createdAt: "", updatedAt: "" });
const work = { ...home, id: "work", label: "Work", isDefault: false, deliveryNote: "Office" };
const account: CustomerAccount = { addresses: [work, home], profile: { id: "me", fullName: "Profile", phone: "09123456789",
  preferredLanguage: "en", createdAt: "", updatedAt: "", avatarUrl: null } };
const point = { latitude: 16.91, longitude: 96.17 };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function render() {
  harness.state = 0; harness.ref = 0;
  return CheckoutScreen({ account: { ...account, addresses: harness.addresses ?? account.addresses }, onCart: vi.fn(), onOrders: vi.fn(), onOrder: vi.fn() });
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}

function press(title: string) {
  const button = elements(render()).find(el => el.type === "Action" && el.props.title === title);
  expect(button?.props.disabled).toBeFalsy();
  (button!.props.onPress as () => void)();
}

function field(label: string, value: string) {
  const input = elements(render()).find(el => el.type === "FormField" && el.props.label === label)!;
  (input.props.onChangeText as (text: string) => void)(value);
}

function map() {
  return elements(render()).find(el => el.type === "AddressMap")!.props as {
    onSelect(point: Coordinates): void; onConfirm(): void; onCancel(): void; selection: PinSelection; notice: string | null;
  };
}

function chooseLocation(township = "Tamwe") {
  const selector = elements(render()).find(item => item.type === "LocationSelector")!;
  (selector.props.onChange as (value: unknown) => void)({ regionId: "region", districtId: "district", townshipId: "township", regionName: "Yangon", districtName: "East Yangon", township });
  (selector.props.onValidityChange as (value: string) => void)("valid");
}
function fillAddress() {
  field("Street", "5 Friend Street");
  chooseLocation();
  field("Landmark or delivery instructions", "Blue door");
}

describe("customer checkout destination selection", () => {
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.map = true; harness.language = "en";
    harness.zoneState = { status: "loading" };
    harness.addresses = null;
    harness.items = [{ productId: "product", quantity: 1 }];
    harness.displayName = "Current Restaurant A";
    harness.checkoutState = { status: "idle" };
    vi.resetAllMocks();
    harness.quote.mockImplementation(async (request: DeliveryQuoteRequest) => ({
      confirmationToken: "server-quote", idempotencyKey: "server-key", totalAmount: 8500,
      restaurantName: "Restaurant", currency: "MMK", subtotal: 7500, deliveryFee: 1000, discountAmount: 0, lines: [],
      destination: { address: request.temporaryDestination?.address ?? "12 Main Rd", city: "Yangon", township: "Tamwe",
        recipientName: request.recipientName, recipientPhone: request.recipientPhone, deliveryNote: request.deliveryNote,
        latitude: request.temporaryDestination?.latitude ?? null, longitude: request.temporaryDestination?.longitude ?? null }
    }));
  });

  it("reports a delivery-area failure and retries that request while server quotes remain authoritative", async () => {
    harness.zoneState = { status: "offline", failure: { kind: "network", operation: "checkout-zones" } };
    const failure = elements(render()).find(element => element.type === "StateView")!;
    expect(failure.props.title).toBe("Could not load delivery areas");
    expect(failure.props.message).toContain("Check your connection");
    (failure.props.onRetry as () => void)();
    expect(harness.reloadZones).toHaveBeenCalledOnce();
    expect(harness.quote).not.toHaveBeenCalled();
    harness.zoneState = { status: "ready", data: [] };
    press("Review destination"); press("Check delivery and review total"); await tick();
    expect(harness.quote).toHaveBeenCalledOnce();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("selects the default saved address and requires a final action after quote", async () => {
    press("Review destination"); press("Check delivery and review total");
    await tick();
    expect(harness.quote.mock.calls[0][0]).toMatchObject({ addressId: "home", recipientName: "Customer",
      recipientPhone: "+959123456789", deliveryNote: "Home gate" });
    expect(harness.submit).not.toHaveBeenCalled();
    const review = elements(render()).find(el => el.props.quote);
    (review!.props.onSubmit as () => void)();
    expect(harness.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      body: expect.objectContaining({ addressId: "home", confirmationToken: "server-quote" })
    }));
  });

  it("reviews the destination before requesting a quote and never treats that review as an order", async () => {
    const initial = elements(render());
    expect(initial.find(element => element.props.subtitle === "Current Restaurant A")).toBeDefined();
    expect(initial.some(element => element.props.children === "12, Main Rd, Ward 1, Tamwe, East Yangon, Yangon")).toBe(true);
    press("Review destination");
    expect(harness.quote).not.toHaveBeenCalled();
    expect(harness.submit).not.toHaveBeenCalled();
    expect(elements(render()).find(element => element.props.title === "Review your destination")).toBeDefined();
    expect(elements(render()).some(element => String(element.props.children).includes("A quote is not an order"))).toBe(true);
    press("Check delivery and review total"); await tick();
    expect(harness.quote).toHaveBeenCalledOnce();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("discards a late quote after the cart changes and requires destination review again", async () => {
    let resolve!: (quote: unknown) => void;
    harness.quote.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    press("Review destination"); press("Check delivery and review total");
    harness.items = [{ productId: "different-product", quantity: 2 }];
    render();
    resolve({ totalAmount: 8500, confirmationToken: "obsolete", idempotencyKey: "old-key" }); await tick();
    expect(elements(render()).some(element => element.props.quote)).toBe(false);
    expect(elements(render()).find(element => element.props.title === "Review destination")).toBeDefined();
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("invalidates reviewed quote data after the owned saved address is refreshed", async () => {
    press("Review destination"); press("Check delivery and review total"); await tick();
    const obsolete = elements(render()).find(element => element.props.quote)!;
    harness.addresses = [work, { ...home, street: "Updated street", townshipId: "different-township" }];
    expect(elements(render()).some(element => element.props.quote)).toBe(false);
    (obsolete.props.onSubmit as () => void)();
    expect(harness.submit).not.toHaveBeenCalled();
    expect(elements(render()).find(element => element.props.title === "Review destination")).toBeDefined();
  });

  it("retains the authoritative quote during a same-tenant runtime brand refresh", async () => {
    press("Review destination"); press("Check delivery and review total"); await tick();
    const quote = elements(render()).find(element => element.props.quote)!.props.quote;
    harness.displayName = "Restaurant A refreshed";
    expect(elements(render()).find(element => element.props.quote)?.props.quote).toBe(quote);
    expect(harness.quote).toHaveBeenCalledOnce();
  });

  it("retries a failed quote without submitting an order and preserves temporary contact and instructions", async () => {
    harness.quote.mockRejectedValueOnce(new ApiHttpError(400, "MINIMUM_ORDER_NOT_MET"));
    press("Enter a text delivery address"); fillAddress();
    field("Recipient name", "Temporary recipient");
    field("Contact phone", "0942111222");
    press("Review destination"); press("Check delivery and review total"); await tick();
    expect(elements(render()).some(element => String(element.props.children).includes("No order has been confirmed"))).toBe(true);
    expect(harness.submit).not.toHaveBeenCalled();
    press("Retry quote"); await tick();
    expect(harness.quote).toHaveBeenCalledTimes(2);
    expect(harness.quote.mock.calls[1][0]).toEqual(harness.quote.mock.calls[0][0]);
    expect(harness.quote.mock.calls[1][0]).toMatchObject({ recipientName: "Temporary recipient", recipientPhone: "+95942111222", deliveryNote: "Blue door" });
    expect(home.recipientName).toBe("Customer");
  });

  it("requires active canonical selector validation even when IDs have been supplied", () => {
    press("Enter a text delivery address"); fillAddress();
    const selector = elements(render()).find(element => element.type === "LocationSelector")!;
    (selector.props.onValidityChange as (value: string) => void)("unavailable");
    expect(elements(render()).find(element => element.props.title === "Review destination")?.props.disabled).toBe(true);
    expect(harness.quote).not.toHaveBeenCalled();
  });

  it("associates recognized server validation with the contact field when editing the destination", async () => {
    harness.quote.mockRejectedValueOnce(new ApiHttpError(400, "VALIDATION_FAILED", [
      { field: "recipientPhone", message: "untrusted validation content" }
    ]));
    press("Review destination"); press("Check delivery and review total"); await tick();
    press("Edit destination");
    const input = elements(render()).find(element => element.props.label === "Contact phone")!;
    expect(input.props.error).toContain("Enter a Myanmar phone number");
    expect(input.props.error).not.toContain("untrusted");
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("allows another saved address", async () => {
    press("Use saved address · Work");
    press("Review destination"); press("Check delivery and review total");
    await tick();
    expect(harness.quote.mock.calls[0][0]).toMatchObject({ addressId: "work", deliveryNote: "Office" });
  });

  it("offers server settlement when an in-memory checkout result is uncertain", async () => {
    press("Review destination"); press("Check delivery and review total");
    await tick();
    const review = elements(render()).find(element => element.props.quote)!;
    (review.props.onSubmit as () => void)();
    const attempt = harness.submit.mock.calls[0][0] as CheckoutAttempt;
    harness.checkoutState = { status: "uncertain", attempt };
    press("Start a new checkout");
    expect(harness.abandon).toHaveBeenCalledOnce();
    expect(harness.submit).toHaveBeenCalledOnce();
    harness.checkoutState = { status: "idle" };
    expect(elements(render()).some(element => element.props.quote)).toBe(false);
  });

  it("explains an invalid recipient phone before requesting a quote", () => {
    field("Contact phone", "call-me");
    expect(elements(render()).find(element => element.props.title === "Review destination")?.props.disabled).toBe(true);
    expect(harness.quote).not.toHaveBeenCalled();
    expect(elements(render()).find(element => element.props.accessibilityRole === "alert")?.props.children)
      .toContain("Enter a Myanmar phone number");
  });

  it("prevents confirmation if the server total cannot be represented accurately", async () => {
    harness.quote.mockResolvedValueOnce({ totalAmount: Number.MAX_SAFE_INTEGER + 1 });
    press("Review destination"); press("Check delivery and review total");
    await tick();
    expect(elements(render()).find(element => element.props.accessibilityRole === "alert")?.props.children)
      .toBe("The quoted total cannot be displayed accurately. Review the cart and try again.");
    expect(elements(render()).some(element => element.props.quote)).toBe(false);
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("submits a confirmed temporary point without a saved address reference or mutation", async () => {
    press("Choose another location on map");
    map().onSelect(point);
    expect(map().selection.confirmed).toBe(false);
    expect(harness.quote).not.toHaveBeenCalled();
    map().onConfirm();
    fillAddress();
    press("Review destination"); press("Check delivery and review total");
    await tick();
    const request = harness.quote.mock.calls[0][0];
    expect(request.addressId).toBeUndefined();
    expect(request.temporaryDestination).toEqual({ ...point, source: "MANUAL_MAP", address: "5 Friend Street", city: "Yangon", township: "Tamwe", regionId: "region", districtId: "district", townshipId: "township", ward: null, street: "5 Friend Street", houseNo: null });
    expect(request.deliveryNote).toBe("Blue door");
    expect(home).toMatchObject({ latitude: 16.8, longitude: 96.1, isDefault: true, deliveryNote: "Home gate" });
  });

  it("offers an adjustable GPS suggestion with a low accuracy warning and no automatic checkout", async () => {
    harness.locate.mockResolvedValue({ coordinates: point, accuracyWarning: "Low accuracy" });
    press("Use my current location");
    await tick();
    expect(map()).toMatchObject({ notice: "Low accuracy", selection: { coordinates: point, confirmed: false, source: "gps" } });
    const adjusted = { ...point, latitude: 16.92 };
    map().onSelect(adjusted);
    map().onConfirm();
    expect(harness.submit).not.toHaveBeenCalled();
    fillAddress();
    press("Review destination"); press("Check delivery and review total");
    expect(harness.quote.mock.calls[0][0].temporaryDestination).toMatchObject({ ...adjusted, source: "GPS_CONFIRMED" });
  });

  it("allows manual pin selection after GPS permission is denied", async () => {
    harness.locate.mockRejectedValue(new LocationSelectionError("denied"));
    press("Use my current location");
    await tick();
    expect(map().notice).toContain("permission was denied");
    map().onSelect(point);
    map().onConfirm();
    fillAddress();
    press("Review destination"); press("Check delivery and review total");
    expect(harness.quote.mock.calls[0][0].temporaryDestination.source).toBe("MANUAL_MAP");
  });

  it("rejects invalid native map coordinates and retains the manual text destination path", async () => {
    press("Choose another location on map");
    map().onSelect(point);
    expect(() => map().onSelect({ latitude: Number.NaN, longitude: 181 })).not.toThrow();
    expect(map().selection.coordinates).toBeNull();
    expect(map().notice).toContain("invalid");
    map().onConfirm();
    expect(elements(render()).some(element => element.type === "AddressMap")).toBe(true);
    map().onCancel();
    press("Enter a text delivery address"); fillAddress();
    press("Review destination"); press("Check delivery and review total"); await tick();
    expect(harness.quote.mock.calls[0][0].temporaryDestination.source).toBe("MANUAL_TEXT");
    expect(harness.submit).not.toHaveBeenCalled();
  });

  it("hides map actions when Maps is unavailable and keeps saved address checkout in Burmese", async () => {
    harness.language = "my-MM";
    harness.map = false;
    const tree = elements(render());
    expect(tree.find(el => el.props.title === "မြေပုံပေါ်တွင် နေရာအသစ်ရွေးရန်")).toBeUndefined();
    expect(tree.find(el => el.props.title === "လက်ရှိတည်နေရာ သုံးရန်")).toBeUndefined();
    press("ပို့ဆောင်မည့်နေရာ ပြန်စစ်ရန်"); press("ပို့ဆောင်နိုင်မှုနှင့် စုစုပေါင်းငွေ စစ်ရန်");
    await tick();
    expect(harness.quote.mock.calls[0][0]).toMatchObject({ addressId: "home" });
  });

  it("quotes a saved text address with Maps disabled without requesting GPS", async () => {
    harness.map = false;
    harness.addresses = [{ ...home, latitude: null, longitude: null }];
    press("Review destination"); press("Check delivery and review total"); await tick();
    expect(harness.quote).toHaveBeenCalledWith(expect.objectContaining({ addressId: "home" }), expect.anything());
    expect(harness.locate).not.toHaveBeenCalled();
    expect(elements(render()).some(element => element.type === "AddressMap")).toBe(false);
  });

  it("completes text-only quote, review and COD confirmation using a configured area with Maps disabled", async () => {
    harness.map = false;
    harness.addresses = [];
    harness.zoneState = { status: "ready", data: [
      { coverageCity: "Yangon", coverageTownship: "Tamwe" },
      { coverageCity: null, coverageTownship: null }, { coverageCity: "Yangon", coverageTownship: null }
    ] };
    expect(elements(render()).find(element => element.props.title === "Review destination")?.props.disabled).toBe(true);
    field("Street", "5 Friend Street");
    field("Ward / Neighborhood", "Ward 2");
    field("House / Building / Floor / Room", "Room 4");
    chooseLocation();
    field("Landmark or delivery instructions", "Blue door");
    expect(elements(render()).some(element => element.props.label === "City")).toBe(false);
    expect(elements(render()).find(element => element.type === "LocationSelector")?.props.value).toMatchObject({ townshipId: "township" });
    press("Review destination"); press("Check delivery and review total"); await tick();
    const request = harness.quote.mock.calls[0][0];
    expect(request.temporaryDestination).toEqual({ source: "MANUAL_TEXT", address: "Room 4, 5 Friend Street, Ward 2", city: "Yangon", township: "Tamwe", regionId: "region", districtId: "district", townshipId: "township", ward: "Ward 2", street: "5 Friend Street", houseNo: "Room 4" });
    expect(request.addressId).toBeUndefined();
    const review = elements(render()).find(element => element.props.quote)!;
    const reviewTree = (review.type as (props: { quote: DeliveryQuoteResponse; onSubmit(): void; onChange(): void }) => ReactNode)(review.props as never);
    expect(elements(reviewTree).some(element => String(element.props.children).includes("Geographic proximity has not been verified"))).toBe(true);
    expect(elements(reviewTree).some(element => element.props.children === "Cash on delivery")).toBe(true);
    expect(elements(reviewTree).find(element => element.props.title === "Confirm and place order")).toBeDefined();
    (review.props.onSubmit as () => void)();
    expect(harness.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ body: { ...request, confirmationToken: "server-quote" } }));
    expect(harness.locate).not.toHaveBeenCalled();
    expect(elements(reviewTree).some(element => element.props.children instanceof Array && element.props.children.join("").includes("Tamwe,"))).toBe(true);
  });

  it("offers text entry even when Maps is configured", async () => {
    press("Enter a text delivery address");
    fillAddress();
    press("Review destination"); press("Check delivery and review total"); await tick();
    expect(harness.quote.mock.calls[0][0].temporaryDestination.source).toBe("MANUAL_TEXT");
    expect(harness.locate).not.toHaveBeenCalled();
  });

  it("shows the authoritative rejection for an unsupported text City and Township", async () => {
    harness.quote.mockRejectedValue(new ApiHttpError(400, "DELIVERY_ADDRESS_OUTSIDE_ZONE"));
    press("Enter a text delivery address"); fillAddress(); chooseLocation("Unsupported");
    press("Review destination"); press("Check delivery and review total"); await tick();
    expect(elements(render()).find(element => element.props.accessibilityRole === "alert")?.props.children).toContain("Delivery is unavailable");
    expect(harness.submit).not.toHaveBeenCalled();
  });
});

describe("delivery recipient phone format", () => {
  it.each([
    ["09123456", "+959123456"],
    ["09 942-123-456", "+959942123456"],
    ["၀၉ ၉၄၂-၁၂၃-၄၅၆", "+959942123456"],
    ["0095 9 942 123 456", "+959942123456"],
    ["(01) 234567", "+951234567"],
    ["+1 (415) 555-0132", "+14155550132"],
    ["+39 02 1234 5678", "+390212345678"],
    ["+123456789012345", "+123456789012345"]
  ])("normalizes %s without guessing an international trunk prefix", (input, expected) => {
    expect(normalizeRecipientPhone(input)).toBe(expected);
  });

  it.each(["", "abc", "123456789", "09 12345", "091234567890", "+950942123456", "+1 (415 555-0132",
    "+1 415 555 0132 x2", "+1234567890123456", "00 0000000"])("rejects %s", input => {
    expect(normalizeRecipientPhone(input)).toBeNull();
  });
});
