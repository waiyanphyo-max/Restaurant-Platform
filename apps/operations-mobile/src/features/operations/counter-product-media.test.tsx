import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ key: "", states: new Map<string, unknown>() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState(initial: unknown) {
  const key = harness.key;
  if (!harness.states.has(key)) harness.states.set(key, initial);
  return [harness.states.get(key), (value: unknown) => harness.states.set(key, value)];
} }));
vi.mock("react-native", () => ({ Image: "Image", View: "View", ActivityIndicator: "ActivityIndicator", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("../../components/ui", () => ({ useUiTheme: () => ({ color: { surfaceMuted: "#eeeeee", foregroundMuted: "#555555" } }) }));
import { CounterProductMedia, counterImageUrl } from "./CounterProductMedia";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function render(uri?: string | null) {
  const slot = CounterProductMedia({ uri, label: "Noodles" });
  harness.key = String(slot.key);
  return (slot.type as (props: typeof slot.props) => ReactNode)(slot.props);
}
beforeEach(() => harness.states.clear());
describe("counter catalog media", () => {
  it("accepts public HTTPS without credentials or private URL parts", () => {
    expect(counterImageUrl("https://media.example.test/dish.png")).toBe("https://media.example.test/dish.png");
    for (const uri of [undefined, null, "", "http://media.example.test/a.png", "data:image/png;base64,AAAA", "file:///private/photo", "javascript:alert(1)",
      "https://user:password@media.example.test/a.png", "https://media.example.test/a.png?token=secret", "https://media.example.test/a.png#private",
      " https://media.example.test/a.png", "https:\\media.example.test/a.png", "https://media.example.test/a\n.png"]) expect(counterImageUrl(uri)).toBeUndefined();
  });
  it("uses the exact 24px food icon in a 72px slot and keeps loading/error fallback stable", () => {
    const uri = "https://media.example.test/a.png";
    let tree = render(uri);
    const slotStyles = (tree as ReactElement<{ style: object[] }>).props.style;
    expect(slotStyles[0]).toMatchObject({ width: 72, height: 72, flexShrink: 0 });
    expect(elements(tree).some(item => item.type === "ActivityIndicator")).toBe(true);
    const picture = elements(tree).find(item => item.type === "Image")!;
    (picture.props.onLoad as () => void)(); expect(elements(render(uri)).some(item => item.type === "ActivityIndicator")).toBe(false);
    (picture.props.onError as () => void)(); tree = render(uri);
    const fallback = elements(tree).find(item => item.type === "Image")!;
    expect((fallback.props.style as object[])[0]).toEqual({ width: 24, height: 24 });
    expect(elements(tree).some(item => item.props.accessibilityLabel === "Noodles · Photo unavailable · ဓာတ်ပုံ မရရှိပါ")).toBe(true);
    expect(elements(render(null)).some(item => item.props.accessibilityLabel === "Noodles · Photo unavailable · ဓာတ်ပုံ မရရှိပါ")).toBe(true);
  });
  it("recovers on a new URL and isolates late failure callbacks from the old slot", () => {
    const old = elements(render("https://media.example.test/old.png")).find(item => item.type === "Image")!;
    const next = "https://media.example.test/new.png";
    render(next); (old.props.onError as () => void)();
    expect(elements(render(next)).find(item => item.type === "Image")?.props.source).toEqual({ uri: next });
    expect(elements(render(next)).some(item => item.type === "ActivityIndicator")).toBe(true);
  });
});
