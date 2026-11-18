import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationsAccessState } from "./access";
import type { VerifiedWorkspace } from "./workspace";

const harness = vi.hoisted(() => ({ state: { status: "ready" } as OperationsAccessState,
  workspace: null as VerifiedWorkspace | null }));
vi.mock("./AuthProvider", () => ({ useOperationsAuth: () => harness, OperationsWorkspaceContext: "context" }));
vi.mock("react-native", () => ({ View: "view" }));
vi.mock("../components/ui", () => ({ StateView: "status" }));
import { WorkspaceBoundary } from "./WorkspaceBoundary";

function content() {
  const result = WorkspaceBoundary({ children: <p>Selected product</p> }) as ReactElement<{ children: ReactElement[] }>;
  const view = result.props.children[0] as ReactElement<{
    style: { display: string }; pointerEvents: string; accessibilityElementsHidden: boolean;
    importantForAccessibility: string; children: ReactElement;
  }>;
  return { result, view };
}

describe("protected picker workspace boundary", () => {
  beforeEach(() => {
    harness.workspace = { status: "ready", userId: "owner-a", membership: {
      restaurantId: "restaurant-a", role: "OWNER", active: true, name: "Restaurant", slug: "restaurant",
    } };
    harness.state = harness.workspace;
  });

  it("keeps the component identity through checking while hiding and disabling protected content", () => {
    const ready = content();
    harness.state = { status: "checking_membership", userId: "owner-a" };
    const paused = content();
    expect(paused.view.props.children.key).toBe(ready.view.props.children.key);
    expect(paused.view.props).toMatchObject({ style: { display: "none" }, pointerEvents: "none",
      accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
    expect(paused.result.props.children[1]).toMatchObject({ props: { kind: "loading" } });
    harness.state = harness.workspace!;
    expect(content().view.props).toMatchObject({ style: { display: "flex" }, pointerEvents: "auto", accessibilityElementsHidden: false });
  });

  it("remounts the protected subtree after a role change and renders no child when access is cleared", () => {
    const originalKey = content().view.props.children.key;
    harness.workspace = { ...harness.workspace!, membership: { ...harness.workspace!.membership, role: "STAFF" } };
    harness.state = harness.workspace;
    expect(content().view.props.children.key).not.toBe(originalKey);
    harness.workspace = null;
    harness.state = { status: "signed_out" };
    expect(WorkspaceBoundary({ children: <p>Private product</p> })).toBeNull();
  });
});
