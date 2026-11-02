import { useState } from "react";
import { Text } from "react-native";
import { Action, Body, Card, FormField } from "../components/ui";
import { useOperationsAuth } from "./AuthProvider";

/** Credentials live only in this form and the Auth SDK, never navigation state. */
export function AuthPanel() {
  const { signInWithPassword } = useOperationsAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch {
      setError("Sign-in failed. Check your credentials and connection.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <Card title="Team sign in">
      <Body>Use the account invited to this restaurant.</Body>
      <FormField
        label="Email"
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!busy}
        value={email}
        onChangeText={setEmail}
      />
      <FormField
        label="Password"
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        editable={!busy}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => void signIn()}
      />
      <Action title={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={() => void signIn()} />
      {error && <Text accessibilityRole="alert">{error}</Text>}
    </Card>
  );
}
