import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { useCustomerAuth } from "./AuthProvider";

export function AuthPanel() {
  const auth = useCustomerAuth();
  const [mode, setMode] = useState<"login" | "signup" | "phone">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      if (mode === "signup") {
        const result = await auth.signUpWithPassword(email, password);
        if (!result.authenticated) {
          setMessage("Check your email to confirm your account, then return here and sign in. Address setup follows sign-in.");
          setMode("login");
        }
      } else if (mode === "phone") {
        if (codeRequested) await auth.verifyPhoneOtp(phone.trim(), code.trim());
        else {
          await auth.requestPhoneOtp(phone.trim());
          setCodeRequested(true);
          setMessage("Enter the code sent by your configured SMS provider. Delivery may take a moment.");
        }
      } else { await auth.signInWithPassword(email, password); }
    } catch {
      setMessage(mode === "signup"
        ? "Account creation failed. Use a valid email and at least 8 password characters; check your connection."
        : mode === "phone" ? "Phone sign-in failed. Check your number, code and connection. Request another code after one minute if needed."
        : "Sign-in failed. Check your email, password and connection.");
    } finally { setBusy(false); setPassword(""); setCode(""); }
  }

  if (auth.state.status === "loading") return <Text>Restoring secure session…</Text>;
  if (auth.state.status === "unconfigured") return <Text>Sign-in is unavailable in this build. Configure the public Auth settings to continue.</Text>;
  if (auth.state.status === "error") return <View style={styles.panel}>
    <Text accessibilityRole="alert">{auth.state.message}</Text>
    <Button title="Retry session" onPress={() => void auth.retry()} />
    <Button title="Sign out" onPress={() => { void auth.signOut().catch(() => {}); }} />
  </View>;
  if (auth.state.status === "signed_in") return null;

  function changeMode(next: typeof mode) {
    setMode(next); setPassword(""); setCode(""); setCodeRequested(false); setMessage(null);
  }
  return <View style={styles.panel}>
    <Text style={styles.title}>{mode === "signup" ? "Create your customer account" : mode === "phone" ? "Sign in with your verified phone" : "Welcome back"}</Text>
    {mode === "phone" ? <>
      <TextInput style={styles.input} accessibilityLabel="International phone number" placeholder="+959…" keyboardType="phone-pad"
        autoComplete="tel" value={phone} editable={!busy} onChangeText={value => { setPhone(value); setCodeRequested(false); }} />
      {codeRequested && <TextInput style={styles.input} accessibilityLabel="SMS verification code" keyboardType="number-pad" autoComplete="sms-otp"
        value={code} onChangeText={setCode} maxLength={10} secureTextEntry />}
    </> : <>
      <TextInput style={styles.input} accessibilityLabel="Email" placeholder="Email" keyboardType="email-address" autoCapitalize="none"
        autoComplete="email" value={email} editable={!busy} onChangeText={setEmail} />
      <TextInput style={styles.input} accessibilityLabel="Password" placeholder={mode === "signup" ? "Password (at least 8 characters)" : "Password"}
        secureTextEntry autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} editable={!busy} onChangeText={setPassword} />
    </>}
    <Button title={busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "phone" ? codeRequested ? "Verify and sign in" : "Send SMS code" : "Sign in"}
      disabled={busy} onPress={() => void submit()} />
    {mode === "phone" && codeRequested && <Button title="Request another code" disabled={busy} onPress={() => { setCodeRequested(false); setCode(""); }} />}
    <Button title={mode === "signup" ? "Already have an account? Sign in" : "Create an email account"} disabled={busy}
      onPress={() => changeMode(mode === "signup" ? "login" : "signup")} />
    {mode !== "login" && <Button title="Use email sign in" disabled={busy} onPress={() => changeMode("login")} />}
    {auth.phoneEnabled && mode !== "phone" && <Button title="Use verified phone sign in" disabled={busy} onPress={() => changeMode("phone")} />}
    {mode === "phone" && <Text style={styles.note}>For existing verified Auth phone accounts. This does not link a phone to your email account.</Text>}
    {mode === "signup" && <Text style={styles.note}>You can choose a Home Address after sign-in, or skip it until later.</Text>}
    {message && <Text accessibilityRole="alert">{message}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 12, marginTop: 16 }, title: { fontSize: 21, fontWeight: "700", color: "#18222E" },
  input: { backgroundColor: "#FFFFFF", borderColor: "#8C9AA8", borderWidth: 1, borderRadius: 8, padding: 12 },
  note: { fontSize: 13, lineHeight: 19, color: "#506070" }
});
