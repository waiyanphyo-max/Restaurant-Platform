import { useState } from "react";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { Action, Body, Card, ConfirmDialog, Page } from "../../components/ui";
import { readEmbeddedTenant } from "../../tenant";

export function ProfileScreen() {
  const { state, signOut, retryMembership } = useOperationsAuth();
  const [confirm, setConfirm] = useState(false);
  if (state.status !== "ready") return null;
  const tenant = readEmbeddedTenant();
  return <Page title="Profile">
    <Card title="Your restaurant membership"><Body>Restaurant: {state.membership.name}</Body>
      <Body>Role: {state.membership.role.replaceAll("_", " ")}</Body><Body>Account: {state.userId}</Body>
      <Body>Restaurant ID: {tenant.restaurantId}</Body><Body>Environment: {tenant.environment}</Body>
      <Action title="Refresh access" secondary onPress={() => void retryMembership()} />
      <Action title="Sign out" onPress={() => setConfirm(true)} />
    </Card>
    <ConfirmDialog visible={confirm} title="Sign out?" message="You will need to sign in again to open this restaurant workspace."
      confirmLabel="Sign out" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void signOut().catch(() => undefined); }} />
  </Page>;
}
