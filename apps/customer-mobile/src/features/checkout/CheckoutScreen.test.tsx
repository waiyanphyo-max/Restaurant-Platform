import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAddressResponse, DeliveryQuoteRequest } from "@restaurant-platform/shared-types";
import type { CustomerAccount } from "../profile/AccountProvider";
import type { CheckoutAttempt } from "./CheckoutProvider";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], state: 0, ref: 0,
  quote: vi.fn(), submit: vi.fn(), abandon: vi.fn(), reset: vi.fn(), locate: vi.fn(), map: true, language: "en",
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
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", FormField: "FormField", Page: "Page" }));
vi.mock("../../i18n", () => ({ useCustomerLanguage: () => harness.language, useCustomerText: () => (en: string, my: string) => harness.language === "en" ? en : my }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ mapsConfigured: harness.map, branding: { displayName: "Restaurant" } }) }));
vi.mock("../../api", () => ({ getCustomerApi: () => ({ quoteDelivery: harness.quote }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: () => ({ state: { status: "loading" } }) }));
vi.mock("../addresses/AddressMap", () => ({ AddressMap: "AddressMap" }));
vi.mock("../addresses/DestinationPin", () => ({ DestinationPin: "DestinationPin" }));
vi.mock("../addresses/native-location", () => ({ suggestCurrentLocation: harness.locate }));
vi.mock("../cart/CartProvider", () => {
  const items = [{ productId: "product", quantity: 1 }];
  return { useCustomerCart: () => ({ items }) };
});
vi.mock("./CheckoutProvider", () => ({ useCustomerCheckout: () => ({ state: harness.checkoutState, submit: harness.submit,
  abandonPrevious: harness.abandon, reset: harness.reset }) }));

import { LocationSelectionError, type Coordinates, type PinSelection } from "../addresses/location";
import { CheckoutScreen } from "./CheckoutScreen";
import { normalizeRecipientPhone } from "./destination";

const home = Object.freeze<CustomerAddressResponse>({ id: "home", label: "Home", recipientName: "Customer", houseNo: "12",
  street: "Main Rd", ward: "Ward 1", township: "Tamwe", city: "Yangon", latitude: 16.8, longitude: 96.1, deliveryNote: "Home gate",
  isDefault: true, createdAt: "", updatedAt: "" });
const work = { ...home, id: "work", label: "Work", isDefault: false, deliveryNote: "Office" };
const account: CustomerAccount = { addresses: [work, home], profile: { id: "me", fullName: "Profile", phone: "09123456789",
  preferredLanguage: "en", createdAt: "", updatedAt: "", avatarUrl: null } };
const point = { latitude: 16.91, longitude: 96.17 };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function render() {
  harness.state = 0; harness.ref = 0;
  return CheckoutScreen({ account, onCart: vi.fn(), onOrders: vi.fn(), onOrder: vi.fn() });
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
    onSelect(point: Coordinates): void; onConfirm(): void; selection: PinSelection; notice: string | null;
  };
}

function fillAddress() {
  field("Full address (building, floor, street and ward)", "5 Friend Street");
  field("Township or area", "Tamwe");
  field("City", "Yangon");
  field("Landmark or delivery instructions", "Blue door");
}

describe("customer checkout destination selection", () => {
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.map = true; harness.language = "en";
    harness.checkoutState = { status: "idle" };
    vi.resetAllMocks();
    harness.quote.mockImplementation(async (request: DeliveryQuoteRequest) => ({
      confirmationToken: "server-quote", idempotencyKey: "server-key", totalAmount: 8500,
      destination: { address: request.temporaryDestination?.address ?? "12 Main Rd" }
    }));
  });

  it("selects the default saved address and requires a final action after quote", async () => {
    press("Check delivery and review total");
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

  it("allows another saved address", async () => {
    press("Use saved address · Work");
    press("Check delivery and review total");
    await tick();
    expect(harness.quote.mock.calls[0][0]).toMatchObject({ addressId: "work", deliveryNote: "Office" });
  });

  it("offers server settlement when an in-memory checkout result is uncertain", async () => {
    press("Check delivery and review total");
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
    press("Check delivery and review total");
    expect(harness.quote).not.toHaveBeenCalled();
    expect(elements(render()).find(element => element.props.accessibilityRole === "alert")?.props.children)
      .toContain("Enter a Myanmar phone number");
  });

  it("prevents confirmation if the server total cannot be represented accurately", async () => {
    harness.quote.mockResolvedValueOnce({ totalAmount: Number.MAX_SAFE_INTEGER + 1 });
    press("Check delivery and review total");
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
    press("Check delivery and review total");
    await tick();
    const request = harness.quote.mock.calls[0][0];
    expect(request.addressId).toBeUndefined();
    expect(request.temporaryDestination).toEqual({ ...point, source: "MANUAL_MAP", address: "5 Friend Street", city: "Yangon", township: "Tamwe" });
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
    press("Check delivery and review total");
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
    press("Check delivery and review total");
    expect(harness.quote.mock.calls[0][0].temporaryDestination.source).toBe("MANUAL_MAP");
  });

  it("disables map actions when Maps is unavailable and keeps saved address checkout in Burmese", async () => {
    harness.language = "my-MM";
    harness.map = false;
    const tree = elements(render());
    expect(tree.find(el => el.props.title === "မြေပုံပေါ်တွင် နေရာအသစ်ရွေးရန်")?.props.disabled).toBe(true);
    expect(tree.find(el => el.props.title === "လက်ရှိတည်နေရာ သုံးရန်")?.props.disabled).toBe(true);
    press("ပို့ဆောင်နိုင်မှုနှင့် စုစုပေါင်းငွေ စစ်ရန်");
    await tick();
    expect(harness.quote.mock.calls[0][0]).toMatchObject({ addressId: "home" });
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
