import { router, Stack, useRootNavigationState, type ErrorBoundaryProps } from "expo-router";
import { Button, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CustomerAuthProvider, useCustomerAuth } from "../src/auth/AuthProvider";
import { customerNotifications } from "../src/notifications/native";
import { useNotificationInbox } from "@restaurant-platform/mobile-notifications/navigation";

const openInbox = () => router.navigate("/notifications");
function Navigation() {
  const { state } = useCustomerAuth();
  const navigation = useRootNavigationState();
  useNotificationInbox({
    owner: state.status === "signed_in" ? state.userId : null,
    navigationReady: !!navigation?.key,
    discardResponse: state.status === "signed_out" || state.status === "unconfigured",
    ownsNotifications: customerNotifications.ownsNotifications,
    openInbox
  });
  return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="index" /><Stack.Screen name="open" /><Stack.Screen name="email-confirmation" />
    <Stack.Protected guard={state.status === "signed_in"}><Stack.Screen name="(store)" /></Stack.Protected>
    <Stack.Screen name="+not-found" />
  </Stack>;
}
export default function RootLayout() {
  return <SafeAreaProvider><CustomerAuthProvider><Navigation /></CustomerAuthProvider></SafeAreaProvider>;
}
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}><Text accessibilityRole="header">Customer app could not open</Text>
    <Text>Restart the app or contact the restaurant if this continues.</Text><Button title="Try again" onPress={retry} /></View>;
}
