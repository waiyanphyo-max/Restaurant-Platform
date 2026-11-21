import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, foundationTokens, resolveThemeTokens } from "@restaurant-platform/ui-tokens";
import { Action, Badge, Body, Card, ConfirmDialog, FormField, Page, StateView, Status, ThemeProvider } from "./ui";

type NativeProps = Record<string, unknown> & {
  children?: ReactNode; style?: unknown; contentContainerStyle?: unknown;
  onPress?: () => void; onFocus?: () => void; onBlur?: () => void; onRequestClose?: () => void; onShow?: () => void;
  accessibilityState?: { disabled?: boolean; selected?: boolean; busy?: boolean; checked?: boolean }; ref?: { current: unknown };
};
const harness = vi.hoisted(() => ({
  nodes: [] as { kind: string; props: NativeProps }[], focused: false,
  tenant: { restaurantId: "restaurant-a", branding: { displayName: "Restaurant A", primaryColor: "#234D3C", secondaryColor: "#E8EEDB", backgroundColor: "#ffffff" } },
  focusAccessibility: vi.fn()
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState() {
    return [harness.focused, (next: boolean | ((previous: boolean) => boolean)) => { harness.focused = typeof next === "function" ? next(harness.focused) : next; }];
  }
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const native = (kind: string) => (props: NativeProps) => {
    harness.nodes.push({ kind, props });
    return createElement("div", null, props.children);
  };
  return {
    Text: native("Text"), View: native("View"), ScrollView: native("ScrollView"), Pressable: native("Pressable"),
    TextInput: native("TextInput"), ActivityIndicator: native("ActivityIndicator"), RefreshControl: native("RefreshControl"),
    Modal: (props: NativeProps) => { harness.nodes.push({ kind: "Modal", props }); return props.visible ? createElement("div", null, props.children) : null; },
    StyleSheet: { create: (styles: unknown) => styles }, AccessibilityInfo: { setAccessibilityFocus: harness.focusAccessibility },
    findNodeHandle: (value: unknown) => value ? 42 : null
  };
});
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => harness.tenant }));

function render(node: ReactNode) {
  harness.nodes = [];
  return renderToStaticMarkup(node);
}
function props(kind: string, index = 0) { return harness.nodes.filter(node => node.kind === kind)[index].props; }
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === "object" ? style as Record<string, unknown> : {};
}
function buttonStyle(pressed = false, index = 0) {
  return flatten((props("Pressable", index).style as (state: { pressed: boolean }) => unknown)({ pressed }));
}
function theme(branding: Parameters<typeof resolveThemeTokens>[0], children: ReactNode, restaurantId = "restaurant-a") {
  return <ThemeProvider restaurantId={restaurantId} branding={branding}>{children}</ThemeProvider>;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  harness.nodes = []; harness.focused = false; harness.focusAccessibility.mockReset();
  harness.tenant = { restaurantId: "restaurant-a", branding: { displayName: "Restaurant A", primaryColor: "#234D3C", secondaryColor: "#E8EEDB", backgroundColor: "#ffffff" } };
});

