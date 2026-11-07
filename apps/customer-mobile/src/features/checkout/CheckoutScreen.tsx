import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import type { CustomerAddressResponse, DeliveryQuoteResponse } from "@restaurant-platform/shared-types";
import { getCustomerApi } from "../../api";
import { Action, Body, Card, FormField, Page } from "../../components/ui";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useCustomerLanguage, useCustomerText } from "../../i18n";
import { readEmbeddedTenant } from "../../tenant";
import { savedPin } from "../addresses/address";
import { AddressMap } from "../addresses/AddressMap";
import { DestinationPin } from "../addresses/DestinationPin";
import { confirmPin, emptyPin, LocationSelectionError, selectPin, type Coordinates } from "../addresses/location";
import { suggestCurrentLocation } from "../addresses/native-location";
import { useCustomerCart } from "../cart/CartProvider";
import type { CustomerAccount } from "../profile/AccountProvider";
import { useCustomerCheckout, type CheckoutAttempt } from "./CheckoutProvider";
import { addressText, checkoutError, defaultAddress, quoteRequest, type DestinationDetails } from "./destination";

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
  const { state: zoneState } = useApiQuery(signal => getCustomerApi().getDeliveryZones({ signal }), "checkout-zones");
  const [addressId, setAddressId] = useState(() => defaultAddress(addresses)?.id);
  const saved = addresses.find(address => address.id === addressId);
  const [temporary, setTemporary] = useState(false);
  const [pin, setPin] = useState(emptyPin);
  const [draftPin, setDraftPin] = useState(emptyPin);
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<DestinationDetails>(() => contact(saved));
  const [review, setReview] = useState<CheckoutAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteInFlight = useRef<AbortController | null>(null);
  const gps = useRef(0);
  useEffect(() => () => { gps.current++; quoteInFlight.current?.abort(); }, []);

  function contact(address?: CustomerAddressResponse): DestinationDetails {
    return { recipientName: address?.recipientName || profile.fullName || "", recipientPhone: profile.phone || "",
      deliveryNote: address?.deliveryNote ?? "", address: "", township: "", city: "" };
  }

  function resetReview() { setReview(null); setError(null); checkout.reset(); }
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

  function openMap() {
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
        ? t("Location permission was denied. Choose a pin manually.", "တည်နေရာ အသုံးပြုခွင့် မရပါ။ မြေပုံပေါ်တွင် ကိုယ်တိုင်ရွေးပါ။")
        : t("Current location is unavailable. Choose a pin manually.", "လက်ရှိတည်နေရာ ရှာမတွေ့ပါ။ မြေပုံပေါ်တွင် ကိုယ်တိုင်ရွေးပါ။"));
    } finally {
      if (generation === gps.current) setLocating(false);
    }
  }
  function select(coordinates: Coordinates) {
    gps.current++;
    setLocating(false);
    setNotice(null);
    setDraftPin(selectPin(coordinates, draftPin.source === "gps" ? "gps" : "map"));
  }
  function confirm() {
    resetReview();
    if (!temporary) setDetails(contact());
    setPin(confirmPin(draftPin));
    setTemporary(true);
    closeMap();
  }

  async function requestQuote() {
    if (quoteInFlight.current) return;
    resetReview();
    const destination = temporary ? { pin } : saved ? { saved } : null;
    const request = destination && quoteRequest(destination, details, cart.items);
    if (!request) {
      setError(t("Confirm a valid pin and fill in the delivery address, recipient name and phone.", "မှန်ကန်သော နေရာကို အတည်ပြုပြီး ပို့ဆောင်ရန်လိပ်စာ၊ လက်ခံသူအမည်နှင့် ဖုန်းနံပါတ် ဖြည့်ပါ။"));
      return;
    }
    const controller = new AbortController();
    quoteInFlight.current = controller;
    setQuoting(true);
    try {
      const quote = await getCustomerApi().quoteDelivery(request, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Number.isSafeInteger(quote.totalAmount) || quote.totalAmount < 0) {
        setError(t("The quoted total cannot be displayed accurately. Review the cart and try again.",
          "တွက်ချက်ထားသော စုစုပေါင်းငွေကို တိကျစွာ မပြနိုင်ပါ။ ခြင်းတောင်းကို ပြန်စစ်ပြီး ထပ်ကြိုးစားပါ။"));
        return;
      }
      setReview({ body: { ...request, confirmationToken: quote.confirmationToken }, quote });
    } catch (cause) {
      if (!controller.signal.aborted) setError(checkoutError(cause, t));
    } finally {
      if (!controller.signal.aborted) setQuoting(false);
      quoteInFlight.current = null;
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
        <Body>{t("The server found no order for the previous checkout. Review your order history before starting a new checkout.",
          "ယခင်ငွေရှင်းမှုအတွက် ဆာဗာတွင် မှာယူမှုမတွေ့ပါ။ အသစ်မမှာယူမီ မှာယူမှုမှတ်တမ်းကို စစ်ဆေးပါ။")}</Body>
        <Action title={t("Check again", "ပြန်စစ်ရန်")} onPress={() => void checkout.recover()} secondary />
        <Action title={t("Start a new checkout", "အသစ်မှာယူရန်")} onPress={() => void checkout.clearUnrecorded()} />
      </> : null}
      {status !== "recovering" ? <Action title={ordersLabel} secondary onPress={onOrders} /> : null}
    </Card></Page>;
  }
  if (checkout.state.status === "created") {
    const { order } = checkout.state;
    function finish() {
      const initial = defaultAddress(addresses);
      resetReview();
      setTemporary(false);
      setPin(emptyPin);
      setDraftPin(emptyPin);
      setAddressId(initial?.id);
      setDetails(contact(initial));
    }
    return <Page title={t("Order confirmed", "မှာယူမှု အတည်ပြုပြီးပါပြီ")}>
      <Card title={order.orderNumber}>
        <Body>{tenant.branding.displayName}</Body>
        <Body>{order.totalAmount.toLocaleString(language)} {order.currency} · {paymentLabel}</Body>
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
          <Action title={ordersLabel} secondary onPress={onOrders} />
        </> : null}
      </Card>
    </Page>;
  }
  const rejected = checkout.state.status === "rejected";
  const activeReview = !rejected && review?.body.items === cart.items ? review : null;
  if (activeReview) return <Page title={title}>
    <QuoteReview quote={activeReview.quote} locationLabel={temporary ? temporaryLabel : saved?.label}
      onChange={resetReview} onSubmit={() => void checkout.submit(activeReview)} />
  </Page>;
  if (!cart.items.length) return <Page title={title}><Card>
    <Body>{t("Your cart is empty.", "ခြင်းတောင်းထဲတွင် ပစ္စည်းမရှိသေးပါ။")}</Body>
    <Action title={backToCart} onPress={onCart} />
  </Card></Page>;

  const coordinates = temporary ? pin.coordinates : savedPin(saved).coordinates;
  const problem = checkout.state.status === "rejected" ? checkoutError(checkout.state.error, t) : error;
  const areas = zoneState.status === "ready" ? zoneState.data.flatMap(zone =>
    zone.coverageCity && zone.coverageTownship ? [{ city: zone.coverageCity, township: zone.coverageTownship }] : []) : [];
  const distinctAreas = [...new Map(areas.map(area => [`${area.city}, ${area.township}`, area])).values()];
  return <>
    <Page title={title} subtitle={tenant.branding.displayName}>
      <Card title={t("Delivery location", "ပို့ဆောင်မည့်နေရာ")}>
        <Body>{t("Use a saved address or choose a location for this order.", "သိမ်းထားသည့်လိပ်စာကို သုံးပါ သို့မဟုတ် ယခုမှာယူမှုအတွက် နေရာအသစ်ရွေးပါ။")}</Body>
        {addresses.map(address => <Action key={address.id}
          title={`${t("Use saved address", "သိမ်းထားသည့်လိပ်စာသုံးရန်")} · ${address.label}${address.isDefault ? ` (${t("default", "မူလ")})` : ""}`}
          secondary={temporary || address.id !== addressId} selected={!temporary && address.id === addressId}
          disabled={quoting} onPress={() => useSaved(address)} />)}
        <Action title={t("Choose another location on map", "မြေပုံပေါ်တွင် နေရာအသစ်ရွေးရန်")}
          secondary disabled={!tenant.mapsConfigured || quoting} onPress={openMap} />
        <Action title={t("Use my current location", "လက်ရှိတည်နေရာ သုံးရန်")}
          secondary disabled={!tenant.mapsConfigured || quoting} onPress={() => { openMap(); void locate(); }} />
        {!tenant.mapsConfigured ? <Body>{t("Google Maps is unavailable in this build. You can still use a saved address with a confirmed pin.",
          "ဤအက်ပ်တွင် Google Maps အသုံးမပြုနိုင်ပါ။ နေရာအတည်ပြုထားသော သိမ်းဆည်းပြီးလိပ်စာကို သုံးနိုင်ပါသည်။")}</Body> : null}
        {temporary ? <Body>{temporaryLabel}</Body> : saved ? <Body>{addressText(saved)}</Body> : null}
        {coordinates ? <DestinationPin latitude={coordinates.latitude} longitude={coordinates.longitude} language={language} />
          : saved ? <Body>{t("This address needs a confirmed map pin. Edit it in Profile or choose another location.",
            "ဤလိပ်စာအတွက် မြေပုံနေရာ အတည်ပြုရန် လိုပါသည်။ ပရိုဖိုင်တွင် ပြင်ပါ သို့မဟုတ် နေရာအသစ်ရွေးပါ။")}</Body> : null}
      </Card>
      {temporary || saved ? <Card title={t("Delivery details", "ပို့ဆောင်မှု အချက်အလက်")}>
        {temporary ? <>
          <FormField label={t("Full address (building, floor, street and ward)", "လိပ်စာအပြည့်အစုံ (တိုက်၊ အထပ်၊ လမ်းနှင့် ရပ်ကွက်)")}
            value={details.address} onChangeText={value => update("address", value)} maxLength={500} editable={!quoting} multiline />
          <FormField label={t("Township or area", "မြို့နယ် သို့မဟုတ် ဧရိယာ")} value={details.township}
            onChangeText={value => update("township", value)} maxLength={100} editable={!quoting} />
          <FormField label={t("City", "မြို့")} value={details.city} onChangeText={value => update("city", value)} maxLength={100} editable={!quoting} />
          {distinctAreas.length ? <Body>{t("Configured delivery areas", "သတ်မှတ်ထားသော ပို့ဆောင်မှု ဧရိယာများ")}</Body> : null}
          {distinctAreas.map(area => <Action key={`${area.city}, ${area.township}`} title={`${area.township}, ${area.city}`}
            disabled={quoting} secondary onPress={() => {
              resetReview();
              setDetails(previous => ({ ...previous, ...area }));
            }} />)}
        </> : null}
        <FormField label={t("Recipient name", "လက်ခံသူအမည်")} value={details.recipientName}
          onChangeText={value => update("recipientName", value)} maxLength={150} editable={!quoting} />
        <FormField label={t("Contact phone", "ဆက်သွယ်ရန် ဖုန်းနံပါတ်")} value={details.recipientPhone} keyboardType="phone-pad"
          onChangeText={value => update("recipientPhone", value)} maxLength={30} editable={!quoting} />
        <FormField label={t("Landmark or delivery instructions", "အနီးရှိ အမှတ်အသား သို့မဟုတ် ပို့ဆောင်ရန် မှာကြားချက်")}
          value={details.deliveryNote} onChangeText={value => update("deliveryNote", value)} maxLength={2000} editable={!quoting} multiline />
        <Body>{paymentLabel}</Body>
        {problem ? <Text accessibilityRole="alert" style={{ color: "#b91c1c" }}>{problem}</Text> : null}
        <Action title={quoting ? t("Checking delivery…", "ပို့ဆောင်နိုင်မှု စစ်ဆေးနေပါသည်…") : t("Check delivery and review total", "ပို့ဆောင်နိုင်မှုနှင့် စုစုပေါင်းငွေ စစ်ရန်")}
          disabled={quoting || !coordinates} onPress={() => void requestQuote()} />
      </Card> : null}
      <Action title={backToCart} secondary onPress={onCart} />
    </Page>
    {mapOpen ? <AddressMap language={language} selection={draftPin} locating={locating} notice={notice}
      onSelect={select} onConfirm={confirm} onCancel={closeMap} onLocate={() => void locate()} /> : null}
  </>;
}

