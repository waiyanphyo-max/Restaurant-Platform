import { router, Stack, useRootNavigationState, type ErrorBoundaryProps } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OperationsAuthProvider, useOperationsAuth } from "../src/auth/AuthProvider";
import { operationsNotifications } from "../src/notifications/native";
import { useNotificationInbox } from "@restaurant-platform/mobile-notifications/navigation";

const openInbox = () => router.navigate("/notifications");
function Navigation() {
  const { state, workspace } = useOperationsAuth();
  const navigation = useRootNavigationState();
  useNotificationInbox({
    owner: state.status === "ready" ? state.userId : null,
    navigationReady: !!navigation?.key,
    discardResponse: state.status === "signed_out" || state.status === "denied" || state.status === "unconfigured",
    ownsNotifications: operationsNotifications.ownsNotifications,
    openInbox
  });
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="open" />
    <Stack.Protected guard={state.status === "ready" || !!workspace && state.status === "checking_membership" && workspace.userId === state.userId}>
      <Stack.Screen name="(workspace)" />
    </Stack.Protected>
    <Stack.Screen name="+not-found" />
  </Stack>;
}

export default function RootLayout() {
  return <SafeAreaProvider><OperationsAuthProvider><Navigation /></OperationsAuthProvider></SafeAreaProvider>;
}

/** Configuration failures must remain renderable even when branding cannot be read. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={styles.error}><Text accessibilityRole="header" style={styles.title}>Operations could not open</Text>
    <Text>Restart the app or contact your restaurant administrator if this continues.</Text><Button title="Try again" onPress={retry} />
  </View>;
}

const styles = StyleSheet.create({ error: { flex: 1, justifyContent: "center", padding: 24, gap: 16 }, title: { fontSize: 22, fontWeight: "700" } });
