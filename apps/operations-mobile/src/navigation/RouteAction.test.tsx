import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Href } from "expo-router";

const harness = vi.hoisted(() => ({ navigate: vi.fn(), request: vi.fn((action: () => void) => action()) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ navigate: harness.navigate }) }));
vi.mock("../components/ui", () => ({ Action: "Action" }));
vi.mock("../hooks/useUnsavedChanges", () => ({ useDraftNavigation: () => ({ requestNavigation: harness.request }) }));
import { RouteAction } from "./RouteAction";
import type { Action } from "../components/ui";

beforeEach(() => { harness.navigate.mockReset(); harness.request.mockReset().mockImplementation(action => action()); });

describe("workspace route actions", () => {
  it.each<Href>(["/orders", "/deliveries", { pathname: "/order/[orderId]", params: { orderId: "synthetic-order" } },
    { pathname: "/delivery/[deliveryId]", params: { deliveryId: "synthetic-delivery" } }])("navigates to the unchanged href without Link event injection: %j", href => {
    const action = RouteAction({ href, title: "Open record", secondary: true }) as ReactElement<ComponentProps<typeof Action>>;
    expect(harness.navigate).not.toHaveBeenCalled();
    action.props.onPress();
    expect(harness.navigate).toHaveBeenCalledExactlyOnceWith(href);
  });

  it("retains the existing Action label, loading and disabled presentation contract", () => {
    const action = RouteAction({ href: "/orders", title: "Review order · အော်ဒါကြည့်ရန်", secondary: true,
      disabled: true, loading: true, accessibilityHint: "Open the current order" }) as ReactElement<ComponentProps<typeof Action>>;
    expect(action.props).toMatchObject({ title: "Review order · အော်ဒါကြည့်ရန်", secondary: true, disabled: true, loading: true,
      accessibilityHint: "Open the current order" });
  });

  it("defers leaving an open draft until navigation is confirmed", () => {
    let continueNavigation: (() => void) | undefined;
    harness.request.mockImplementation(action => { continueNavigation = action; });
    const action = RouteAction({ href: "/orders", title: "Open orders" }) as ReactElement<ComponentProps<typeof Action>>;
    action.props.onPress();
    expect(harness.navigate).not.toHaveBeenCalled();
    continueNavigation?.();
    expect(harness.navigate).toHaveBeenCalledExactlyOnceWith("/orders");
  });
});
