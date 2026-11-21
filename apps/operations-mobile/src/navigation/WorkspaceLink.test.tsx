import type { ComponentProps, ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Link } from "expo-router";

const harness = vi.hoisted(() => ({ primary: "#234D3C" }));
vi.mock("expo-router", () => ({ Link: "Link" }));
vi.mock("../components/ui", () => ({ useUiTheme: () => ({ color: { primary: harness.primary } }) }));
import { WorkspaceLink } from "./WorkspaceLink";

describe("core workspace text links", () => {
  it("preserves the route, label and press handler while requesting a 48px scalable touch target", () => {
    const href = { pathname: "/order/[orderId]", params: { orderId: "synthetic-order" } } as const;
    const onPress = vi.fn();
    const result = WorkspaceLink({ href, children: "Open order · အော်ဒါကြည့်ရန်", onPress }) as ReactElement<ComponentProps<typeof Link>>;
    expect(result.props).toMatchObject({ href, children: "Open order · အော်ဒါကြည့်ရန်", onPress, allowFontScaling: true, accessibilityRole: "link" });
    expect(result.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 48, paddingVertical: 12, lineHeight: 24 })]));
    expect(result.props.numberOfLines).toBeUndefined();
  });

  it.each(["#A51D22", "#234D3C"])("uses the current %s tenant color", primary => {
    harness.primary = primary;
    const result = WorkspaceLink({ href: "/queue", children: "Pickup queue" }) as ReactElement<ComponentProps<typeof Link>>;
    expect(result.props.style).toEqual(expect.arrayContaining([{ color: primary }]));
  });
});
