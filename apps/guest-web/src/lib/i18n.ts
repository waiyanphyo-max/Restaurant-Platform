export const guestLocales = ["en", "my"] as const;
export type GuestLocale = (typeof guestLocales)[number];
export const localeCookie = "guest-language";

const en = {
  home: "Home", menu: "Menu", contact: "Contact", language: "Language",
  skip: "Skip to content", welcome: "Welcome to our table", browse: "Explore the menu",
  welcomeNote: "Something good starts here.", menuIntro: "Find your next favourite.",
  guestNote: "Browse freely. No account needed for QR ordering.",
  categories: "Menu categories", allItems: "All dishes", details: "View details",
  available: "Available", unavailable: "Unavailable", soldOut: "Sold out",
  priceUnavailable: "Price unavailable", from: "From", variants: "Sizes & variants",
  modifiers: "Make it yours", required: "Required", optional: "Optional",
  selectionRange: "Selections", noOptions: "No options are available right now.",
  availabilityNote: "Availability and prices are checked again when an order is placed.",
  emptyTitle: "The menu is being prepared", emptyNote: "Please check back soon or speak to the restaurant.",
  unavailableTitle: "The restaurant is unavailable right now",
  unavailableNote: "The menu cannot be served at the moment. Please try again later.",
  errorTitle: "We couldn’t load the menu", errorNote: "Check your connection and try again.",
  notFoundTitle: "This page isn’t available", notFoundNote: "Check the restaurant link or return to the menu.",
  unknownTitle: "Restaurant site unavailable", unknownNote: "This address is not configured for a restaurant.",
  retry: "Try again", back: "Back to menu", loading: "Preparing your menu…",
  loadingNote: "Just a moment while we load the latest dishes.",
  contactTitle: "Come by. Say hello.", phone: "Call the restaurant", address: "Find us",
  contactMissing: "Please ask the restaurant for contact details and opening hours.",
  hoursNote: "Contact the restaurant to confirm opening hours.",
  qrChecking: "Checking your QR link…", qrReady: "Your QR link is ready. No sign-in needed.",
  qrInvalid: "This QR link has no usable credential. Please scan the original code again.",
  qrFoundation: "Explore the menu below. Order checkout will be available in a later update.",
  ownerTitle: "Restaurant owner link", ownerNote: "Use your restaurant’s Operations application to manage the restaurant.",
  noItems: "No dishes in this category yet.", noDescription: "See available choices and prices below.",
  footer: "Made for good food & good company.", count: "dishes", menuUnavailable: "Menu unavailable",
} as const;

