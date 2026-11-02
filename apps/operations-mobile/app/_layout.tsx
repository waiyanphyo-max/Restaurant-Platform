import { Stack, type ErrorBoundaryProps } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OperationsAuthProvider, useOperationsAuth } from "../src/auth/AuthProvider";

function Navigation() {
  const { state } = useOperationsAuth();
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="index" />
    <Stack.Protected guard={state.status === "ready"}>
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
