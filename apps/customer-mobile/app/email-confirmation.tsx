import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { CustomerConfirmationResult } from "@restaurant-platform/restaurant-config/customer-confirmation";
import { Action, Page, StateView } from "../src/components/ui";
import { confirmCustomerEmail } from "../src/auth/native";
import { takeCustomerConfirmationInput } from "../src/auth/confirmation-link";
import SignIn from "./index";

export default function CustomerEmailConfirmation() {
  const [result, setResult] = useState<CustomerConfirmationResult | "checking">("checking");
  const [language, setLanguage] = useState<"en" | "my-MM">("en");
  const t = (english: string, burmese: string) => language === "my-MM" ? burmese : english;
  const { attempt } = useLocalSearchParams<{ attempt?: string }>();
  const completion = useRef<{ attempt: string | undefined; result: Promise<CustomerConfirmationResult> } | null>(null);
  useEffect(() => {
    if (!completion.current || completion.current.attempt !== attempt) {
      setResult("checking");
      completion.current = { attempt, result: confirmCustomerEmail(takeCustomerConfirmationInput()).catch(() => "invalid") };
    }
    let active = true;
    void completion.current.result.then(value => { if (active) setResult(value); });
    return () => { active = false; };
  }, [attempt]);
  if (result === "confirmed" || result === "returned") return <SignIn confirmationMessage={result === "confirmed" ? "Your email is confirmed. Sign in with your email and password." : "Your confirmation link has returned. Sign in with your email and password. If your email is still unconfirmed, request a new confirmation email."}
    confirmationMessageBurmese={result === "confirmed" ? "သင့်အီးမေးလ်ကို အတည်ပြုပြီးပါပြီ။ အီးမေးလ်နှင့် စကားဝှက်ဖြင့် အကောင့်ဝင်ပါ။" : "အတည်ပြုလင့်ခ်မှ ပြန်ရောက်ပါပြီ။ အီးမေးလ်နှင့် စကားဝှက်ဖြင့် အကောင့်ဝင်ပါ။ အတည်မပြုရသေးပါက အတည်ပြုစာအသစ် တောင်းပါ။"} />;
  return <SafeAreaView style={{ flex: 1 }}><Page title={t("Email confirmation", "အီးမေးလ် အတည်ပြုခြင်း")}>
    <Action title={language === "en" ? "မြန်မာဘာသာ" : "English"} secondary onPress={() => setLanguage(language === "en" ? "my-MM" : "en")} />
    <StateView kind={result === "checking" ? "loading" : "error"}
      title={result === "checking" ? t("Checking your confirmation link…", "အတည်ပြုလင့်ခ်ကို စစ်ဆေးနေသည်…") : t("Confirmation link unavailable", "အတည်ပြုလင့်ခ် သုံး၍မရပါ")}
      message={result === "checking" ? t("Please wait while we check your email confirmation.", "အီးမေးလ် အတည်ပြုခြင်းကို စစ်ဆေးနေစဉ် စောင့်ပါ။") : t("This confirmation link is invalid or expired. Return to sign in and request a new confirmation email.", "ဤအတည်ပြုလင့်ခ် မမှန်ပါ သို့မဟုတ် သက်တမ်းကုန်ပါပြီ။ အကောင့်ဝင်ရန် ပြန်သွားပြီး အတည်ပြုစာအသစ် တောင်းပါ။")} />
    {result !== "checking" && <Action title={t("Return to sign in", "အကောင့်ဝင်ရန် ပြန်သွားပါ")} onPress={() => router.replace("/")} />}
  </Page></SafeAreaView>;
}
