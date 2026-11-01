import type { GuestLocale } from "./i18n";

const en = {
  dineIn: "Dine in", takeaway: "Takeaway / pickup", table: "Table", cart: "Your order",
  scan: "Scan this restaurant’s Table QR or Common QR to order. No account is needed.",
  validating: "Checking your QR link…", ready: "QR verified. You can place your order.",
  invalid: "This QR link is invalid, has changed or is no longer available. Scan the current code again.",
  error: "We couldn’t verify your QR link. Check your connection and try again.",
  retry: "Try again", emptyCart: "Your cart is empty. Choose a dish from the menu.",
  add: "Add to order", added: "Added to your order.", configure: "Choose your options",
  variant: "Size or variant", chooseVariant: "Choose a variant", modifiers: "Options",
  selections: "Choose", optional: "Optional", required: "Required", quantity: "Quantity",
  modifierQuantity: "Option quantity", notes: "Notes for the kitchen", notesHint: "Up to 500 characters.",
  unavailable: "This dish is unavailable right now.", orderingUnavailable: "Ordering is unavailable right now. Please ask restaurant staff.", remove: "Remove", submit: "Place order",
  submitting: "Placing your order…", safeRetry: "Retry the same order safely",
  uncertain: "Confirmation is delayed. Keep this page open and retry the same order. Your cart is locked to prevent duplicate orders.",
  finalPrices: "The restaurant checks stock, options and final prices when you place the order.",
  confirmed: "Order received", orderNumber: "Order number", subtotal: "Subtotal", deliveryFee: "Delivery fee",
  discount: "Discount", total: "Total", orderStatus: "Order status", queueStatus: "Queue status",
  queue: "Your pickup number", queueDate: "Order date", dateScoped: "Pickup numbers are issued per restaurant day. Use this number with its order date.",
  refresh: "Refresh status", trackingError: "Updates are temporarily unavailable. We’ll reconnect automatically; you can also refresh.",
  tableStatus: "This is the status confirmed when your order was placed. Ask restaurant staff for updates.",
  liveStatus: "This page checks for pickup updates automatically. Keep it open to receive updates.",
  sound: "Enable pickup sound", soundOn: "Pickup sound enabled", soundUnavailable: "Sound could not be enabled. Follow the status shown here.",
  soundHint: "Sound is optional. Tap to allow it on this device; playback may stop if this page is closed or suspended.",
  notifications: "Pickup updates", keepOpen: "Keep this page open for updates. If an unconfirmed checkout is interrupted by a reload, scan the same original QR to recover and retry that order. Credentials are cleared on reload.",
  invalidSelection: "Check the variant, options, quantity and available stock before adding this dish.",
  selection: "An item, option or quantity is no longer available. Review your cart and the current menu.",
  conflict: "The order result is not confirmed yet. Retry the same order safely.",
  expired: "The safe retry window has ended. Ask the restaurant to confirm whether this order was received before placing another order.",
  configuration: "Ordering is unavailable. Please contact restaurant staff.",
  retryError: "The connection was interrupted. Please try again.",
  pending: "Received", accepted: "Accepted", preparing: "Preparing", statusReady: "Ready for pickup",
  called: "Please collect your order", completed: "Completed", cancelled: "Cancelled", waiting: "Waiting",
  outForDelivery: "Out for delivery", unknownStatus: "Status unavailable",
} as const;