function QuoteReview({ quote, locationLabel, onSubmit, onChange }: {
  quote: DeliveryQuoteResponse;
  locationLabel?: string;
  onSubmit(): void;
  onChange(): void;
}) {
  const t = useCustomerText();
  const language = useCustomerLanguage();
  const { destination } = quote;
  const amount = (value: number) => `${value.toLocaleString(language)} ${quote.currency}`;
  return <Card title={t("Confirm delivery location and total", "ပို့ဆောင်မည့်နေရာနှင့် စုစုပေါင်းငွေ အတည်ပြုရန်")}>
    <Body>{quote.restaurantName}</Body>
    {locationLabel ? <Body>{locationLabel}</Body> : null}
    <Body>{destination.address}</Body>
    <Body>{destination.recipientName} · {destination.recipientPhone}</Body>
    {destination.deliveryNote ? <Body>{destination.deliveryNote}</Body> : null}
    <DestinationPin latitude={destination.latitude} longitude={destination.longitude} language={language} />
    <Body>{t("Delivery available", "ပို့ဆောင်နိုင်ပါသည်")}</Body>
    {quote.lines.map((line, index) => <Body key={`${line.productId}:${index}`}>
      {[line.productName, line.variantName, ...line.modifiers.map(option => option.name)].filter(Boolean).join(" · ")} × {line.quantity} · {amount(line.subtotal)}
    </Body>)}
    <Body>{t("Cart subtotal", "ပစ္စည်း စုစုပေါင်း")} · {amount(quote.subtotal)}</Body>
    <Body>{t("Delivery fee", "ပို့ဆောင်ခ")} · {amount(quote.deliveryFee)}</Body>
    <Body>{t("Discount", "လျှော့ဈေး")} · {amount(quote.discountAmount)}</Body>
    <Body>{t("Total", "စုစုပေါင်း")} · {amount(quote.totalAmount)}</Body>
    <Body>{t("Cash on delivery", "ပစ္စည်းရောက်မှ ငွေချေမည်")}</Body>
    <Action title={t("Confirm and place order", "အတည်ပြုပြီး မှာယူရန်")} onPress={onSubmit} />
    <Action title={t("Change delivery details", "ပို့ဆောင်မှု အချက်အလက် ပြင်ရန်")} onPress={onChange} secondary />
  </Card>;
}
