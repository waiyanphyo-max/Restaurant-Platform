import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { StateView } from "../components/ui";
import { OperationsWorkspaceContext, useOperationsAuth } from "./AuthProvider";

/** Preserve screen memory during revalidation while hiding all protected content. */
export function WorkspaceBoundary({ children }: PropsWithChildren) {
  const { state, workspace } = useOperationsAuth();
  if (!workspace) return null;
  const paused = state.status !== "ready";
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1, display: paused ? "none" : "flex" }} pointerEvents={paused ? "none" : "auto"}
      accessibilityElementsHidden={paused} importantForAccessibility={paused ? "no-hide-descendants" : "auto"}>
      <OperationsWorkspaceContext key={`${workspace.userId}:${workspace.membership.role}`}>
        {children}
      </OperationsWorkspaceContext>
    </View>
    {paused ? <StateView kind="loading" message="Checking your restaurant access…" /> : null}
  </View>;
}