type OrderingMessages = { [K in keyof typeof en]: string };
const my: OrderingMessages = {
  dineIn: "ဆိုင်တွင် စားရန်", takeaway: "ပါဆယ် / လာယူရန်", table: "စားပွဲ", cart: "သင့်အော်ဒါ",
  scan: "အော်ဒါတင်ရန် ဤဆိုင်၏ စားပွဲ QR သို့မဟုတ် Common QR ကို စကင်ဖတ်ပါ။ အကောင့်မလိုပါ။",
  validating: "QR လင့်ခ်ကို စစ်ဆေးနေပါသည်…", ready: "QR အတည်ပြုပြီးပါပြီ။ အော်ဒါတင်နိုင်ပါပြီ။",
  invalid: "ဤ QR လင့်ခ် မမှန်ပါ၊ ပြောင်းလဲထားပါသည် သို့မဟုတ် မရရှိနိုင်တော့ပါ။ လက်ရှိ QR ကို ပြန်စကင်ဖတ်ပါ။",
  error: "QR ကို အတည်မပြုနိုင်ပါ။ အင်တာနက်ချိတ်ဆက်မှု စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။",
  retry: "ထပ်ကြိုးစားရန်", emptyCart: "ခြင်းတောင်းထဲတွင် ဘာမှမရှိသေးပါ။ မီနူးမှ ဟင်းလျာရွေးပါ။",
  add: "အော်ဒါထဲ ထည့်ရန်", added: "သင့်အော်ဒါထဲသို့ ထည့်ပြီးပါပြီ။", configure: "စိတ်ကြိုက် ရွေးချယ်ပါ",
  variant: "အရွယ်အစား သို့မဟုတ် အမျိုးအစား", chooseVariant: "အမျိုးအစား ရွေးပါ", modifiers: "ထပ်ဆောင်း ရွေးချယ်စရာများ",
  selections: "ရွေးချယ်ရန်", optional: "ရွေးချယ်နိုင်သည်", required: "မဖြစ်မနေ", quantity: "အရေအတွက်",
  modifierQuantity: "ရွေးချယ်စရာ အရေအတွက်", notes: "မီးဖိုချောင်သို့ မှတ်ချက်", notesHint: "စာလုံး ၅၀၀ အထိ။",
  unavailable: "ဤဟင်းလျာကို လောလောဆယ် မရရှိနိုင်ပါ။", orderingUnavailable: "လောလောဆယ် အော်ဒါတင်၍ မရပါ။ ဆိုင်ဝန်ထမ်းကို မေးမြန်းပါ။", remove: "ဖယ်ရှားရန်", submit: "အော်ဒါတင်ရန်",
  submitting: "အော်ဒါတင်နေပါသည်…", safeRetry: "အော်ဒါတူကို လုံခြုံစွာ ထပ်ကြိုးစားရန်",
  uncertain: "အတည်ပြုချက် ကြန့်ကြာနေပါသည်။ ဤစာမျက်နှာကို ဖွင့်ထားပြီး အော်ဒါတူကို ထပ်ကြိုးစားပါ။ အော်ဒါထပ်မဖြစ်စေရန် ခြင်းတောင်းကို ပိတ်ထားပါသည်။",
  finalPrices: "အော်ဒါတင်ချိန်တွင် ဆိုင်မှ လက်ကျန်ပစ္စည်း၊ ရွေးချယ်မှုများနှင့် နောက်ဆုံးဈေးနှုန်းကို စစ်ဆေးပါမည်။",
  confirmed: "အော်ဒါလက်ခံရရှိပါပြီ", orderNumber: "အော်ဒါနံပါတ်", subtotal: "စုစုပေါင်းဈေး", deliveryFee: "ပို့ဆောင်ခ",
  discount: "လျှော့ဈေး", total: "ကျသင့်ငွေ", orderStatus: "အော်ဒါအခြေအနေ", queueStatus: "တန်းစီအခြေအနေ",
  queue: "သင့်ပါဆယ်နံပါတ်", queueDate: "အော်ဒါရက်စွဲ", dateScoped: "ပါဆယ်နံပါတ်ကို ဆိုင်၏နေ့စွဲအလိုက် ထုတ်ပေးပါသည်။ အော်ဒါရက်စွဲနှင့်တွဲ၍ သုံးပါ။",
  refresh: "အခြေအနေ ပြန်ဖွင့်ရန်", trackingError: "လောလောဆယ် အခြေအနေ မရရှိနိုင်ပါ။ အလိုအလျောက် ပြန်ချိတ်ဆက်ပါမည်။ ကိုယ်တိုင်လည်း ပြန်ဖွင့်နိုင်ပါသည်။",
  tableStatus: "ဤအခြေအနေသည် အော်ဒါတင်စဉ် အတည်ပြုထားသော အခြေအနေဖြစ်ပါသည်။ နောက်ဆုံးအခြေအနေကို ဆိုင်ဝန်ထမ်းထံ မေးမြန်းပါ။",
  liveStatus: "ပါဆယ်အခြေအနေကို အလိုအလျောက် စစ်ဆေးပါသည်။ အကြောင်းကြားချက်ရရန် ဤစာမျက်နှာကို ဖွင့်ထားပါ။",
  sound: "ပါဆယ်အသံဖွင့်ရန်", soundOn: "ပါဆယ်အသံ ဖွင့်ထားပါသည်", soundUnavailable: "အသံမဖွင့်နိုင်ပါ။ ဤနေရာရှိ အခြေအနေကို ကြည့်ပါ။",
  soundHint: "အသံကို မဖြစ်မနေ ဖွင့်ရန်မလိုပါ။ ဤစက်တွင် ခွင့်ပြုရန် နှိပ်ပါ။ စာမျက်နှာပိတ်ထားလျှင် အသံရပ်သွားနိုင်ပါသည်။",
  notifications: "ပါဆယ် အကြောင်းကြားချက်များ", keepOpen: "အခြေအနေ သိရှိရန် ဤစာမျက်နှာကို ဖွင့်ထားပါ။ အတည်မပြုရသေးသော အော်ဒါတင်စဉ် စာမျက်နှာပြန်ဖွင့်မိပါက မူရင်း QR အတူတူကို ပြန်စကင်ဖတ်ပြီး ထိုအော်ဒါကို ပြန်ယူကာ ထပ်ကြိုးစားပါ။ ပြန်ဖွင့်ချိန်တွင် QR အချက်အလက် ပျက်သွားပါသည်။",
  invalidSelection: "အမျိုးအစား၊ ရွေးချယ်စရာ၊ အရေအတွက်နှင့် လက်ကျန်ပစ္စည်းကို စစ်ဆေးပြီး ထည့်ပါ။",
  selection: "ပစ္စည်း၊ ရွေးချယ်စရာ သို့မဟုတ် အရေအတွက် မရရှိနိုင်တော့ပါ။ ခြင်းတောင်းနှင့် လက်ရှိမီနူးကို ပြန်စစ်ဆေးပါ။",
  conflict: "အော်ဒါရလဒ်ကို အတည်မပြုရသေးပါ။ အော်ဒါတူကို လုံခြုံစွာ ထပ်ကြိုးစားပါ။",
  expired: "လုံခြုံစွာ ထပ်ကြိုးစားနိုင်သည့်အချိန် ကုန်ဆုံးသွားပါပြီ။ အော်ဒါအသစ် မတင်မီ ဤအော်ဒါ ရရှိပြီးမပြီးကို ဆိုင်ထံ အတည်ပြုပါ။",
  configuration: "အော်ဒါတင်ခြင်း မရရှိနိုင်ပါ။ ဆိုင်ဝန်ထမ်းကို ဆက်သွယ်ပါ။",
  retryError: "အင်တာနက်ချိတ်ဆက်မှု ပြတ်တောက်သွားပါသည်။ ထပ်ကြိုးစားပါ။",
  pending: "လက်ခံရရှိပါပြီ", accepted: "လက်ခံပြီးပါပြီ", preparing: "ပြင်ဆင်နေပါသည်", statusReady: "လာယူနိုင်ပါပြီ",
  called: "အော်ဒါကို လာယူပါ", completed: "ပြီးစီးပါပြီ", cancelled: "ပယ်ဖျက်ထားပါသည်", waiting: "စောင့်ဆိုင်းနေပါသည်",
  outForDelivery: "ပို့ဆောင်နေပါသည်", unknownStatus: "အခြေအနေ မရရှိနိုင်ပါ",
};

export const orderingMessages: Record<GuestLocale, OrderingMessages> = { en, my };

export function orderStatusLabel(status: string, locale: GuestLocale): string {
  const text = orderingMessages[locale];
  const statuses: Record<string, string> = {
    PENDING: text.pending, ACCEPTED: text.accepted, PREPARING: text.preparing,
    READY: text.statusReady, CALLED: text.called, COMPLETED: text.completed,
    CANCELLED: text.cancelled, WAITING: text.waiting, OUT_FOR_DELIVERY: text.outForDelivery,
  };
  return statuses[status] ?? text.unknownStatus;
}