describe("tenant-safe native foundations", () => {
  it("renders red and a contrasting non-red theme in independent provider subtrees without retaining branding", () => {
    render(<>{theme({ primaryColor: "#A51D22" }, <Action title="A" onPress={vi.fn()} />)}
      {theme({ primaryColor: "#A3E635" }, <Action title="B" onPress={vi.fn()} />)}</>);
    expect(buttonStyle(false, 0).backgroundColor).toBe("#A51D22");
    expect(buttonStyle(false, 1).backgroundColor).toBe("#A3E635");
    expect(contrastRatio(buttonStyle(false, 0).backgroundColor as string, flatten(props("Text", 0).style).color as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(buttonStyle(false, 1).backgroundColor as string, flatten(props("Text", 1).style).color as string)).toBeGreaterThanOrEqual(4.5);
    render(<Action title="Embedded fallback" onPress={vi.fn()} />);
    expect(buttonStyle().backgroundColor).toBe("#234D3C");
  });

  it("rejects foreign-tenant palette values and falls back per field for invalid or unavailable values", () => {
    render(theme({ primaryColor: "#A51D22" }, <Action title="Fixed tenant" onPress={vi.fn()} />, "restaurant-b"));
    expect(buttonStyle().backgroundColor).toBe("#234D3C");
    render(theme({ primaryColor: "invalid" }, <Action title="Invalid palette" onPress={vi.fn()} />));
    expect(buttonStyle().backgroundColor).toBe("#234D3C");
    render(theme(null, <Action title="Unavailable palette" onPress={vi.fn()} />));
    expect(buttonStyle().backgroundColor).toBe("#234D3C");
  });

  it("keeps secondary and status foregrounds readable on a dark restaurant surface", () => {
    const branding = { primaryColor: "#fef08a", secondaryColor: "#082f49", backgroundColor: "#050505" };
    render(theme(branding, <><Action title="Secondary" secondary onPress={vi.fn()} />
      <Body tone="danger">Invalid value</Body><Badge tone="warning">Pending</Badge><Status tone="success">Saved</Status></>));
    const texts = harness.nodes.filter(node => node.kind === "Text");
    expect(contrastRatio(buttonStyle().backgroundColor as string, flatten(texts[0].props.style).color as string)).toBeGreaterThanOrEqual(4.5);
    const colors = resolveThemeTokens(branding).color;
    expect(contrastRatio(colors.surface, flatten(texts[1].props.style).color as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.warningSurface, flatten(texts[2].props.style).color as string)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.successSurface, flatten(texts[3].props.style).color as string)).toBeGreaterThanOrEqual(4.5);
    expect(props("Text", 1).children).toBe("Invalid value");
    expect(props("Text", 2).children).toBe("Pending");
  });

  it("preserves existing action callbacks and selection while disabled or pending actions cannot submit", () => {
    const onPress = vi.fn();
    render(<Action title="Add" selected onPress={onPress} />);
    expect(props("Pressable").accessibilityState?.selected).toBe(true);
    props("Pressable").onPress?.();
    expect(onPress).toHaveBeenCalledOnce();
    for (const state of [{ disabled: true }, { loading: true }]) {
      render(<Action title="Add" {...state} onPress={onPress} />);
      expect(props("Pressable").accessibilityState?.disabled).toBe(true);
      props("Pressable").onPress?.();
    }
    expect(onPress).toHaveBeenCalledOnce();
    expect(props("Pressable").accessibilityState?.busy).toBe(true);
    expect(harness.nodes.some(node => node.kind === "ActivityIndicator")).toBe(true);
  });

  it("provides a visible 3px focus boundary and press feedback without reducing text contrast", () => {
    render(<Action title="Continue" onPress={vi.fn()} />);
    const before = buttonStyle();
    props("Pressable").onFocus?.();
    render(<Action title="Continue" onPress={vi.fn()} />);
    expect(buttonStyle().borderWidth).toBe(3);
    expect(buttonStyle().borderColor).not.toBe(before.borderColor);
    expect(buttonStyle(true).backgroundColor).toBe(buttonStyle().backgroundColor);
    expect(buttonStyle(true).opacity).toBeUndefined();
    props("Pressable").onBlur?.();
    render(<Action title="Continue" onPress={vi.fn()} />);
    expect(buttonStyle().borderColor).toBe(before.borderColor);
  });

  it("announces mutually exclusive choices as radios with their actual checked state", () => {
    for (const selected of [true, false]) {
      render(<Action title="Township" accessibilityRole="radio" selected={selected} secondary={!selected} onPress={vi.fn()} />);
      expect(props("Pressable").accessibilityRole).toBe("radio");
      expect(props("Pressable").accessibilityState?.checked).toBe(selected);
      expect(buttonStyle().minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it("associates labels and error guidance while retaining input callbacks and large-text layout", () => {
    const onFocus = vi.fn(), onBlur = vi.fn(), onChangeText = vi.fn();
    render(<FormField label="Name" error="Name is required" accessibilityHint="Use your full name" onFocus={onFocus} onBlur={onBlur} onChangeText={onChangeText} />);
    const input = props("TextInput");
    expect(input.accessibilityLabel).toBe("Name");
    expect(input.accessibilityLabelledBy).toBe(props("Text", 0).nativeID);
    expect(input.accessibilityHint).toBe("Use your full name. Name is required");
    expect(props("Text", 1).accessibilityRole).toBe("alert");
    expect(props("Text", 1).nativeID).toBe(`${props("Text", 0).nativeID}-error`);
    expect(input.onChangeText).toBe(onChangeText);
    (input.onFocus as (event: unknown) => void)({});
    (input.onBlur as (event: unknown) => void)({});
    expect(onFocus).toHaveBeenCalledOnce(); expect(onBlur).toHaveBeenCalledOnce();
    expect(input.allowFontScaling).toBe(true);
    expect(input.maxFontSizeMultiplier).toBeUndefined();
    expect(flatten(input.style).height).toBeUndefined();
    expect(flatten(input.style).minHeight).toBeGreaterThanOrEqual(48);
  });

  it.each(["loading", "empty", "error", "offline", "forbidden", "denied"] as const)("presents %s without inventing network actions", kind => {
    const retry = vi.fn();
    const html = render(<StateView kind={kind} message="Contextual guidance" onRetry={kind === "loading" ? undefined : retry} retryLabel="Reload current data" />);
    expect(html).toContain("Contextual guidance");
    expect(harness.nodes.some(node => node.kind === "ActivityIndicator")).toBe(kind === "loading");
    expect(harness.nodes.filter(node => node.kind === "View")[0].props.accessibilityState?.busy).toBe(kind === "loading");
    if (kind !== "loading") {
      props("Pressable").onPress?.();
      expect(retry).toHaveBeenCalledOnce();
      expect(html).toContain("Reload current data");
    } else expect(retry).not.toHaveBeenCalled();
    if (kind === "forbidden") expect(html).toContain("You do not have access");
  });

  it("keeps pages, controls and translated text flexible for narrow screens and native scaling", () => {
    render(<Page title="စားသောက်ဆိုင်" subtitle="Current data"><Card title="Options"><Body>Long translated label</Body><Action title="Continue with configured options" onPress={vi.fn()} /></Card></Page>);
    const page = flatten(props("ScrollView").contentContainerStyle);
    expect(page.width).toBe("100%");
    expect(page.maxWidth).toBeLessThanOrEqual(foundationTokens.density.pageMaxWidth);
    expect(props("ScrollView").automaticallyAdjustKeyboardInsets).toBe(true);
    expect(buttonStyle().minHeight).toBeGreaterThanOrEqual(48);
    expect(buttonStyle().minWidth).toBeGreaterThanOrEqual(48);
    expect(buttonStyle().height).toBeUndefined();
    harness.nodes.filter(node => node.kind === "Text").forEach(node => {
      expect(node.props.allowFontScaling).toBe(true);
      expect(node.props.maxFontSizeMultiplier).toBeUndefined();
      expect(node.props.numberOfLines).toBeUndefined();
    });
  });

  it("requires explicit confirmation, keeps cancel first, supports back/escape and scrolls long dialogs", () => {
    const onConfirm = vi.fn(), onCancel = vi.fn();
    const html = render(<ConfirmDialog visible title="Review" message="Review all values" confirmLabel="Confirm" onConfirm={onConfirm} onCancel={onCancel} confirmDisabled />);
    expect(html.indexOf("Cancel")).toBeLessThan(html.indexOf("Confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
    props("Modal").onRequestClose?.();
    expect(onCancel).toHaveBeenCalledOnce();
    const dialog = harness.nodes.find(node => node.props.accessibilityViewIsModal)?.props;
    (dialog?.onAccessibilityEscape as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(flatten(dialog?.style).maxHeight).toBe("90%");
    expect(props("ScrollView").keyboardShouldPersistTaps).toBe("handled");
    props("Pressable", 1).onPress?.();
    expect(onConfirm).not.toHaveBeenCalled();
    const heading = props("Text", 0).ref;
    if (heading) heading.current = {};
    props("Modal").onShow?.();
    expect(harness.focusAccessibility).toHaveBeenCalledWith(42);
    render(<ConfirmDialog visible={false} title="Review" message="Review" confirmLabel="Confirm" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(harness.nodes.some(node => node.kind === "Pressable")).toBe(false);
  });
});
