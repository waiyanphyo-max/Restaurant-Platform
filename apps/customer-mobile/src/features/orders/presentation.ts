import { localize, type CustomerLanguage } from "../../i18n";
import { formatMoney } from "../storefront/presentation";

const statuses: Record<string, [string, string]> = {
  PENDING: ["Pending", "စောင့်ဆိုင်းနေသည်"],
  ACCEPTED: ["Accepted", "လက်ခံပြီး"],
  PREPARING: ["Preparing", "ပြင်ဆင်နေသည်"],
  READY: ["Ready", "အသင့်ဖြစ်ပြီ"],
  OUT_FOR_DELIVERY: ["Out for delivery", "ပို့ဆောင်နေသည်"],
  COMPLETED: ["Completed", "ပြီးစီးပြီ"],
  CANCELLED: ["Cancelled", "ပယ်ဖျက်ပြီး"],
  WAITING_ASSIGNMENT: ["Waiting for a driver", "ပို့ဆောင်သူ တာဝန်ပေးရန် စောင့်နေသည်"],
  ASSIGNED: ["Driver assigned", "ပို့ဆောင်သူ တာဝန်ပေးပြီး"],
  PICKED_UP: ["Picked up", "ပစ္စည်း လာယူပြီး"],
  DELIVERED: ["Delivered", "ပို့ဆောင်ပြီး"],
  FAILED: ["Failed", "မအောင်မြင်ပါ"],
  PAID: ["Paid", "ငွေချေပြီး"],
  UNPAID: ["Cash due", "ငွေချေရန် ကျန်သေးသည်"],
  REFUNDED: ["Refunded", "ငွေ ပြန်အမ်းပြီး"]
};

export function statusLabel(value: string, language: CustomerLanguage) {
  const labels = statuses[value];
  return labels ? localize(language, ...labels) : value;
}

export function orderDate(value: string, language: CustomerLanguage) {
  return new Date(value).toLocaleString(language);
}

export function orderAmount(value: number, currency: string | null, language: CustomerLanguage) {
  return formatMoney(value, currency, language);
}

export function orderStatusTone(status: string): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (["CANCELLED", "FAILED"].includes(status)) return "danger";
  if (["COMPLETED", "DELIVERED", "PAID"].includes(status)) return "success";
  if (["PENDING", "WAITING_ASSIGNMENT"].includes(status)) return "warning";
  return "accent";
}

/** Payment labels come from the payment record, never order or delivery progress. */
export function paymentStatusLabel(method: string, status: string, language: CustomerLanguage) {
  const cash = method === "CASH_ON_DELIVERY" || method === "CASH_AT_COUNTER";
  if (cash && status === "PAID") return localize(language, "Cash payment recorded", "ငွေသား ပေးချေမှု မှတ်တမ်းတင်ပြီး");
  if (cash && status === "PENDING") return localize(language, "Cash due · Payment not yet collected", "ငွေချေရန် ကျန်သေးသည် · ငွေ မကောက်ခံရသေးပါ");
  if (status === "PENDING") return localize(language, "Payment pending", "ငွေပေးချေမှု စောင့်ဆိုင်းနေသည်");
  if (status === "CANCELLED") return localize(language, "Payment cancelled", "ငွေပေးချေမှု ပယ်ဖျက်ပြီး");
  return statusLabel(status, language);
}

const burmeseNotifications: Record<string, string> = {
  ORDER_CREATED: "မှာယူမှု လက်ခံရရှိပါပြီ",
  ORDER_ACCEPTED: "စားသောက်ဆိုင်က မှာယူမှုကို လက်ခံပြီးပါပြီ",
  ORDER_PREPARING: "သင့်အမှာစာကို ပြင်ဆင်နေပါသည်",
  ORDER_READY: "ပို့ဆောင်ရန် အသင့်ဖြစ်ပါပြီ",
  ORDER_CANCELLED: "မှာယူမှု ပယ်ဖျက်ပြီးပါပြီ",
  DELIVERY_ON_THE_WAY: "သင့်အမှာစာကို ပို့ဆောင်နေပါသည်",
  DELIVERY_COMPLETED: "ပို့ဆောင်ပြီးပါပြီ",
  DELIVERY_FAILED: "ပို့ဆောင်မှု မအောင်မြင်ပါ",
  DELIVERY_CANCELLED: "ပို့ဆောင်မှု ပယ်ဖျက်ပြီးပါပြီ"
};

export function notificationTitle(type: string, title: string, language: CustomerLanguage) {
  return language === "my-MM" ? burmeseNotifications[type] ?? title : title;
}
