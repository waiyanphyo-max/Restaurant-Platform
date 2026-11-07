import { ApiHttpError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import type { CreateOrderItemRequest, CustomerAddressResponse, DeliveryQuoteRequest } from "@restaurant-platform/shared-types";
import { savedPin } from "../addresses/address";
import { validCoordinates, type PinSelection } from "../addresses/location";

export const defaultAddress = (addresses: readonly CustomerAddressResponse[]) =>
  addresses.find(address => address.isDefault) ?? addresses[0];

export const addressText = (address: CustomerAddressResponse) =>
  [address.houseNo, address.street, address.ward, address.township, address.city].filter(Boolean).join(", ");

export interface DestinationDetails {
  recipientName: string;
  recipientPhone: string;
  deliveryNote: string;
  address: string;
  township: string;
  city: string;
}

export type Destination = { saved: CustomerAddressResponse } | { pin: PinSelection };

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

export function quoteRequest(destination: Destination, details: DestinationDetails, items: CreateOrderItemRequest[]): DeliveryQuoteRequest | null {
  const { recipientName, recipientPhone, deliveryNote, address, township, city } = details;
  const phone = normalizeRecipientPhone(recipientPhone);
  if (!items.length || !recipientName.trim() || !phone) return null;
  const fields = { recipientName: recipientName.trim(), recipientPhone: phone, deliveryNote: deliveryNote.trim(), items };
  if ("saved" in destination) {
    return savedPin(destination.saved).coordinates ? { ...fields, addressId: destination.saved.id } : null;
  }
  const { coordinates, confirmed, source } = destination.pin;
  if (!confirmed || !coordinates || !validCoordinates(coordinates) || (source !== "gps" && source !== "map") ||
      !address.trim() || !city.trim() || !township.trim()) return null;
  return { ...fields, temporaryDestination: {
    source: source === "gps" ? "GPS_CONFIRMED" : "MANUAL_MAP",
    address: address.trim(), city: city.trim(), township: township.trim(), ...coordinates
  } };
}

type Text = (en: string, my: string) => string;

export function invalidRecipientPhoneMessage(t: Text): string {
  return t("Enter a Myanmar phone number starting with 0 or an international number with its country code.",
    "၀ ဖြင့် စသော မြန်မာဖုန်းနံပါတ် သို့မဟုတ် နိုင်ငံကုဒ်ပါသော နိုင်ငံတကာဖုန်းနံပါတ်ကို ဖြည့်ပါ။");
}

export function checkoutError(error: unknown, t: Text): string {
  if (error instanceof MissingAccessTokenError || error instanceof ApiHttpError && (error.status === 401 || error.status === 403)) {
    return t("Your session has expired. Sign in again to continue.", "သင့်အကောင့် ဝင်ရောက်ချိန် ကုန်ဆုံးသွားပါပြီ။ ဆက်လုပ်ရန် ပြန်ဝင်ပါ။");
  }
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
        return t("Choose a valid saved address or confirm a pin and complete the delivery address.", "မှန်ကန်သော သိမ်းထားသည့်လိပ်စာကို ရွေးပါ သို့မဟုတ် မြေပုံနေရာကို အတည်ပြုပြီး လိပ်စာဖြည့်ပါ။");
      case "DELIVERY_CONTACT_REQUIRED":
        return t("Check the recipient name and contact phone.", "လက်ခံသူအမည်နှင့် ဆက်သွယ်ရန် ဖုန်းနံပါတ်ကို စစ်ဆေးပါ။");
      case "INVALID_DELIVERY_PHONE":
        return invalidRecipientPhoneMessage(t);
    }
  }
  return t("The delivery quote could not be confirmed. Check your connection and details, then try again.", "ပို့ဆောင်ခကို အတည်မပြုနိုင်ပါ။ အင်တာနက်နှင့် အချက်အလက်များ စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။");
}
