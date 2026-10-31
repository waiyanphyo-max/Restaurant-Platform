import { useEffect, useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { getCustomerAuth } from "./native";
import type { AuthSnapshot, NativeSessionController } from "./session";

type ViewState = AuthSnapshot | { status: "loading" | "unconfigured" };

export function AuthPanel() {
  const [service, setService] = useState<NativeSessionController | null>(null);
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const auth = getCustomerAuth();
      setService(auth);
      const unsubscribe = auth.subscribe((snapshot) => {
        if (active) setState(snapshot);
      });
      void auth.restore().then((snapshot) => {
        if (active) setState(snapshot);
      }).catch(() => {
        if (active) {
          setState({ status: "signed_out" });
          setError("The saved session could not be restored. Sign in again.");
        }
      });
      return () => {
        active = false;
        unsubscribe();
      };
    } catch {
      setState({ status: "unconfigured" });
    }
  }, []);

  async function signIn() {
    if (!service || busy) return;
    setBusy(true);
    setError(null);
    try {
      await service.signInWithPassword(email, password);
      setPassword("");
    } catch {
      setPassword("");
      setError("Sign-in failed. Check your credentials and connection.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!service || busy) return;
    setBusy(true);
    setError(null);
    try {
      await service.signOut();
    } catch {
      setError("The session could not be cleared. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") return <Text>Restoring session…</Text>;
  if (state.status === "unconfigured") {
    return <Text>Sign-in is unavailable in this build.</Text>;
  }
  if (state.status === "signed_in") {
    return (
      <View style={styles.panel}>
        <Text>You are signed in for this restaurant.</Text>
        <Button title={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void signOut()} />
        {error && <Text accessibilityRole="alert">{error}</Text>}
      </View>
    );
  }
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Customer sign in</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        accessibilityLabel="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={() => void signIn()} />
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, marginTop: 20 },
  title: { fontSize: 18, fontWeight: "600" },
  input: { backgroundColor: "#FFFFFF", borderColor: "#8C9AA8", borderWidth: 1, borderRadius: 8, padding: 12 }
});
