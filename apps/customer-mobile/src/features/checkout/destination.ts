import { ApiHttpError } from "@restaurant-platform/api-client";
import type { CreateOrderItemRequest, CustomerAddressResponse, DeliveryQuoteRequest, LocationSelection } from "@restaurant-platform/shared-types";
import { apiFailure, apiFailureMessage } from "../../hooks/apiFailure";
import { validCoordinates, type PinSelection } from "../addresses/location";

export const defaultAddress = (addresses: readonly CustomerAddressResponse[]) =>
  addresses.find(address => address.isDefault) ?? addresses[0];

export const addressText = (address: CustomerAddressResponse) =>
  [address.houseNo, address.street, address.ward, address.township, address.districtName, address.regionName || address.city].filter(Boolean).join(", ");

export interface DestinationDetails extends Partial<LocationSelection> {
  recipientName: string;
  recipientPhone: string;
  deliveryNote: string;
  address: string;
  township: string;
  city: string;
  ward?: string;
  street?: string;
  houseNo?: string;
}

export const detailedAddressText = (details: DestinationDetails) =>
  [details.houseNo, details.street, details.ward, details.address].filter(value => value?.trim()).map(value => value!.trim()).join(", ");

export type Destination = { saved: CustomerAddressResponse } | { pin: PinSelection } | { text: true };

/** Structural validation of a dialable checkout contact. Keep in sync with Spring. */
export function normalizeRecipientPhone(input: string): string | null {
  if (input.length > 30) return null;
  const ascii = input.trim().replace(/[\u1040-\u1049]/g, digit => String(digit.charCodeAt(0) - 0x1040));
  if (!/^\+?(?:[0-9. \u00a0\u202f-]|\([0-9]+\))+$/.test(ascii)) return null;

  let number = ascii.replace(/[. ()\u00a0\u202f-]/g, "");
  if (number.startsWith("00")) {
    number = `+${number.slice(2)}`;
  } else if (number.startsWith("0")) {
    number = `+95${number.slice(1)}`;
  }
  const format = number.startsWith("+95") ? /^\+95(?:9[0-9]{6,9}|[1-8][0-9]{5,8})$/ : /^\+[1-9][0-9]{6,14}$/;
  return format.test(number) ? number : null;
}

export function destinationProblem(destination: Destination | null, details: DestinationDetails, t: Text): string | null {
  if (!destination) return t("Choose a saved address or enter a delivery address.", "သိမ်းထားသောလိပ်စာကို ရွေးပါ သို့မဟုတ် ပို့ဆောင်ရန်လိပ်စာ ဖြည့်ပါ။");
  const saved = "saved" in destination ? destination.saved : null;
  if (!(saved ? [saved.houseNo, saved.street, saved.ward].some(value => value?.trim()) : detailedAddressText(details))) {
    return t("Enter a detailed street, building or ward address.", "လမ်း၊ တိုက် သို့မဟုတ် ရပ်ကွက် လိပ်စာအသေးစိတ် ဖြည့်ပါ။");
  }
  const location = saved ?? details;
  if (!location.regionId || !location.districtId || !location.townshipId) {
    return t("Select Region / State, District and Township. Review saved addresses in Profile if their location is missing.",
      "သတ်မှတ်ထားသော မြို့နှင့် မြို့နယ်ကို ရွေးပါ။ မပြည့်စုံသော သိမ်းထားသည့်လိပ်စာကို ပရိုဖိုင်တွင် ပြင်နိုင်ပါသည်။");
  }
  if (!details.recipientName.trim()) return t("Enter the recipient name.", "လက်ခံသူအမည် ဖြည့်ပါ။");
  if (!normalizeRecipientPhone(details.recipientPhone)) return invalidRecipientPhoneMessage(t);
  if (details.recipientName.trim().length > 150 || details.deliveryNote.trim().length > 2000 ||
      !saved && (detailedAddressText(details).length > 500 || details.city.trim().length > 100 || details.township.trim().length > 100 ||
        (details.ward?.length ?? 0) > 100 || (details.street?.length ?? 0) > 100 || (details.houseNo?.length ?? 0) > 50)) {
    return t("Shorten the delivery details to the supported field lengths.", "ပို့ဆောင်မှုအချက်အလက်များကို သတ်မှတ်ထားသော အရှည်အတွင်း ဖြည့်ပါ။");
  }
  if (saved && (saved.latitude != null || saved.longitude != null) &&
      (saved.latitude == null || saved.longitude == null || !validCoordinates({ latitude: saved.latitude, longitude: saved.longitude }))) {
    return t("This saved address has an invalid map location. Edit it in Profile or enter a text address.",
      "သိမ်းထားသောလိပ်စာ၏ မြေပုံနေရာ မမှန်ပါ။ ပရိုဖိုင်တွင် ပြင်ပါ သို့မဟုတ် လိပ်စာကို ကိုယ်တိုင်ဖြည့်ပါ။");
  }
  if ("pin" in destination && (!destination.pin.confirmed || !destination.pin.coordinates ||
      !validCoordinates(destination.pin.coordinates) || !["gps", "map"].includes(destination.pin.source ?? ""))) {
    return t("Confirm your selected map pin or enter a text address.", "ရွေးထားသော မြေပုံနေရာကို အတည်ပြုပါ သို့မဟုတ် လိပ်စာကို ကိုယ်တိုင်ဖြည့်ပါ။");
  }
  return null;
}

