import { useEffect, useRef, useState } from "react";
import type { CustomerAddressResponse, DeliveryQuoteResponse } from "@restaurant-platform/shared-types";
import { getCustomerApi } from "../../api";
import { useRuntimeBranding } from "../../branding/RuntimeBrandingProvider";
import { Action, Body, Card, FormField, Page, StateView } from "../../components/ui";
import { LocationSelector } from "../../components/LocationSelector";
import { useApiQuery } from "../../hooks/useApiQuery";
import { apiFailureMessage } from "../../hooks/apiFailure";
import { useCustomerLanguage, useCustomerText } from "../../i18n";
import { readEmbeddedTenant } from "../../tenant";
import { savedPin } from "../addresses/address";
import { AddressMap } from "../addresses/AddressMap";
import { DestinationPin } from "../addresses/DestinationPin";
import { confirmPin, emptyPin, LocationSelectionError, selectPin, type Coordinates } from "../addresses/location";
import { suggestCurrentLocation } from "../addresses/native-location";
import { useCustomerCart } from "../cart/CartProvider";
import type { CustomerAccount } from "../profile/AccountProvider";
import { statusLabel } from "../orders/presentation";
import { formatMoney } from "../storefront/presentation";
import { useCustomerCheckout, type CheckoutAttempt } from "./CheckoutProvider";
import { addressText, checkoutError, checkoutFieldErrors, defaultAddress, detailedAddressText, destinationProblem, invalidRecipientPhoneMessage, normalizeRecipientPhone, quoteRequest, type CheckoutFieldErrors, type DestinationDetails } from "./destination";

