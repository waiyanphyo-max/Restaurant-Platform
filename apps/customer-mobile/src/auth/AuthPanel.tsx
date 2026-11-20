import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { foundationTokens } from "@restaurant-platform/ui-tokens";
import { Action, FormField, useUiTheme } from "../components/ui";
import { localize, type CustomerLanguage } from "../i18n";
import { useCustomerAuth } from "./AuthProvider";
import { authErrorMetadata, authErrorText, logAuthFailure, type AuthOperation } from "./errors";
import { customerPasswordPolicy, normalizeEmail, passwordRequirement, validEmail, validPassword } from "./validation";

type Mode = "login" | "signup" | "phone" | "reset";
type Fields = Partial<Record<"email" | "password" | "confirmation" | "phone" | "code", string>>;
const confirmationMessage: [string, string] = ["If this email can be registered, check your inbox to confirm your account, then return to this Customer App and sign in. If it does not open automatically, open the app manually. You can also reset your password.", "ဤအီးမေးလ်ဖြင့် စာရင်းသွင်းနိုင်ပါက ဝင်စာတွင် အကောင့်ကို အတည်ပြုပြီး ပြန်ဝင်ပါ။ စကားဝှက်ပြန်သတ်မှတ်ခြင်းလည်း လုပ်နိုင်ပါသည်။"];
const resetMessage: [string, string] = ["If this email can receive a reset, a verification code has been sent. Check your inbox and spam folder.", "ဤအီးမေးလ်သို့ ပြန်သတ်မှတ်စာ ပို့နိုင်ပါက အတည်ပြုကုဒ် ပို့ပြီးပါပြီ။ ဝင်စာနှင့် spam ဖိုင်တွဲကို စစ်ပါ။"];
const resendMessage: [string, string] = ["If this email needs confirmation, a message has been sent. Check your inbox and spam folder, then sign in.", "ဤအီးမေးလ်ကို အတည်ပြုရန်လိုပါက စာပို့ပြီးပါပြီ။ ဝင်စာနှင့် spam ဖိုင်တွဲကို စစ်ပြီး အကောင့်ဝင်ပါ။"];
export function AuthPanel({ confirmationNotice }: { confirmationNotice?: { english: string; burmese: string } } = {}) {
  const auth = useCustomerAuth();
  const { color } = useUiTheme();
  const [mode, setMode] = useState<Mode>("login");
  const [language, setLanguage] = useState<CustomerLanguage>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<[string, string] | null>(null);
  const [errors, setErrors] = useState<Fields>({});
  // A customer returning from an expired email can request another without first
  // submitting a password or receiving a failed login response.
  const [confirmationOffered, setConfirmationOffered] = useState(true);
  const [cooldown, setCooldown] = useState(0);
  const submitting = useRef(false);
  const t = (english: string, burmese: string) => localize(language, english, burmese);
  const noteStyle = [styles.note, { color: color.foregroundMuted }];
  let policy: ReturnType<typeof customerPasswordPolicy> | null = null;
  try { policy = customerPasswordPolicy(); } catch { /* Never lower an invalid configured policy. */ }
  function clearSecrets() {
    setPassword(""); setConfirmation(""); setCode(""); setShowPassword(false); setShowConfirmation(false);
  }
  useEffect(() => { if (auth.state.status !== "signed_out") clearSecrets(); }, [auth.state.status]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  function changeMode(next: Mode) {
    if (submitting.current) return;
    setMode(next); clearSecrets(); setCodeRequested(false); setMessage(null); setErrors({});
  }
  function validate(resend = false): boolean {
    const next: Fields = {};
    if (mode === "phone" && !resend) {
      if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) next.phone = t("Use an international number, for example +959…", "နိုင်ငံတကာဖုန်းနံပါတ် သုံးပါ။ ဥပမာ +959…");
      if (codeRequested && !/^\d{6,10}$/.test(code.trim())) next.code = t("Enter the SMS verification code.", "SMS အတည်ပြုကုဒ်ကို ထည့်ပါ။");
    } else {
      if (!validEmail(email)) next.email = t("Enter a valid email address.", "မှန်ကန်သော အီးမေးလ်လိပ်စာကို ထည့်ပါ။");
      if (!resend && (mode === "login" || mode === "signup" || mode === "reset" && codeRequested)) {
        if (!password) next.password = t("Enter your password.", "စကားဝှက်ကို ထည့်ပါ။");
        else if (mode !== "login" && (!policy || !validPassword(password, policy))) next.password = policy ? t(...passwordRequirement(policy)) : t("Password settings are unavailable. Contact the restaurant.", "စကားဝှက်ဆက်တင်များ မရရှိပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။");
        if (mode !== "login" && password !== confirmation) next.confirmation = t("Passwords must match.", "စကားဝှက်နှစ်ခု တူညီရပါမည်။");
      }
      if (!resend && mode === "reset" && codeRequested && !/^\d{6,10}$/.test(code.trim())) next.code = t("Enter the code from the latest reset email.", "နောက်ဆုံး စကားဝှက်ပြန်သတ်မှတ်စာမှ ကုဒ်ကို ထည့်ပါ။");
    }
    setErrors(next); return Object.keys(next).length === 0;
  }
  async function submit(resend = false) {
    if (submitting.current || !validate(resend)) return;
    if ((resend || mode === "reset" && !codeRequested) && cooldown > 0) return;
    submitting.current = true; setBusy(true); setMessage(null);
    const operation: AuthOperation = resend ? "resend" : mode === "signup" ? "signup" : mode === "phone" ? "phone" : mode === "reset" ? codeRequested ? "reset_password" : "reset_request" : "login";
    try {
      const normalized = normalizeEmail(email);
      if (resend) {
        await auth.resendConfirmation(normalized); setCooldown(60);
        setMessage(resendMessage);
      } else if (mode === "signup") {
        const result = await auth.signUpWithPassword(normalized, password);
        if (!result.authenticated) {
          setMessage(confirmationMessage);
          setMode("login"); setConfirmationOffered(true); setCooldown(60);
        }
      } else if (mode === "phone") {
        if (codeRequested) await auth.verifyPhoneOtp(phone.trim(), code.trim());
        else {
          await auth.requestPhoneOtp(phone.trim()); setCodeRequested(true);
          setMessage(["Enter the code sent by SMS. Delivery may take a moment.", "SMS ဖြင့်ပို့သော ကုဒ်ကို ထည့်ပါ။ ခဏစောင့်ရနိုင်ပါသည်။"]);
        }
      } else if (mode === "reset") {
        if (!auth.emailRecoveryEnabled) setMessage(["Password reset is not enabled for this build. Contact the restaurant for help with account access.", "ဤအက်ပ်တွင် စကားဝှက်ပြန်သတ်မှတ်ခြင်းကို မဖွင့်ထားပါ။ အကောင့်အကူအညီအတွက် ဆိုင်သို့ ဆက်သွယ်ပါ။"]);
        else if (codeRequested) {
          await auth.resetPassword(normalized, code.trim(), password); setMode("login"); setCodeRequested(false);
          setMessage(["Your password has been updated. Sign in with your new password.", "စကားဝှက်ကို ပြောင်းပြီးပါပြီ။ စကားဝှက်အသစ်ဖြင့် အကောင့်ဝင်ပါ။"]);
        } else {
          await auth.requestPasswordReset(normalized); setCodeRequested(true); setCooldown(60);
          setMessage(resetMessage);
        }
      } else await auth.signInWithPassword(normalized, password);
    } catch (error) {
      logAuthFailure(operation, error); setMessage(authErrorText(error, operation));
      const { code: errorCode, status } = authErrorMetadata(error);
      if (["user_already_exists", "email_exists", "user_not_found"].includes(errorCode)) {
        if (operation === "signup") { setMessage(confirmationMessage); setMode("login"); setCooldown(60); }
        if (operation === "reset_request") { setMessage(resetMessage); setCodeRequested(true); setCooldown(60); }
        if (operation === "resend") { setMessage(resendMessage); setCooldown(60); }
      }
      if (operation === "reset_password" && ["weak_password", "same_password"].includes(errorCode)) {
        const [english, burmese] = authErrorText(error, operation);
        setMessage([`${english} Request a new reset email before trying again.`, `${burmese} ထပ်မံကြိုးစားရန် ပြန်သတ်မှတ်စာအသစ် တောင်းပါ။`]);
      }
      if (status === 429 || errorCode.startsWith("over_") || errorCode === "request_cooldown") setCooldown(60);
      if (errorCode === "email_not_confirmed" || mode === "signup") setConfirmationOffered(true);
    } finally { submitting.current = false; setBusy(false); clearSecrets(); }
  }
  if (auth.state.status === "loading") return <View accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.panel}><ActivityIndicator color={color.foreground} accessibilityLabel={t("Restoring secure session", "အကောင့်ဝင်ထားမှုကို ရယူနေသည်")} /><Text allowFontScaling style={noteStyle}>{t("Restoring secure session…", "အကောင့်ဝင်ထားမှုကို ရယူနေသည်…")}</Text></View>;
  if (auth.state.status === "unconfigured") return <Text allowFontScaling style={noteStyle} accessibilityRole="alert">{t("Sign-in is unavailable in this build. Contact the restaurant for help.", "ဤအက်ပ်တွင် အကောင့်ဝင်၍မရပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။")}</Text>;
  if (auth.state.status === "error") return <View style={styles.panel}>
    <Text allowFontScaling style={noteStyle} accessibilityRole="alert">{auth.state.message}</Text>
    <Action title={t("Retry session", "ထပ်မံကြိုးစားပါ")} onPress={() => void auth.retry()} />
    <Action title={t("Sign out", "အကောင့်ထွက်မည်")} secondary onPress={() => { void auth.signOut().catch(() => {}); }} />
  </View>;
  if (auth.state.status === "signed_in") return null;
  const needsPassword = mode === "signup" || mode === "login" || mode === "reset" && codeRequested;
  const newPassword = mode !== "login";
  const submitDisabled = busy || !policy && needsPassword && newPassword || (mode === "reset" && (!auth.emailRecoveryEnabled || !codeRequested && cooldown > 0));
  return <View style={styles.panel}>
    <Text allowFontScaling accessibilityRole="header" style={[styles.title, { color: color.foreground }]}>{mode === "signup" ? t("Create your customer account", "ဝယ်ယူသူအကောင့် ဖွင့်ပါ") : mode === "phone" ? t("Sign in with your verified phone", "အတည်ပြုပြီး ဖုန်းဖြင့် ဝင်ပါ") : mode === "reset" ? t("Reset your password", "စကားဝှက် ပြန်သတ်မှတ်ပါ") : t("Welcome back", "ပြန်လည်ကြိုဆိုပါသည်")}</Text>
    <Text allowFontScaling style={noteStyle}>{mode === "signup" ? t("Confirm your email before signing in.", "အကောင့်မဝင်မီ သင့်အီးမေးလ်ကို အတည်ပြုပါ။")
      : mode === "phone" ? t("For existing verified phone accounts.", "ရှိပြီးသား အတည်ပြုဖုန်းအကောင့်များအတွက် ဖြစ်ပါသည်။")
      : mode === "reset" ? t("Use the supported email recovery flow.", "အီးမေးလ်မှတစ်ဆင့် အကောင့် ပြန်ရယူပါ။")
      : t("Sign in to order delivery.", "ပို့ဆောင်ရန် မှာယူဖို့ အကောင့်ဝင်ပါ။")}</Text>
    <Action title={language === "en" ? "မြန်မာဘာသာ" : "English"} secondary disabled={busy} onPress={() => { setLanguage(language === "en" ? "my-MM" : "en"); setErrors({}); }} />
    {confirmationNotice ? <View style={[styles.feedback, { backgroundColor: color.surfaceMuted }]}>
      <Text allowFontScaling accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.note, { color: color.foreground }]}>{t(confirmationNotice.english, confirmationNotice.burmese)}</Text>
    </View> : null}
    {mode === "phone" ? <>
      <FormField label={t("International phone number", "နိုင်ငံတကာဖုန်းနံပါတ်")} error={errors.phone} placeholder="+959…" keyboardType="phone-pad" autoComplete="tel" value={phone} editable={!busy} onChangeText={value => { setPhone(value); setCodeRequested(false); }} />
      {codeRequested && <FormField label={t("SMS verification code", "SMS အတည်ပြုကုဒ်")} error={errors.code} keyboardType="number-pad" autoComplete="sms-otp" value={code} onChangeText={setCode} editable={!busy} maxLength={10} secureTextEntry />}
    </> : <>
      <FormField label={t("Email address", "အီးမေးလ်လိပ်စာ")} error={errors.email} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" value={email} editable={!busy} returnKeyType="next" onChangeText={value => { setEmail(value); if (mode === "reset") setCodeRequested(false); }} />
      {mode === "reset" && codeRequested && <FormField label={t("Email verification code", "အီးမေးလ် အတည်ပြုကုဒ်")} error={errors.code} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" value={code} editable={!busy} onChangeText={setCode} maxLength={10} />}
      {needsPassword && <>
        <FormField label={newPassword ? t("New password", "စကားဝှက်အသစ်") : t("Password", "စကားဝှက်")} error={errors.password} secureTextEntry={!showPassword} autoComplete={newPassword ? "new-password" : "current-password"} textContentType={newPassword ? "newPassword" : "password"} autoCapitalize="none" autoCorrect={false} value={password} editable={!busy} returnKeyType={newPassword ? "next" : "go"} onChangeText={setPassword} onSubmitEditing={() => { if (!newPassword) void submit(); }} />
        <Action title={showPassword ? t("Hide password", "စကားဝှက် ဖျောက်ပါ") : t("Show password", "စကားဝှက် ပြပါ")} secondary disabled={busy} onPress={() => setShowPassword(!showPassword)} />
        {newPassword && <>
          {policy && <Text allowFontScaling style={noteStyle}>{t(...passwordRequirement(policy))}</Text>}
          <FormField label={t("Confirm password", "စကားဝှက် အတည်ပြုပါ")} error={errors.confirmation} secureTextEntry={!showConfirmation} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} value={confirmation} editable={!busy} returnKeyType="go" onChangeText={setConfirmation} onSubmitEditing={() => void submit()} />
          <Action title={showConfirmation ? t("Hide confirm password", "အတည်ပြုစကားဝှက် ဖျောက်ပါ") : t("Show confirm password", "အတည်ပြုစကားဝှက် ပြပါ")} secondary disabled={busy} onPress={() => setShowConfirmation(!showConfirmation)} />
        </>}
      </>}
    </>}
    {!policy && <Text allowFontScaling style={noteStyle} accessibilityRole="alert">{t("Password policy settings are unavailable. Contact the restaurant.", "စကားဝှက်စည်းမျဉ်း ဆက်တင်များ မရရှိပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။")}</Text>}
    {mode === "reset" && !auth.emailRecoveryEnabled && <Text allowFontScaling style={noteStyle} accessibilityRole="alert">{t("Password reset is not enabled for this build. Contact the restaurant for help with account access.", "ဤအက်ပ်တွင် စကားဝှက်ပြန်သတ်မှတ်ခြင်းကို မဖွင့်ထားပါ။ အကောင့်အကူအညီအတွက် ဆိုင်သို့ ဆက်သွယ်ပါ။")}</Text>}
    {busy && <ActivityIndicator color={color.foreground} accessibilityLabel={t("Please wait", "ခဏစောင့်ပါ")} />}
    <Action title={busy ? t("Please wait…", "ခဏစောင့်ပါ…") : mode === "signup" ? t("Create account", "အကောင့်ဖွင့်ပါ") : mode === "phone" ? codeRequested ? t("Verify and sign in", "အတည်ပြုပြီး ဝင်ပါ") : t("Send SMS code", "SMS ကုဒ်ပို့ပါ") : mode === "reset" ? codeRequested ? t("Update password", "စကားဝှက် ပြောင်းပါ") : t("Send reset email", "ပြန်သတ်မှတ်စာ ပို့ပါ") : t("Sign in", "အကောင့်ဝင်ပါ")} disabled={submitDisabled} onPress={() => void submit()} />
    {cooldown > 0 && <Text accessibilityLiveRegion="polite" allowFontScaling style={noteStyle}>{t(`Wait ${cooldown}s before requesting another email.`, `အီးမေးလ် ထပ်တောင်းရန် ${cooldown} စက္ကန့် စောင့်ပါ။`)}</Text>}
    {mode === "login" && <Action title={t("Forgot password?", "စကားဝှက် မေ့နေပါသလား။")} secondary disabled={busy} onPress={() => changeMode("reset")} />}
    {mode === "login" && confirmationOffered && <Action title={t("Resend confirmation email", "အတည်ပြုစာ ထပ်ပို့ပါ")} secondary disabled={busy || cooldown > 0} onPress={() => void submit(true)} />}
    {mode === "reset" && codeRequested && <Action title={t("Request another reset email", "ပြန်သတ်မှတ်စာ ထပ်တောင်းပါ")} secondary disabled={busy || cooldown > 0} onPress={() => { setCodeRequested(false); clearSecrets(); }} />}
    {mode === "phone" && codeRequested && <Action title={t("Request another code", "ကုဒ် ထပ်တောင်းပါ")} secondary disabled={busy} onPress={() => { setCodeRequested(false); setCode(""); }} />}
    {(mode === "login" || mode === "signup") && <Action title={mode === "signup" ? t("Already have an account? Sign in", "အကောင့်ရှိပြီးလား။ ဝင်ပါ") : t("Create an email account", "အီးမေးလ်ဖြင့် အကောင့်ဖွင့်ပါ")} secondary disabled={busy} onPress={() => changeMode(mode === "signup" ? "login" : "signup")} />}
    {mode !== "login" && <Action title={t("Use email sign in", "အီးမေးလ်ဖြင့် အကောင့်ဝင်ပါ")} secondary disabled={busy} onPress={() => changeMode("login")} />}
    {auth.phoneEnabled && mode !== "phone" && <Action title={t("Use verified phone sign in", "အတည်ပြုပြီး ဖုန်းဖြင့် ဝင်ပါ")} secondary disabled={busy} onPress={() => changeMode("phone")} />}
    {mode === "phone" && <Text allowFontScaling style={noteStyle}>{t("For existing verified Auth phone accounts. This does not link a phone to your email account.", "ရှိပြီးသား အတည်ပြုဖုန်းအကောင့်များအတွက် ဖြစ်ပါသည်။ သင့်အီးမေးလ်အကောင့်နှင့် ဖုန်းကို ချိတ်ဆက်မည်မဟုတ်ပါ။")}</Text>}
    {mode === "signup" && <Text allowFontScaling style={noteStyle}>{t("You can choose a Home Address after sign-in, or skip it until later.", "အကောင့်ဝင်ပြီးနောက် နေရပ်လိပ်စာကို ရွေးနိုင်ပါသည်။ နောက်မှလုပ်ရန်လည်း ကျော်နိုင်ပါသည်။")}</Text>}
    {message && <View style={[styles.feedback, { backgroundColor: color.surfaceMuted }]}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" allowFontScaling style={[styles.note, { color: color.foreground }]}>{t(...message)}</Text>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: foundationTokens.spacing.sm, width: "100%", maxWidth: 560, alignSelf: "center" },
  title: { ...foundationTokens.typography.heading, flexShrink: 1 },
  note: { ...foundationTokens.typography.body, flexShrink: 1 },
  feedback: { padding: foundationTokens.spacing.md, borderRadius: foundationTokens.radius.md }
});