export function quoteRequest(destination: Destination, details: DestinationDetails, items: CreateOrderItemRequest[]): DeliveryQuoteRequest | null {
  const { recipientName, recipientPhone, deliveryNote, township, city, regionId, districtId, townshipId, ward, street, houseNo } = details;
  const address = detailedAddressText(details);
  const phone = normalizeRecipientPhone(recipientPhone);
  if (!items.length || !phone || destinationProblem(destination, details, en => en)) return null;
  const fields = { recipientName: recipientName.trim(), recipientPhone: phone, deliveryNote: deliveryNote.trim(), items };
  if ("saved" in destination) {
    return { ...fields, addressId: destination.saved.id };
  }
  if ("text" in destination) {
    return { ...fields, temporaryDestination: {
      source: "MANUAL_TEXT", address, city: city.trim(), township: township.trim(), regionId, districtId, townshipId,
      ward: ward?.trim() || null, street: street?.trim() || null, houseNo: houseNo?.trim() || null
    } };
  }
  const { coordinates, confirmed, source } = destination.pin;
  if (!confirmed || !coordinates || !validCoordinates(coordinates) || (source !== "gps" && source !== "map") ||
      !address.trim()) return null;
  return { ...fields, temporaryDestination: {
    source: source === "gps" ? "GPS_CONFIRMED" : "MANUAL_MAP",
    address, city: city.trim(), township: township.trim(), regionId, districtId, townshipId,
    ward: ward?.trim() || null, street: street?.trim() || null, houseNo: houseNo?.trim() || null, ...coordinates
  } };
}

type Text = (en: string, my: string) => string;

export function invalidRecipientPhoneMessage(t: Text): string {
  return t("Enter a Myanmar phone number starting with 0 or an international number with its country code.",
    "၀ ဖြင့် စသော မြန်မာဖုန်းနံပါတ် သို့မဟုတ် နိုင်ငံကုဒ်ပါသော နိုင်ငံတကာဖုန်းနံပါတ်ကို ဖြည့်ပါ။");
}

export function checkoutError(error: unknown, t: Text): string {
  if (error instanceof ApiHttpError) {
    switch (error.code) {
      case "DELIVERY_ADDRESS_OUTSIDE_ZONE":
      case "DELIVERY_UNAVAILABLE":
        return t("Delivery is unavailable for this location. Check the township and city or choose another location.", "ဤနေရာသို့ ပို့ဆောင်၍မရပါ။ မြို့နယ်နှင့် မြို့ကို စစ်ဆေးပါ သို့မဟုတ် နေရာအသစ်ရွေးပါ။");
      case "MINIMUM_ORDER_NOT_MET":
        return t("The cart is below the minimum order for this destination.", "ဤနေရာသို့ ပို့ဆောင်ရန် ခြင်းတောင်းရှိ ပမာဏသည် အနည်းဆုံးမှာယူငွေ မပြည့်သေးပါ။");
      case "DELIVERY_QUOTE_CHANGED":
        return t("Prices, delivery details, or the quote changed. Review a new quote before placing the order.", "ဈေးနှုန်း၊ ပို့ဆောင်မှုအချက်အလက် သို့မဟုတ် တွက်ချက်မှု ပြောင်းလဲသွားပါပြီ။ မမှာယူမီ အသစ်ပြန်စစ်ပါ။");
      case "INSUFFICIENT_STOCK":
      case "INVALID_PRODUCT":
      case "PRODUCT_UNAVAILABLE":
      case "PRODUCT_CATEGORY_INACTIVE":
      case "PRODUCT_VARIANT_REQUIRED":
      case "INVALID_PRODUCT_VARIANT":
      case "VARIANT_NOT_APPLICABLE":
      case "INVALID_MODIFIER_OPTION":
      case "MODIFIER_NOT_ALLOWED_FOR_PRODUCT":
      case "MODIFIER_GROUP_INACTIVE":
        return t("One or more items are unavailable. Review your cart.", "ပစ္စည်းအချို့ မရနိုင်ပါ။ ခြင်းတောင်းကို ပြန်စစ်ပါ။");
      case "INVALID_CUSTOMER_ADDRESS":
      case "DELIVERY_COORDINATES_REQUIRED":
      case "DELIVERY_ADDRESS_LOCATION_REQUIRED":
      case "DELIVERY_ADDRESS_REQUIRED":
      case "LOCATION_REQUIRED":
      case "LOCATION_MISMATCH":
      case "INVALID_LOCATION":
      case "AMBIGUOUS_LEGACY_LOCATION":
      case "CANONICAL_LOCATION_REQUIRED":
        return t("Complete your address details and select Region / State, District and Township. Review incomplete saved addresses in Profile.",
          "လမ်း သို့မဟုတ် တိုက်လိပ်စာ၊ မြို့နှင့် မြို့နယ်ကို ဖြည့်ပါ။ မပြည့်စုံသော သိမ်းထားသည့်လိပ်စာကို ပရိုဖိုင်တွင် ပြင်ပါ။");
      case "DELIVERY_CONTACT_REQUIRED":
        return t("Check the recipient name and contact phone.", "လက်ခံသူအမည်နှင့် ဆက်သွယ်ရန် ဖုန်းနံပါတ်ကို စစ်ဆေးပါ။");
      case "INVALID_DELIVERY_PHONE":
        return invalidRecipientPhoneMessage(t);
    }
  }
  const failure = apiFailure(error, "checkout");
  if (failure.kind !== "unknown") return apiFailureMessage(failure, t)!;
  return t("The delivery quote could not be confirmed. Check your connection and details, then try again.", "ပို့ဆောင်ခကို အတည်မပြုနိုင်ပါ။ အင်တာနက်နှင့် အချက်အလက်များ စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။");
}
