import { Redirect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthPanel } from "../src/auth/AuthPanel";
import { useCustomerAuth } from "../src/auth/AuthProvider";
import { Action, Page, StateView, useUiTheme } from "../src/components/ui";
import { useRuntimeBranding } from "../src/branding/RuntimeBrandingProvider";
import { BrandLogo } from "../src/components/FoodMedia";

export default function SignIn({ destination = "/home", confirmationMessage, confirmationMessageBurmese }: { destination?: string; confirmationMessage?: string; confirmationMessageBurmese?: string } = {}) {
  const { state, retry, signOut } = useCustomerAuth();
  const { displayName, logoUrl: logo } = useRuntimeBranding();
  const { color } = useUiTheme();
  if (state.status === "signed_in") return <Redirect href={destination} />;
  if (state.status === "unconfigured") return <SafeAreaView style={{ flex: 1, backgroundColor: color.background }}><Page title={displayName}>
    <StateView kind="error" title="Sign-in is not configured · အကောင့်ဝင်ရန် မသတ်မှတ်ရသေးပါ" message="Contact the restaurant for an updated app. · အက်ပ်အသစ်အတွက် ဆိုင်သို့ ဆက်သွယ်ပါ။" />
  </Page></SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: color.background }}><Page title={displayName}>
    {logo ? <BrandLogo uri={logo} label={`${displayName} logo`} size={64} /> : null}
    {state.status === "loading" ? <StateView kind="loading" title="Restoring your session… · အကောင့်ဝင်ထားမှုကို ရယူနေသည်…" message="We are checking your secure session before opening your account. · သင့်အကောင့် မဖွင့်မီ အကောင့်ဝင်ထားမှုကို စစ်ဆေးနေပါသည်။" /> : state.status === "error" ? <><StateView kind="error" title="Continue securely · လုံခြုံစွာ ဆက်သုံးပါ" message={state.message} onRetry={() => { void retry(); }} />
      <Action title="Clear saved session and sign out · အကောင့်ထွက်ရန်" secondary onPress={() => { void signOut().catch(() => undefined); }} /></> : <AuthPanel confirmationNotice={confirmationMessage ? {
        english: confirmationMessage, burmese: confirmationMessageBurmese ?? confirmationMessage
      } : undefined} />}
  </Page></SafeAreaView>;
}
