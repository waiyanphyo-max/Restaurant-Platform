import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "react-native";
import type { CustomerConfirmationResult } from "@restaurant-platform/restaurant-config/customer-confirmation";
import { Action, Page } from "../src/components/ui";
import { confirmCustomerEmail } from "../src/auth/native";
import { takeCustomerConfirmationInput } from "../src/auth/confirmation-link";
import SignIn from "./index";

export default function CustomerEmailConfirmation() {
  const [result, setResult] = useState<CustomerConfirmationResult | "checking">("checking");
  const { attempt } = useLocalSearchParams<{ attempt?: string }>();
  const completion = useRef<{ attempt: string | undefined; result: Promise<CustomerConfirmationResult> } | null>(null);
  useEffect(() => {
    if (!completion.current || completion.current.attempt !== attempt) {
      setResult("checking");
      completion.current = { attempt, result: confirmCustomerEmail(takeCustomerConfirmationInput()).catch(() => "invalid") };
    }
    let active = true;
    void completion.current.result.then(value => { if (active) setResult(value); });
    return () => { active = false; };
  }, [attempt]);
  if (result === "confirmed" || result === "returned") return <SignIn confirmationMessage={result === "confirmed" ? "Your email is confirmed. Sign in with your email and password." : "Your confirmation link has returned. Sign in with your email and password. If your email is still unconfirmed, request a new confirmation email."} />;
  return <SafeAreaView style={{ flex: 1 }}><Page title="Email confirmation">
    <Text accessibilityRole={result === "invalid" ? "alert" : "text"}>
      {result === "checking" ? "Checking your confirmation link…" : "This confirmation link is invalid or expired. Return to sign in and request a new confirmation email."}
    </Text>
    {result !== "checking" && <Action title="Return to sign in" onPress={() => router.replace("/")} />}
  </Page></SafeAreaView>;
}