export function CheckoutScreen({ account, onCart, onOrder, onOrders }: {
  account: CustomerAccount;
  onCart(): void;
  onOrder(id: string): void;
  onOrders(): void;
}) {
  const { addresses, profile } = account;
  const language = useCustomerLanguage();
  const t = useCustomerText();
  const cart = useCustomerCart();
  const checkout = useCustomerCheckout();
  const tenant = readEmbeddedTenant();
  const branding = useRuntimeBranding();
  const { state: zoneState, reload: reloadZones } = useApiQuery(signal => getCustomerApi().getDeliveryZones({ signal }), "checkout-zones");
  const [addressId, setAddressId] = useState(() => defaultAddress(addresses)?.id);
  const saved = addresses.find(address => address.id === addressId);
  const [temporary, setTemporary] = useState(() => !addresses.length);
  const [pin, setPin] = useState(emptyPin);
  const [draftPin, setDraftPin] = useState(emptyPin);
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<DestinationDetails>(() => contact(saved));
  const [review, setReview] = useState<{ attempt: CheckoutAttempt; snapshot: string } | null>(null);
  const [destinationReview, setDestinationReview] = useState<string | null>(null);
  const [locationValidity, setLocationValidity] = useState("incomplete");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [quoting, setQuoting] = useState(false);
  const quoteInFlight = useRef<AbortController | null>(null);
  const gps = useRef(0);
  useEffect(() => () => { gps.current++; quoteInFlight.current?.abort(); }, []);
  const destination = temporary ? (pin.coordinates ? { pin } : { text: true as const }) : saved ? { saved } : null;
  const validation = destinationProblem(destination, details, t) ?? (temporary && locationValidity !== "valid"
    ? t("Choose an active Region / State, District and Township before continuing.", "ဆက်လုပ်ရန် အသုံးပြုနိုင်သော တိုင်း၊ ခရိုင်နှင့် မြို့နယ်ကို ရွေးပါ။") : null);
  // A saved ID alone is insufficient: a refreshed address may have changed underneath the review.
  // This snapshot is screen-local only and never replaces a durable submitted attempt.
  const snapshot = JSON.stringify([destination, details, cart.items, temporary ? locationValidity : null]);
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  useEffect(() => {
    quoteInFlight.current?.abort();
    quoteInFlight.current = null;
    setQuoting(false);
  }, [snapshot]);

  function contact(address?: CustomerAddressResponse): DestinationDetails {
    return { recipientName: address?.recipientName || profile.fullName || "", recipientPhone: address?.recipientPhone || profile.phone || "",
      deliveryNote: address?.deliveryNote ?? "", address: "", township: "", city: "", ward: "", street: "", houseNo: "",
      regionId: "", districtId: "", townshipId: "", regionName: "", districtName: "" };
  }

  function resetReview() { setReview(null); setDestinationReview(null); setError(null); setFieldErrors({}); checkout.reset(); }
  function startNewCheckout() {
    resetReview();
    void checkout.abandonPrevious();
  }
  function useSaved(address: CustomerAddressResponse) {
    resetReview();
    setTemporary(false);
    setAddressId(address.id);
    setDetails(contact(address));
  }
  function update(field: keyof DestinationDetails, value: string) {
    resetReview();
    setDetails(previous => ({ ...previous, [field]: value }));
  }
  function useTextAddress() {
    resetReview();
    if (!temporary) setDetails(contact());
    setTemporary(true);
    setPin(emptyPin);
    closeMap();
  }

  function openMap() {
    if (!tenant.mapsConfigured || quoting) return;
    setNotice(null);
    setDraftPin(temporary && pin.coordinates ? selectPin(pin.coordinates, "map") : emptyPin);
    setMapOpen(true);
  }
  function closeMap() {
    gps.current++;
    setLocating(false);
    setMapOpen(false);
  }
  async function locate() {
    if (!tenant.mapsConfigured || quoting) return;
    const generation = ++gps.current;
    setNotice(null);
    setLocating(true);
    try {
      const position = await suggestCurrentLocation();
      if (generation !== gps.current) return;
      setDraftPin(selectPin(position.coordinates, "gps"));
      setNotice(position.accuracyWarning
        ? t(position.accuracyWarning, "တည်နေရာ တိကျမှု နည်းပါသည်။ အတည်မပြုမီ ဝင်ပေါက်သို့ အမှတ်ကို ရွှေ့ပါ။")
        : t("Check this GPS suggestion and confirm your delivery entrance.", "GPS ပြသည့်နေရာကို စစ်ဆေးပြီး ပို့ဆောင်မည့် ဝင်ပေါက်ကို အတည်ပြုပါ။"));
    } catch (cause) {
      if (generation !== gps.current) return;
      setNotice(cause instanceof LocationSelectionError && cause.code === "denied"
        ? t("Location permission was denied. Choose a pin manually or cancel the map to enter a text address.", "တည်နေရာ အသုံးပြုခွင့် မရပါ။ မြေပုံပေါ်တွင် ရွေးပါ သို့မဟုတ် မြေပုံကို ပိတ်ပြီး စာသားလိပ်စာ ဖြည့်ပါ။")
        : t("Current location is unavailable. Choose a pin manually or cancel the map to enter a text address.", "လက်ရှိတည်နေရာ ရှာမတွေ့ပါ။ မြေပုံပေါ်တွင် ရွေးပါ သို့မဟုတ် မြေပုံကို ပိတ်ပြီး စာသားလိပ်စာ ဖြည့်ပါ။"));
    } finally {
      if (generation === gps.current) setLocating(false);
    }
  }
  function select(coordinates: Coordinates) {
    gps.current++;
    setLocating(false);
    setNotice(null);
    try { setDraftPin(selectPin(coordinates, draftPin.source === "gps" ? "gps" : "map")); }
    catch {
      setDraftPin(emptyPin);
      setNotice(t("This map point is invalid. Choose another point or cancel the map to enter a text address.",
        "ဤမြေပုံနေရာ မမှန်ပါ။ နေရာအသစ်ကို ရွေးပါ သို့မဟုတ် မြေပုံကို ပိတ်ပြီး စာသားလိပ်စာ ဖြည့်ပါ။"));
    }
  }
  function confirm() {
    let confirmed;
    try { confirmed = confirmPin(draftPin); }
    catch {
      setNotice(t("Choose a valid map point before confirming. Text entry remains available after closing the map.",
        "အတည်မပြုမီ မှန်ကန်သော မြေပုံနေရာကို ရွေးပါ။ မြေပုံပိတ်ပြီး စာသားလိပ်စာ ဖြည့်နိုင်ပါသည်။"));
      return;
    }
    resetReview();
    if (!temporary) setDetails(contact());
    setPin(confirmed);
    setTemporary(true);
    closeMap();
  }

  async function requestQuote() {
    if (quoteInFlight.current || destinationReview !== snapshot || latestSnapshot.current !== snapshot || validation) return;
    setReview(null); setError(null); setFieldErrors({}); checkout.reset();
    const request = destination && quoteRequest(destination, details, cart.items);
    if (!request) {
      setError(destinationProblem(destination, details, t));
      return;
    }
    const controller = new AbortController();
    quoteInFlight.current = controller;
    setQuoting(true);
    try {
      const quote = await getCustomerApi().quoteDelivery(request, { signal: controller.signal });
      if (controller.signal.aborted || latestSnapshot.current !== snapshot) return;
      if (!Number.isSafeInteger(quote.totalAmount) || quote.totalAmount < 0) {
        setError(t("The quoted total cannot be displayed accurately. Review the cart and try again.",
          "တွက်ချက်ထားသော စုစုပေါင်းငွေကို တိကျစွာ မပြနိုင်ပါ။ ခြင်းတောင်းကို ပြန်စစ်ပြီး ထပ်ကြိုးစားပါ။"));
        return;
      }
      setReview({ attempt: { body: { ...request, confirmationToken: quote.confirmationToken }, quote }, snapshot });
    } catch (cause) {
      if (!controller.signal.aborted && latestSnapshot.current === snapshot) {
        setError(checkoutError(cause, t));
        setFieldErrors(checkoutFieldErrors(cause, t));
      }
    } finally {
      if (quoteInFlight.current === controller) {
        setQuoting(false);
        quoteInFlight.current = null;
      }
    }
  }

  const title = t("Checkout", "ငွေရှင်းရန်");
  const backToCart = t("Back to cart", "ခြင်းတောင်းသို့ ပြန်သွားရန်");
  const temporaryLabel = t("Temporary delivery location", "ယခုမှာယူမှုအတွက် ပို့ဆောင်မည့်နေရာ");
  const paymentLabel = t("Cash on delivery", "ပစ္စည်းရောက်မှ ငွေချေမည်");
  const ordersLabel = t("Order history", "မှာယူမှုမှတ်တမ်း");
  if (checkout.state.status === "recovering" || checkout.state.status === "recovery_pending" || checkout.state.status === "unrecorded") {
    const { status } = checkout.state;
    return <Page title={title}><Card title={t("Checking previous checkout", "ယခင်မှာယူမှုကို စစ်ဆေးနေပါသည်")}>
      {status === "recovery_pending" ? <>
        <Body>{t("Reconnect to check whether your last checkout created an order.", "နောက်ဆုံးမှာယူမှု အောင်မြင်ခဲ့ခြင်းရှိမရှိ စစ်ဆေးရန် အင်တာနက်ပြန်ချိတ်ပါ။")}</Body>
        <Action title={t("Check again", "ပြန်စစ်ရန်")} onPress={() => void checkout.recover()} />
      </> : null}
      {status === "unrecorded" ? <>
        <Body>{t("The server found no order yet. Starting again asks it to close the previous checkout or return its receipt.",
          "ဆာဗာတွင် မှာယူမှု မတွေ့သေးပါ။ အသစ်စတင်ပါက ယခင်ငွေရှင်းမှုကို ပိတ်ရန် သို့မဟုတ် ပြေစာပြန်ပေးရန် ဆာဗာသို့ တောင်းဆိုပါမည်။")}</Body>
        <Action title={t("Check again", "ပြန်စစ်ရန်")} onPress={() => void checkout.recover()} secondary />
        <Action title={t("Start a new checkout", "အသစ်မှာယူရန်")} onPress={startNewCheckout} />
      </> : null}
      {status !== "recovering" ? <Action title={ordersLabel} secondary onPress={onOrders} /> : null}
    </Card></Page>;
  }
  if (checkout.state.status === "created") {
    const { order } = checkout.state;
    function finish() {
      const initial = defaultAddress(addresses);
      resetReview();
      setTemporary(!addresses.length);
      setPin(emptyPin);
      setDraftPin(emptyPin);
      setAddressId(initial?.id);
      setDetails(contact(initial));
    }
    return <Page title={t("Order confirmed", "မှာယူမှု အတည်ပြုပြီးပါပြီ")}>
      <Card title={order.orderNumber}>
        <Body>{t("Order ID", "မှာယူမှု ID")} · {order.orderId}</Body>
        <Body>{statusLabel(order.status, language)}</Body>
        <Body>{t("Cart subtotal", "ပစ္စည်း စုစုပေါင်း")} · {formatMoney(order.subtotal, order.currency, language)}</Body>
        <Body>{t("Delivery fee", "ပို့ဆောင်ခ")} · {formatMoney(order.deliveryFee, order.currency, language)}</Body>
        <Body>{t("Discount", "လျှော့ဈေး")} · {formatMoney(order.discountAmount, order.currency, language)}</Body>
        <Body>{formatMoney(order.totalAmount, order.currency, language)} · {paymentLabel}</Body>
        <Body>{t("Order confirmation does not mean cash has been collected.", "မှာယူမှု အတည်ပြုခြင်းသည် ငွေကောက်ခံပြီးကြောင်း မဆိုလိုပါ။")}</Body>
        <Body>{t("Check order tracking for the latest payment and delivery status.", "နောက်ဆုံး ငွေပေးချေမှုနှင့် ပို့ဆောင်မှုအခြေအနေကို မှာယူမှု ခြေရာခံစာမျက်နှာတွင် ကြည့်ပါ။")}</Body>
        <Action title={t("Track this order", "ဤမှာယူမှုကို ခြေရာခံရန်")} onPress={() => { finish(); onOrder(order.orderId); }} />
        <Action title={ordersLabel} secondary onPress={() => { finish(); onOrders(); }} />
      </Card>
    </Page>;
  }
  if (checkout.state.status === "submitting" || checkout.state.status === "uncertain") {
    const { attempt, status } = checkout.state;
    return <Page title={title}>
      <Card title={status === "submitting" ? t("Placing your order…", "မှာယူနေပါသည်…") : t("Checkout result is pending", "မှာယူမှုရလဒ် စောင့်ဆိုင်းနေပါသည်")}>
        <Body>{attempt.quote.destination.address}</Body>
        {status === "uncertain" ? <>
          <Body>{t("Reconnect and retry this same order safely, or check your order history for the result.",
            "အင်တာနက်ပြန်ချိတ်ပြီး ဤမှာယူမှုကို ထပ်စမ်းပါ သို့မဟုတ် မှတ်တမ်းတွင် ရလဒ်ကို စစ်ဆေးပါ။")}</Body>
          <Action title={t("Retry this checkout", "ဤမှာယူမှုကို ထပ်ကြိုးစားရန်")} onPress={() => void checkout.submit(attempt)} />
          <Body>{t("Starting again asks the server to close this checkout or return the receipt if the order was already placed.",
            "အသစ်စတင်ပါက ဤငွေရှင်းမှုကို ပိတ်ရန် သို့မဟုတ် မှာယူပြီးဖြစ်လျှင် ပြေစာပြန်ပေးရန် ဆာဗာသို့ တောင်းဆိုပါမည်။")}</Body>
          <Action title={t("Start a new checkout", "အသစ်မှာယူရန်")} secondary onPress={startNewCheckout} />
          <Action title={ordersLabel} secondary onPress={onOrders} />
        </> : null}
      </Card>
    </Page>;
  }
  const rejected = checkout.state.status === "rejected";
  const activeReview = !rejected && review?.snapshot === snapshot && review.attempt.body.items === cart.items ? review.attempt : null;
  if (activeReview) return <Page title={title}>
    <Body tone="muted">{t("Step 2 of 2 · Review & confirm", "အဆင့် ၂ / ၂ · စစ်ဆေးပြီး အတည်ပြုရန်")}</Body>
    <QuoteReview quote={activeReview.quote} locationLabel={temporary ? temporaryLabel : saved?.label}
      onChange={resetReview} onSubmit={() => { if (latestSnapshot.current === snapshot) void checkout.submit(activeReview); }} />
  </Page>;
  if (!cart.items.length) return <Page title={title}><Card>
    <Body>{t("Your cart is empty.", "ခြင်းတောင်းထဲတွင် ပစ္စည်းမရှိသေးပါ။")}</Body>
    <Action title={backToCart} onPress={onCart} />
  </Card></Page>;

  const coordinates = temporary ? pin.coordinates : savedPin(saved).coordinates;
  const problem = checkout.state.status === "rejected" ? checkoutError(checkout.state.error, t) : error ?? validation;
  const areas = zoneState.status === "ready" ? zoneState.data.filter(zone => zone.townshipId) : [];
  const distinctAreas = [...new Map(areas.map(area => [area.townshipId, area])).values()];
  if (destinationReview === snapshot && !validation) return <Page title={t("Review your destination", "ပို့ဆောင်မည့်နေရာကို ပြန်စစ်ရန်")} subtitle={branding.displayName}>
    <Body tone="muted">{t("Step 1 of 2 · Address → Order review", "အဆင့် ၁ / ၂ · လိပ်စာ → မှာယူမှု ပြန်စစ်ရန်")}</Body>
    <Card title={temporary ? temporaryLabel : saved?.label}>
      <Body>{details.recipientName}</Body>
      <Body>{temporary ? detailedAddressText(details) : saved && addressText(saved)}</Body>
      <Body>{normalizeRecipientPhone(details.recipientPhone)}</Body>
      {temporary ? <Body>{[details.township, details.districtName, details.regionName].filter(Boolean).join(" → ")}</Body> : null}
      {details.deliveryNote ? <Body>{details.deliveryNote}</Body> : null}
      <DestinationPin latitude={coordinates?.latitude ?? null} longitude={coordinates?.longitude ?? null} language={language} />
    </Card>
    <Card title={t("Confirm the details", "အချက်အလက်များ အတည်ပြုရန်")}>
      <Body>{temporary ? t("This destination applies only to this checkout. Your saved addresses and default address stay unchanged.",
        "ဤလိပ်စာသည် ယခုငွေရှင်းမှုအတွက်သာ ဖြစ်ပါသည်။ သိမ်းထားသည့်လိပ်စာများနှင့် မူလလိပ်စာ မပြောင်းပါ။") :
        t("The order keeps its destination snapshot even if you edit your saved address later.", "သိမ်းထားသောလိပ်စာကို နောက်မှပြင်သော်လည်း မှာယူမှု၏ လိပ်စာမှတ်တမ်း မပြောင်းပါ။")}</Body>
      <Body>{t("The next step checks current prices, delivery eligibility, fees and minimums with the server. A quote is not an order.",
        "နောက်အဆင့်တွင် လက်ရှိဈေးနှုန်း၊ ပို့ဆောင်နိုင်မှု၊ ပို့ဆောင်ခနှင့် အနည်းဆုံးမှာယူငွေကို ဆာဗာမှ စစ်ဆေးပါမည်။ ငွေတွက်ချက်မှုသည် မှာယူမှု မဟုတ်ပါ။")}</Body>
    </Card>
    {problem ? <Card title={t("Check your delivery details", "ပို့ဆောင်မှု အချက်အလက်များ စစ်ရန်")}>
      <Body tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{problem}</Body>
      <Body>{t("No order has been confirmed. Your cart remains in this session.", "မှာယူမှု မအတည်ပြုရသေးပါ။ ခြင်းတောင်းသည် ယခုအသုံးပြုမှုအတွင်း ရှိနေပါမည်။")}</Body>
    </Card> : null}
    <Action title={t("Edit destination", "ပို့ဆောင်မည့်နေရာ ပြင်ရန်")} secondary disabled={quoting} onPress={() => {
      if (checkout.state.status === "rejected") setFieldErrors(checkoutFieldErrors(checkout.state.error, t));
      setReview(null); setDestinationReview(null); setError(null); checkout.reset();
    }} />
    <Action title={quoting ? t("Checking delivery…", "ပို့ဆောင်နိုင်မှု စစ်ဆေးနေပါသည်…") : problem ? t("Retry quote", "ငွေတွက်ချက်မှု ပြန်စမ်းရန်") : t("Check delivery and review total", "ပို့ဆောင်နိုင်မှုနှင့် စုစုပေါင်းငွေ စစ်ရန်")}
      loading={quoting} onPress={() => void requestQuote()} />
    <Action title={backToCart} secondary onPress={onCart} />
  </Page>;
  return <>
    <Page title={title} subtitle={branding.displayName}>
      {zoneState.status !== "ready" && zoneState.status !== "loading" ? <StateView kind={zoneState.status}
        title={t("Could not load delivery areas", "ပို့ဆောင်မှု ဧရိယာများ မရယူနိုင်ပါ")}
        message={apiFailureMessage(zoneState.failure, t)} onRetry={reloadZones} retryLabel={t("Reload delivery areas", "ပို့ဆောင်မှု ဧရိယာများ ပြန်ရယူရန်")} /> : null}
      <Card title={t("Delivery location", "ပို့ဆောင်မည့်နေရာ")}>
        <Body>{t("Use a saved address or choose a location for this order.", "သိမ်းထားသည့်လိပ်စာကို သုံးပါ သို့မဟုတ် ယခုမှာယူမှုအတွက် နေရာအသစ်ရွေးပါ။")}</Body>
        {!addresses.length ? <Body>{t("No saved addresses yet. Enter a destination for this order.", "သိမ်းထားသောလိပ်စာ မရှိသေးပါ။ ယခုမှာယူမှုအတွက် လိပ်စာ ဖြည့်ပါ။")}</Body> : null}
        {addresses.map(address => <Card key={address.id} title={address.label}>
          <Body>{address.recipientName || profile.fullName}</Body>
          <Body>{addressText(address)}</Body>
          {address.recipientPhone ? <Body>{address.recipientPhone}</Body> : null}
          {address.deliveryNote ? <Body>{address.deliveryNote}</Body> : null}
          <Action
          title={`${t("Use saved address", "သိမ်းထားသည့်လိပ်စာသုံးရန်")} · ${address.label}${address.isDefault ? ` (${t("default", "မူလ")})` : ""}`}
          secondary={temporary || address.id !== addressId} selected={!temporary && address.id === addressId}
          disabled={quoting} onPress={() => useSaved(address)} /></Card>)}
        <Action title={t("Enter a text delivery address", "ပို့ဆောင်ရန်လိပ်စာ ကိုယ်တိုင်ဖြည့်ရန်")}
          secondary={!temporary || !!coordinates} selected={temporary && !coordinates} disabled={quoting} onPress={useTextAddress} />
        {tenant.mapsConfigured ? <><Action title={t("Choose another location on map", "မြေပုံပေါ်တွင် နေရာအသစ်ရွေးရန်")}
          secondary disabled={!tenant.mapsConfigured || quoting} onPress={openMap} />
        <Action title={t("Use my current location", "လက်ရှိတည်နေရာ သုံးရန်")}
          secondary disabled={!tenant.mapsConfigured || quoting} onPress={() => { openMap(); void locate(); }} /></> :
          <Body>{t("Enter a text address or use a saved address. No map pin or location permission is needed.",
            "လိပ်စာကို ကိုယ်တိုင်ဖြည့်ပါ သို့မဟုတ် သိမ်းထားသည့်လိပ်စာကို သုံးပါ။ မြေပုံနေရာ သို့မဟုတ် တည်နေရာအသုံးပြုခွင့် မလိုပါ။")}</Body>}
        {temporary ? <Body>{temporaryLabel}</Body> : saved ? <Body>{addressText(saved)}</Body> : null}
        {coordinates ? <DestinationPin latitude={coordinates.latitude} longitude={coordinates.longitude} language={language} />
          : <Body>{t("Text address · no navigation coordinates. Township coverage is preliminary; the restaurant reviews the detailed address before accepting.",
            "စာသားလိပ်စာ · လမ်းညွှန်တည်နေရာ မရှိပါ။ မြို့နှင့် မြို့နယ်အလိုက် ပို့ဆောင်နိုင်မှုကို စစ်ဆေးပါမည်။")}</Body>}
        <Body>{t("Configured delivery areas", "သတ်မှတ်ထားသော ပို့ဆောင်မှု ဧရိယာများ")}</Body>
        {zoneState.status === "loading" ? <Body>{t("Loading delivery areas…", "ပို့ဆောင်မှုဧရိယာများ ရယူနေပါသည်…")}</Body> : null}
        {zoneState.status === "ready" && !distinctAreas.length ? <Body>{t("No canonical township delivery areas are configured. Delivery cannot be confirmed until an eligible area is configured.",
          "မြို့နှင့် မြို့နယ်ပါသော ပို့ဆောင်မှုဧရိယာ မရှိသေးပါ။ ဧရိယာသတ်မှတ်ပြီးမှ ပို့ဆောင်နိုင်မှု အတည်ပြုနိုင်ပါမည်။")}</Body> : null}
        {distinctAreas.map(area => <Body key={area.townshipId}>{area.coverageTownship}, {area.districtName}, {area.regionName || area.coverageCity}</Body>)}
      </Card>
      {temporary || saved ? <Card title={t("Delivery details", "ပို့ဆောင်မှု အချက်အလက်")}>
        {temporary ? <>
          <LocationSelector value={{ regionId: details.regionId ?? "", districtId: details.districtId ?? "", townshipId: details.townshipId ?? "",
            regionName: details.regionName ?? "", districtName: details.districtName ?? "", township: details.township }} disabled={quoting}
            onValidityChange={setLocationValidity}
            onChange={location => { resetReview(); setLocationValidity("incomplete"); setDetails(previous => ({ ...previous, ...location, city: location.regionName })); }} />
          <FormField label={t("Ward / Neighborhood", "ရပ်ကွက်")} value={details.ward} error={fieldErrors.ward} onChangeText={value => update("ward", value)} maxLength={100} editable={!quoting} />
          <FormField label={t("Street", "လမ်း")} value={details.street} error={fieldErrors.street} onChangeText={value => update("street", value)} maxLength={100} editable={!quoting} />
          <FormField label={t("House / Building / Floor / Room", "အိမ်၊ တိုက်၊ အထပ်၊ အခန်း")} value={details.houseNo}
            error={fieldErrors.houseNo} onChangeText={value => update("houseNo", value)} maxLength={50} editable={!quoting} multiline />
        </> : null}
        <FormField label={t("Recipient name", "လက်ခံသူအမည်")} value={details.recipientName}
          error={fieldErrors.recipientName ?? (!details.recipientName.trim() ? t("Enter the recipient name.", "လက်ခံသူအမည် ဖြည့်ပါ။") : undefined)}
          onChangeText={value => update("recipientName", value)} maxLength={150} editable={!quoting} />
        <FormField label={t("Contact phone", "ဆက်သွယ်ရန် ဖုန်းနံပါတ်")} value={details.recipientPhone} keyboardType="phone-pad"
          error={fieldErrors.recipientPhone ?? (!normalizeRecipientPhone(details.recipientPhone) ? invalidRecipientPhoneMessage(t) : undefined)}
          onChangeText={value => update("recipientPhone", value)} maxLength={30} editable={!quoting} />
        <FormField label={t("Landmark or delivery instructions", "အနီးရှိ အမှတ်အသား သို့မဟုတ် ပို့ဆောင်ရန် မှာကြားချက်")}
          value={details.deliveryNote} error={fieldErrors.deliveryNote} onChangeText={value => update("deliveryNote", value)} maxLength={2000} editable={!quoting} multiline />
        <Body>{paymentLabel}</Body>
        {problem ? <Body tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{problem}</Body> : null}
        <Action title={t("Review destination", "ပို့ဆောင်မည့်နေရာ ပြန်စစ်ရန်")}
          disabled={quoting || !!validation} onPress={() => { setError(null); setDestinationReview(snapshot); }} />
      </Card> : null}
      <Action title={backToCart} secondary onPress={onCart} />
    </Page>
    {mapOpen ? <AddressMap language={language} selection={draftPin} locating={locating} notice={notice}
      onSelect={select} onConfirm={confirm} onCancel={closeMap} onLocate={() => void locate()} /> : null}
  </>;
}

