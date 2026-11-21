import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Href } from "expo-router";

const harness = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ navigate: harness.navigate }) }));
vi.mock("../components/ui", () => ({ Action: "Action" }));
import { RouteAction } from "./RouteAction";
import type { Action } from "../components/ui";

beforeEach(() => harness.navigate.mockReset());

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
});
