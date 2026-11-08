import { Redirect } from "expo-router";
import { Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthPanel } from "../src/auth/AuthPanel";
import { useCustomerAuth } from "../src/auth/AuthProvider";
import { Action, Page, StateView } from "../src/components/ui";
import { readEmbeddedTenant } from "../src/tenant";

export default function SignIn({ destination = "/home" }: { destination?: string } = {}) {
  const { state, retry, signOut } = useCustomerAuth();
  if (state.status === "signed_in") return <Redirect href={destination} />;
  if (state.status === "unconfigured") return <SafeAreaView style={{ flex: 1 }}><StateView kind="error" title="Sign-in is not configured" message="Contact the restaurant for an updated app." /></SafeAreaView>;
  const { branding } = readEmbeddedTenant();
  const logo = branding.logoDataUri ?? branding.logoUrl;
  return <SafeAreaView style={{ flex: 1, backgroundColor: branding.backgroundColor ?? "#f6f8fa" }}><Page title={branding.displayName} subtitle="Your restaurant, ready when you are.">
    {logo ? <Image source={{ uri: logo }} accessibilityLabel={`${branding.displayName} logo`} style={{ width: 64, height: 64 }} /> : null}
    {state.status === "loading" ? <StateView kind="loading" /> : state.status === "error" ? <><StateView kind="error" message={state.message} onRetry={() => { void retry(); }} />
      <Action title="Clear saved session and sign out" secondary onPress={() => { void signOut().catch(() => undefined); }} /></> : <AuthPanel />}
  </Page></SafeAreaView>;
}