export function QuoteReview({ quote, locationLabel, onSubmit, onChange }: {
  quote: DeliveryQuoteResponse;
  locationLabel?: string;
  onSubmit(): void;
  onChange(): void;
}) {
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const { destination } = quote;
  const amount = (value: number) => formatMoney(value, quote.currency, language);
  return <>
    <Card title={t("Deliver to", "ပို့ဆောင်မည့်နေရာ")}>
    <Body>{quote.restaurantName}</Body>
    {locationLabel ? <Body>{locationLabel}</Body> : null}
    <Body>{destination.address}</Body>
    <Body>{destination.township}, {destination.districtName}, {destination.regionName || destination.city}</Body>
    <Body>{destination.recipientName} · {destination.recipientPhone}</Body>
    {destination.deliveryNote ? <Body>{destination.deliveryNote}</Body> : null}
    <DestinationPin latitude={destination.latitude} longitude={destination.longitude} language={language} />
    {destination.latitude == null || destination.longitude == null ? <Body>{t("Text address · no navigation coordinates. Geographic proximity has not been verified.",
      "စာသားလိပ်စာ · လမ်းညွှန်တည်နေရာ မရှိပါ။ ပထဝီအကွာအဝေးကို မစစ်ဆေးထားပါ။")}</Body> : null}
    <Body>{t("Township coverage confirmed. The restaurant will review your ward, street and building before accepting.", "စားသောက်ဆိုင်မှ လိပ်စာအသေးစိတ်ကို စစ်ဆေးပြီး လက်ခံပါမည်။")}</Body>
    <Action title={t("Change delivery details", "ပို့ဆောင်မှု အချက်အလက် ပြင်ရန်")} onPress={onChange} secondary />
    </Card>
    <Card title={t("Order summary", "မှာယူမှု အကျဉ်းချုပ်")}>
    {quote.lines.map((line, index) => <Card key={`${line.productId}:${index}`} title={`${line.quantity} × ${line.productName}`}>
      {line.variantName ? <Body>{line.variantName}</Body> : null}
      <Body>{t("Unit price", "တစ်ခုဈေးနှုန်း")} · {amount(line.unitPrice)}</Body>
      {line.modifiers.map((option, optionIndex) => <Body key={`${option.modifierOptionId}:${optionIndex}`}>{option.name} × {option.quantity} · {amount(option.additionalPrice)}</Body>)}
      <Body>{amount(line.subtotal)}</Body>
    </Card>)}
    </Card>
    <Card title={t("Delivery quote", "ပို့ဆောင်မှု ငွေတွက်ချက်မှု")}>
    <Body>{t("Cart subtotal", "ပစ္စည်း စုစုပေါင်း")} · {amount(quote.subtotal)}</Body>
    <Body>{t("Delivery fee", "ပို့ဆောင်ခ")} · {amount(quote.deliveryFee)}</Body>
    <Body>{t("Discount", "လျှော့ဈေး")} · {amount(quote.discountAmount)}</Body>
    <Body>{t("Total", "စုစုပေါင်း")} · {amount(quote.totalAmount)}</Body>
    <Body tone="muted">{t("Current restaurant and delivery minimums were checked by the server. Prices and availability are checked again when you confirm.",
      "ဆာဗာမှ စားသောက်ဆိုင်နှင့် ပို့ဆောင်မှု အနည်းဆုံးမှာယူငွေကို စစ်ဆေးပြီးပါပြီ။ အတည်ပြုချိန်တွင် ဈေးနှုန်းနှင့် ရရှိနိုင်မှုကို ထပ်စစ်ပါမည်။")}</Body>
    </Card>
    <Card title={t("Payment", "ငွေပေးချေမှု")}>
    <Body>{t("Cash on delivery", "ပစ္စည်းရောက်မှ ငွေချေမည်")}</Body>
    <Body>{t("This quote is not an order. Confirm to place the order; cash collection is recorded separately.",
      "ဤငွေတွက်ချက်မှုသည် မှာယူမှု မဟုတ်ပါ။ အတည်ပြုပြီးမှ မှာယူမှု ပြုလုပ်ပါမည်။ ငွေကောက်ခံမှုကို သီးခြား မှတ်တမ်းတင်ပါသည်။")}</Body>
    </Card>
    <Action title={t("Confirm and place order", "အတည်ပြုပြီး မှာယူရန်")} onPress={onSubmit} />
  </>;
}
