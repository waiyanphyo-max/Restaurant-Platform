export type AuthOperation = "signup" | "login" | "phone" | "resend" | "reset_request" | "reset_password" | "restore";
const knownCodes = new Set([
  "invalid_input", "invalid_session", "identity_changed", "request_in_progress", "request_cooldown", "recovery_unavailable",
  "invalid_credentials", "email_not_confirmed", "email_address_invalid", "validation_failed", "weak_password", "same_password",
  "user_already_exists", "email_exists", "user_not_found", "over_email_send_rate_limit", "over_request_rate_limit", "over_sms_send_rate_limit",
  "signup_disabled", "email_provider_disabled", "phone_provider_disabled", "provider_disabled", "provider_email_needs_verification",
  "email_address_not_authorized", "unexpected_failure", "captcha_failed", "hook_timeout", "hook_timeout_after_retry", "hook_payload_invalid_content_type",
  "otp_expired", "otp_disabled", "session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "user_banned",
  "bad_jwt", "not_admin", "reauthentication_needed", "reauthentication_not_valid", "request_timeout"
]);
export function authErrorMetadata(error: unknown): { code: string; status?: number; network: boolean } {
  const candidate = typeof error === "object" && error !== null ? error as { code?: unknown; status?: unknown; name?: unknown } : {};
  return {
    code: typeof candidate.code === "string" && knownCodes.has(candidate.code) ? candidate.code : "unclassified",
    status: typeof candidate.status === "number" && Number.isInteger(candidate.status) && candidate.status >= 0 && candidate.status <= 599 ? candidate.status : undefined,
    network: candidate.name === "AuthRetryableFetchError" || error instanceof TypeError || candidate.code === "request_timeout"
  };
}
export function logAuthFailure(operation: AuthOperation, error: unknown): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const { code, status, network } = authErrorMetadata(error);
    console.warn("Customer Auth request failed", { operation, code, status, network });
  }
}
export function authErrorText(error: unknown, operation: AuthOperation): [string, string] {
  const { code, status, network } = authErrorMetadata(error);
  if (network || status === 0) return ["Cannot reach the sign-in service. Check your connection and try again.", "အကောင့်ဝင် ဝန်ဆောင်မှုကို ချိတ်ဆက်၍မရပါ။ အင်တာနက်ကို စစ်ပြီး ပြန်ကြိုးစားပါ။"];
  if (status === 429 || code.startsWith("over_") || code === "request_cooldown") return ["Too many requests. Wait at least one minute before trying again; email delivery limits may take longer to reset.", "တောင်းဆိုမှု များနေပါသည်။ အနည်းဆုံး တစ်မိနစ်စောင့်ပြီး ပြန်ကြိုးစားပါ။ အီးမေးလ်ပို့ ကန့်သတ်ချက်အတွက် ပိုကြာနိုင်ပါသည်။"];
  if (["user_already_exists", "email_exists", "user_not_found", "invalid_credentials"].includes(code)) return operation === "signup"
    ? ["If this email can be registered, check your inbox for confirmation. You can also sign in or reset your password.", "ဤအီးမေးလ်ဖြင့် စာရင်းသွင်းနိုင်ပါက အတည်ပြုစာကို စစ်ပါ။ အကောင့်ဝင်ခြင်း သို့မဟုတ် စကားဝှက်ပြန်သတ်မှတ်ခြင်းလည်း လုပ်နိုင်ပါသည်။"]
    : ["Sign-in was not completed. Check your email and password, or reset your password.", "အကောင့်ဝင်၍မရပါ။ အီးမေးလ်နှင့် စကားဝှက်ကို စစ်ပါ သို့မဟုတ် စကားဝှက်ပြန်သတ်မှတ်ပါ။"];
  if (code === "email_not_confirmed") return ["Confirm your email using the message in your inbox, then sign in. You can resend confirmation below.", "အီးမေးလ်ဝင်စာမှ အတည်ပြုပြီး အကောင့်ဝင်ပါ။ အောက်တွင် အတည်ပြုစာ ထပ်ပို့နိုင်ပါသည်။"];
  if (code === "email_address_not_authorized") return ["The email service cannot send to this address. Contact the restaurant to enable customer email delivery, then try again.", "ဤလိပ်စာသို့ အီးမေးလ် မပို့နိုင်ပါ။ ဝယ်ယူသူ အီးမေးလ်ပို့ခြင်း ဖွင့်ပေးရန် ဆိုင်ကို ဆက်သွယ်ပြီး ပြန်ကြိုးစားပါ။"];
  if (["weak_password", "same_password"].includes(code)) return ["Choose a stronger, different password that meets the account password policy. Common or compromised passwords may be rejected.", "အကောင့်၏ စကားဝှက်စည်းမျဉ်းနှင့် ကိုက်ညီသော ပိုခိုင်မာသည့် စကားဝှက်အသစ်ကို ရွေးပါ။ အသုံးများသော စကားဝှက်များကို လက်မခံနိုင်ပါ။"];
  if (["email_address_invalid", "validation_failed", "invalid_input"].includes(code)) return ["Check the highlighted fields and try again.", "ဖော်ပြထားသော အချက်အလက်များကို စစ်ပြီး ပြန်ကြိုးစားပါ။"];
  if (["signup_disabled", "email_provider_disabled", "phone_provider_disabled", "provider_disabled", "recovery_unavailable", "captcha_failed"].includes(code) || status === 401 || status === 403) return ["This authentication option is unavailable. Please contact the restaurant for help with account access.", "ဤအကောင့်ဝင်နည်းကို အသုံးမပြုနိုင်ပါ။ အကောင့်ဝင်ရန် အကူအညီအတွက် ဆိုင်သို့ ဆက်သွယ်ပါ။"];
  if (["otp_expired", "otp_disabled"].includes(code)) return ["The verification code is invalid or expired. Request a new email and use its latest code.", "အတည်ပြုကုဒ် မမှန်ပါ သို့မဟုတ် သက်တမ်းကုန်နေပါသည်။ အီးမေးလ်အသစ်တောင်းပြီး နောက်ဆုံးကုဒ်ကို သုံးပါ။"];
  if (["invalid_session", "session_expired", "session_not_found", "refresh_token_not_found", "refresh_token_already_used", "identity_changed"].includes(code)) return ["Your session is no longer available. Please sign in again.", "အကောင့်ဝင်ထားမှု သက်တမ်းကုန်နေပါသည်။ ပြန်လည်ဝင်ပါ။"];
  return ["The authentication service could not complete this request. Try again shortly; if it continues, contact the restaurant.", "အကောင့်ဝင် ဝန်ဆောင်မှုမှ တောင်းဆိုမှုကို မလုပ်ဆောင်နိုင်ပါ။ ခဏကြာပြီး ပြန်ကြိုးစားပါ။ မရပါက ဆိုင်သို့ ဆက်သွယ်ပါ။"];
}
