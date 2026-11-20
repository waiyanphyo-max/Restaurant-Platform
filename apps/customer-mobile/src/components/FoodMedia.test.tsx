import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeFoodImageUrl } from "./media";

const harness = vi.hoisted(() => ({ key: "", states: new Map<string, unknown>() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState(initial: unknown) {
  const key = harness.key;
  if (!harness.states.has(key)) harness.states.set(key, initial);
  return [harness.states.get(key), (value: unknown) => harness.states.set(key, value)];
} }));
vi.mock("react-native", () => ({ Image: "Image", View: "View", ActivityIndicator: "ActivityIndicator", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("./ui", () => ({ Body: "Body", useUiTheme: () => ({ color: { surfaceMuted: "#eeeeee", foregroundMuted: "#555555" } }) }));
vi.mock("../i18n", () => ({ useCustomerText: () => (english: string) => english }));
import { FoodMedia, BrandLogo } from "./FoodMedia";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function render(uri?: string | null) {
  const slot = FoodMedia({ uri, label: "Noodles", hero: true });
  harness.key = String(slot.key);
  return (slot.type as (props: typeof slot.props) => ReactNode)(slot.props);
}

describe("safe native public food photos", () => {
  beforeEach(() => harness.states.clear());
  it("accepts public HTTPS photos and refuses credentials, signed queries, unsafe schemes and transport coercion", () => {
    expect(safeFoodImageUrl("https://media.example.test/dish.png")).toBe("https://media.example.test/dish.png");
    for (const uri of [undefined, null, "", "http://media.example.test/a.png", "data:image/png;base64,AAAA", "file:///private/photo", "javascript:alert(1)",
      "https://user:password@media.example.test/a.png", "https://media.example.test/a.png?token=secret", "https://media.example.test/a.png#private",
      " https://media.example.test/a.png", "https:\\media.example.test/a.png", "https://media.example.test/a\n.png"]) expect(safeFoodImageUrl(uri)).toBeUndefined();
  });

  it("keeps a stable fallback slot for missing/failed media and reports loading until success", () => {
    const uri = "https://media.example.test/a.png";
    let tree = render(uri);
    expect(elements(tree).some(item => item.type === "ActivityIndicator")).toBe(true);
    const picture = elements(tree).find(item => item.type === "Image")!;
    (picture.props.onLoad as () => void)();
    expect(elements(render(uri)).some(item => item.type === "ActivityIndicator")).toBe(false);
    (picture.props.onError as () => void)();
    tree = render(uri);
    expect(elements(tree).some(item => item.props.children === "Photo unavailable")).toBe(true);
    expect(elements(tree).some(item => item.props.accessibilityLabel === "Noodles · Photo unavailable")).toBe(true);
    expect(elements(render(null)).some(item => item.props.children === "Photo unavailable")).toBe(true);
  });

  it("recovers for a changed safe URL and isolates late failures from the prior slot", () => {
    const old = elements(render("https://media.example.test/old.png")).find(item => item.type === "Image")!;
    const next = "https://media.example.test/new.png";
    render(next); (old.props.onError as () => void)();
    expect(elements(render(next)).find(item => item.type === "Image")?.props.source).toEqual({ uri: next });
    expect(elements(render(next)).some(item => item.type === "ActivityIndicator")).toBe(true);
    expect(FoodMedia({ uri: next, label: "Dish" }).key).not.toBe(FoodMedia({ uri: "https://media.example.test/old.png", label: "Dish" }).key);
  });

  it("hides a failed runtime logo while allowing a replacement logo to load", () => {
    const logo = BrandLogo({ uri: "https://media.example.test/logo.png", label: "Restaurant A logo" })!;
    harness.key = String(logo.key);
    const image = (logo.type as (props: typeof logo.props) => ReactElement<Record<string, unknown>>)(logo.props);
    (image.props.onError as () => void)();
    expect((logo.type as (props: typeof logo.props) => ReactNode)(logo.props)).toBeNull();
    const replacement = BrandLogo({ uri: "https://media.example.test/new-logo.png", label: "Restaurant B logo" })!;
    expect(replacement.key).not.toBe(logo.key);
  });
});
