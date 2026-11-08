import { Stack, type ErrorBoundaryProps } from "expo-router";
import { Button, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CustomerAuthProvider, useCustomerAuth } from "../src/auth/AuthProvider";

function Navigation() {
  const { state } = useCustomerAuth();
  return <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="index" /><Stack.Screen name="open" />
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
