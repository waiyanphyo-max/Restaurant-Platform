import { useState } from "react";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { Action, Body, Card, ConfirmDialog, Page } from "../../components/ui";
import { readEmbeddedTenant } from "../../tenant";
import { operationsNotifications } from "../../notifications/native";

export function ProfileScreen() {
  const { state, signOut, retryMembership } = useOperationsAuth();
  const [confirm, setConfirm] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (state.status !== "ready") return null;
  const tenant = readEmbeddedTenant();
  async function enableNotifications() {
    setEnabling(true);
    try {
      const result = await operationsNotifications.enable("Restaurant updates");
      const message = {
        unconfigured: "Notifications are not configured in this build.",
        signed_out: "Verify your restaurant access before enabling notifications.",
        non_physical: "Use a physical Android device to register for notifications.",
        denied: "Notification permission was not granted. You can enable it later in Android settings.",
        registered: "This device is registered for restaurant updates."
      };
      setNotice(message[result]);
    } catch {
      setNotice("Unable to confirm registration. Check your connection and try again.");
    } finally { setEnabling(false); }
  }
  return <Page title="Profile">
    <Card title="Your restaurant membership"><Body>Restaurant: {state.membership.name}</Body>
      <Body>Role: {state.membership.role.replaceAll("_", " ")}</Body><Body>Account: {state.userId}</Body>
      <Body>Restaurant ID: {tenant.restaurantId}</Body><Body>Environment: {tenant.environment}</Body>
      <Action title="Refresh access" secondary onPress={() => void retryMembership()} />
      <Action title="Sign out" onPress={() => setConfirm(true)} />
    </Card>
    {tenant.notificationsEnabled ? <Card title="Notifications">
      {notice ? <Body>{notice}</Body> : null}
      <Action title="Enable notifications" disabled={enabling} onPress={() => void enableNotifications()} />
    </Card> : null}
    <ConfirmDialog visible={confirm} title="Sign out?" message="You will need to sign in again to open this restaurant workspace."
      confirmLabel="Sign out" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void signOut().catch(() => undefined); }} />
  </Page>;
}
