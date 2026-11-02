import { Redirect } from "expo-router";
import { Button, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOperationsAuth } from "../src/auth/AuthProvider";
import { AuthPanel } from "../src/auth/AuthPanel";
import { Page, StateView } from "../src/components/ui";
import { readEmbeddedTenant } from "../src/tenant";

export default function AccessScreen() {
  const { state, retryMembership, signOut } = useOperationsAuth();
  if (state.status === "ready") return <Redirect href="/dashboard" />;
  // Do not depend on valid branding to explain an invalid build.
  if (state.status === "unconfigured") return <SafeAreaView style={{ flex: 1, padding: 24, gap: 16 }}>
    <Text accessibilityRole="header">This Operations build is not configured</Text>
    <Text>Contact your restaurant administrator for a configured Android build.</Text>
  </SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f8fa" }}>
    <Page title={readEmbeddedTenant().branding.displayName} subtitle="Sign in to your restaurant workspace.">
      {state.status === "signed_out" ? <AuthPanel /> : <>
        <StateView kind={state.status === "loading" || state.status === "checking_membership" ? "loading" : state.status}
          message={"message" in state ? state.message : "Checking your session and restaurant membership."}
          onRetry={state.status === "loading" || state.status === "checking_membership" ? undefined : () => void retryMembership()} />
        <Button title="Sign out" onPress={() => void signOut().catch(() => undefined)} />
      </>}
    </Page>
  </SafeAreaView>;
}
