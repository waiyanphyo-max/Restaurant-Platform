import { ApiConfigurationError, ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError,
  MissingAccessTokenError } from "@restaurant-platform/api-client";
import { authErrorMetadata } from "../auth/errors";

export interface ApiFailure {
  kind: "network" | "expired" | "forbidden" | "missing_profile" | "validation" | "configuration" | "server" | "protocol" | "rate_limited" | "unknown";
  operation: string;
  status?: number;
  code?: string;
}

/** Retain only safe metadata; never keep a response body, URL, token or customer details in query state. */
export class QueryOperationError extends Error {
  readonly name = "QueryOperationError";
  constructor(readonly failure: ApiFailure) { super(`Customer API operation failed: ${failure.operation}`); }
}

export function apiFailure(error: unknown, operation: string): ApiFailure {
  if (error instanceof QueryOperationError) return error.failure;
  const operationName = operation.split(":", 1)[0];
  operation = ["account", "profile", "addresses", "profile-update", "address-update", "logout", "notifications", "checkout", "checkout-zones", "home-storefront", "menu", "product", "order", "orders", "query"].includes(operationName) ? operationName : "query";
  if (error instanceof MissingAccessTokenError) return { kind: "expired", operation };
  if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) return { kind: "network", operation };
  if (error instanceof ApiProtocolError) return { kind: "protocol", operation };
  if (error instanceof ApiConfigurationError) return { kind: "configuration", operation };
  if (error instanceof ApiHttpError) {
    const kind = error.status === 401 ? "expired" : error.status === 403 ? "forbidden"
      : error.code === "CUSTOMER_PROFILE_NOT_FOUND" ? "missing_profile"
      : error.status === 429 ? "rate_limited" : error.status >= 500 ? "server"
      : [400, 409, 422].includes(error.status) ? "validation" : "unknown";
    return { kind, operation, status: error.status, ...(/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? { code: error.code } : {}) };
  }
  // Token refresh happens before transport fetch: its Auth errors reach callers directly.
  const auth = authErrorMetadata(error);
  const kind = auth.network || auth.status === 0 ? "network"
    : ["invalid_session", "session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "identity_changed", "bad_jwt"].includes(auth.code) || auth.status === 401 ? "expired"
    : auth.code === "user_banned" || auth.status === 403 ? "forbidden"
    : auth.status === 429 ? "rate_limited" : auth.status !== undefined && auth.status >= 500 ? "server" : "unknown";
  if (kind !== "unknown") return { kind, operation, ...(auth.status === undefined ? {} : { status: auth.status }), ...(auth.code === "unclassified" ? {} : { code: auth.code }) };
  return { kind: "unknown", operation };
}

export function logApiFailure(failure: ApiFailure) {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[customer-api]", failure);
}

export async function accountOperation<T>(operation: "profile" | "addresses", request: () => Promise<T>): Promise<T> {
  try { return await request(); }
  catch (error) { throw new QueryOperationError(apiFailure(error, operation)); }
}

type Text = (english: string, burmese: string) => string;
export function apiFailureMessage(failure: ApiFailure | undefined, t: Text): string | undefined {
  if (!failure) return undefined;
  switch (failure.kind) {
    case "network": return t("Cannot reach the restaurant service. Check your connection and try again.", "စားသောက်ဆိုင် ဝန်ဆောင်မှုသို့ မချိတ်ဆက်နိုင်ပါ။ အင်တာနက် စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။");
    case "expired": return t("Your session could not be verified. Try again, or log out and sign in again.", "အကောင့်ဝင်ထားမှုကို အတည်မပြုနိုင်ပါ။ ထပ်ကြိုးစားပါ သို့မဟုတ် အကောင့်မှထွက်ပြီး ပြန်ဝင်ပါ။");
    case "forbidden": return t("Your account does not have permission for this request. Contact the restaurant if this continues.", "ဤလုပ်ဆောင်မှုအတွက် သင့်အကောင့်တွင် ခွင့်ပြုချက် မရှိပါ။ ဆက်ဖြစ်ပါက စားသောက်ဆိုင်ကို ဆက်သွယ်ပါ။");
    case "missing_profile": return t("Your account details are not ready on the restaurant service. Reload, and contact the restaurant if this continues.", "စားသောက်ဆိုင် ဝန်ဆောင်မှုတွင် သင့်အကောင့် အချက်အလက် အဆင်သင့်မဖြစ်သေးပါ။ ပြန်ရယူပါ။ ဆက်ဖြစ်ပါက စားသောက်ဆိုင်ကို ဆက်သွယ်ပါ။");
    case "configuration": return t("The app cannot connect with its current service settings. Contact the restaurant for help.", "လက်ရှိ ဝန်ဆောင်မှု သတ်မှတ်ချက်ဖြင့် အက်ပ်ကို မချိတ်ဆက်နိုင်ပါ။ စားသောက်ဆိုင်ထံ အကူအညီတောင်းပါ။");
    case "protocol": return t("The restaurant service returned an unexpected response. Reload, and contact the restaurant if this continues.", "စားသောက်ဆိုင် ဝန်ဆောင်မှုမှ မမျှော်လင့်ထားသော အချက်အလက် ပြန်ပို့ခဲ့သည်။ ပြန်ရယူပါ။ ဆက်ဖြစ်ပါက စားသောက်ဆိုင်ကို ဆက်သွယ်ပါ။");
    case "rate_limited": return t("Too many requests. Wait a moment before trying again.", "တောင်းဆိုမှု များလွန်းနေပါသည်။ ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ။");
    case "server": return t("The restaurant service is temporarily unavailable. Please try again shortly.", "စားသောက်ဆိုင် ဝန်ဆောင်မှု ခေတ္တမရနိုင်ပါ။ ခဏနေရင် ထပ်ကြိုးစားပါ။");
    case "validation": return t("The service could not accept these details. Check your entries and try again.", "ဤအချက်အလက်များကို ဝန်ဆောင်မှုက လက်မခံနိုင်ပါ။ ဖြည့်ထားသည်များ စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။");
    default: return t("The request could not be completed. Please try again.", "တောင်းဆိုမှုကို မပြီးစီးနိုင်ပါ။ ထပ်ကြိုးစားပါ။");
  }
}

export function accountFailureTitle(failure: ApiFailure | undefined, t: Text): string {
  return failure?.operation === "addresses" ? t("Could not load saved addresses", "သိမ်းထားသော လိပ်စာများ မရယူနိုင်ပါ")
    : t("Could not load account details", "အကောင့် အချက်အလက်များ မရယူနိုင်ပါ");
}