type Messages = { [K in keyof typeof en]: string };
const my: Messages = {
  home: "ပင်မစာမျက်နှာ", menu: "မီနူး", contact: "ဆက်သွယ်ရန်", language: "ဘာသာစကား",
  skip: "အကြောင်းအရာသို့ သွားရန်", welcome: "ကျွန်ုပ်တို့ဆိုင်မှ ကြိုဆိုပါသည်", browse: "မီနူးကြည့်ရန်",
  welcomeNote: "အရသာကောင်းများ ဒီမှာစတင်ပါသည်။", menuIntro: "နှစ်သက်ရာ ဟင်းလျာကို ရွေးချယ်ပါ။",
  guestNote: "မီနူးကို လွတ်လပ်စွာ ကြည့်ရှုပါ။ QR မှ မှာယူရန် အကောင့်မလိုပါ။",
  categories: "မီနူးအမျိုးအစားများ", allItems: "ဟင်းလျာအားလုံး", details: "အသေးစိတ်ကြည့်ရန်",
  available: "ရရှိနိုင်ပါသည်", unavailable: "မရရှိနိုင်ပါ", soldOut: "ကုန်သွားပါပြီ",
  priceUnavailable: "ဈေးနှုန်းမရရှိနိုင်ပါ", from: "စတင်ဈေး", variants: "အရွယ်အစားနှင့် ရွေးချယ်စရာများ",
  modifiers: "စိတ်ကြိုက်ရွေးချယ်စရာများ", required: "မဖြစ်မနေ", optional: "ရွေးချယ်နိုင်သည်",
  selectionRange: "ရွေးချယ်နိုင်သည့် အရေအတွက်", noOptions: "လောလောဆယ် ရွေးချယ်စရာ မရှိသေးပါ။",
  availabilityNote: "အော်ဒါတင်ချိန်တွင် ရရှိနိုင်မှုနှင့် ဈေးနှုန်းကို ထပ်မံစစ်ဆေးပါမည်။",
  emptyTitle: "မီနူးကို ပြင်ဆင်နေပါသည်", emptyNote: "နောက်မှ ပြန်ကြည့်ပါ သို့မဟုတ် ဆိုင်ကို ဆက်သွယ်ပါ။",
  unavailableTitle: "လောလောဆယ် ဆိုင်ကို မရရှိနိုင်ပါ", unavailableNote: "မီနူးကို လောလောဆယ် မပြသနိုင်ပါ။ နောက်မှ ပြန်ကြည့်ပါ။",
  errorTitle: "မီနူးကို မဖွင့်နိုင်ပါ", errorNote: "အင်တာနက်ချိတ်ဆက်မှုကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။",
  notFoundTitle: "ဤစာမျက်နှာကို မရရှိနိုင်ပါ", notFoundNote: "ဆိုင်လင့်ခ်ကို စစ်ဆေးပါ သို့မဟုတ် မီနူးသို့ ပြန်သွားပါ။",
  unknownTitle: "ဆိုင်ဝက်ဘ်ဆိုက်ကို မရရှိနိုင်ပါ", unknownNote: "ဤလိပ်စာအတွက် ဆိုင်ကို သတ်မှတ်မထားပါ။",
  retry: "ထပ်ကြိုးစားရန်", back: "မီနူးသို့ ပြန်ရန်", loading: "မီနူးကို ဖွင့်နေပါသည်…",
  loadingNote: "နောက်ဆုံးရ ဟင်းလျာများကို ဖွင့်နေစဉ် ခဏစောင့်ပါ။",
  contactTitle: "ကျွန်ုပ်တို့ဆိုင်သို့ လာရောက်ပါ။", phone: "ဆိုင်သို့ ဖုန်းဆက်ရန်", address: "ဆိုင်လိပ်စာ",
  contactMissing: "ဆက်သွယ်ရန် အချက်အလက်နှင့် ဆိုင်ဖွင့်ချိန်ကို ဆိုင်တွင် မေးမြန်းပါ။",
  hoursNote: "ဆိုင်ဖွင့်ချိန်ကို အတည်ပြုရန် ဆိုင်ကို ဆက်သွယ်ပါ။",
  qrChecking: "QR လင့်ခ်ကို စစ်ဆေးနေပါသည်…", qrReady: "QR လင့်ခ် အဆင်သင့်ဖြစ်ပါပြီ။ အကောင့်ဝင်ရန် မလိုပါ။",
  qrInvalid: "QR လင့်ခ် မပြည့်စုံပါ။ မူရင်း QR ကို ပြန်စကင်ဖတ်ပါ။",
  qrFoundation: "အောက်တွင် မီနူးကြည့်ရှုနိုင်ပါသည်။ အော်ဒါတင်ခြင်းကို နောက်မွမ်းမံမှုတွင် ရရှိပါမည်။",
  ownerTitle: "ဆိုင်ပိုင်ရှင်လင့်ခ်", ownerNote: "ဆိုင်ကို စီမံရန် သင့်ဆိုင်၏ Operations အက်ပ်ကို အသုံးပြုပါ။",
  noItems: "ဤအမျိုးအစားတွင် ဟင်းလျာမရှိသေးပါ။", noDescription: "ရရှိနိုင်သော ရွေးချယ်စရာများနှင့် ဈေးနှုန်းများကို အောက်တွင်ကြည့်ပါ။",
  footer: "အစားအသောက်ကောင်းနှင့် အမှတ်တရအချိန်များအတွက်။", count: "ဟင်းလျာ", menuUnavailable: "မီနူး မရရှိနိုင်ပါ",
};

export const messages: Record<GuestLocale, Messages> = { en, my };
export function parseGuestLocale(value: unknown): GuestLocale {
  return value === "my" ? "my" : "en";
}
