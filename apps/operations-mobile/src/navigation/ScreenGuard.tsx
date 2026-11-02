import type { PropsWithChildren } from "react";
import { Redirect } from "expo-router";
import { useOperationsAuth } from "../auth/AuthProvider";
import { Page, StateView } from "../components/ui";
import { readEmbeddedTenant } from "../tenant";
import { canAccessScreen } from "./policy";

export function ScreenGuard({ screenId, children }: PropsWithChildren<{ screenId: string }>) {
  const { state } = useOperationsAuth();
  if (state.status !== "ready") return <Redirect href="/" />;
  if (!canAccessScreen(screenId, state.membership, readEmbeddedTenant().restaurantId)) {
    return <Page title="Screen unavailable"><StateView kind="denied" message="This screen is unavailable for your restaurant access." /></Page>;
  }
  return children;
}
