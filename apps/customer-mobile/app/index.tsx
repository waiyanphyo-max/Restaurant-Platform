import { Redirect } from "expo-router";
import { Image, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthPanel } from "../src/auth/AuthPanel";
import { useCustomerAuth } from "../src/auth/AuthProvider";
import { Action, Page, StateView, useUiTheme } from "../src/components/ui";
import { useRuntimeBranding } from "../src/branding/RuntimeBrandingProvider";

export default function SignIn({ destination = "/home", confirmationMessage }: { destination?: string; confirmationMessage?: string } = {}) {
  const { state, retry, signOut } = useCustomerAuth();
  const { displayName, logoUrl: logo } = useRuntimeBranding();
  const { color } = useUiTheme();
  if (state.status === "signed_in") return <Redirect href={destination} />;
  if (state.status === "unconfigured") return <SafeAreaView style={{ flex: 1 }}><StateView kind="error" title="Sign-in is not configured" message="Contact the restaurant for an updated app." /></SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: color.background }}><Page title={displayName} subtitle="Your restaurant, ready when you are.">
    {logo ? <Image source={{ uri: logo }} accessibilityLabel={`${displayName} logo`} style={{ width: 64, height: 64 }} /> : null}
    {confirmationMessage && <Text accessibilityRole="alert">{confirmationMessage}</Text>}
    {state.status === "loading" ? <StateView kind="loading" /> : state.status === "error" ? <><StateView kind="error" message={state.message} onRetry={() => { void retry(); }} />
      <Action title="Clear saved session and sign out" secondary onPress={() => { void signOut().catch(() => undefined); }} /></> : <AuthPanel />}
  </Page></SafeAreaView>;
}
