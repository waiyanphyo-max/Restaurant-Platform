import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiNetworkError } from "@restaurant-platform/api-client";
import type { CategoryResponse, ModifierGroupResponse, ProductManagementResponse, ProductVariantResponse } from "@restaurant-platform/shared-types";

type Frame = { values: unknown[]; effects: { dependencies: unknown[]; cleanup?: () => void }[] };
const scenario = vi.hoisted(() => ({ frames: new Map<string, Frame>(), active: "", cursor: 0, role: "OWNER", userId: "owner-a", tenant: "tenant-a",
  products: [] as ProductManagementResponse[], categories: [] as CategoryResponse[], groups: [] as ModifierGroupResponse[], variants: [] as ProductVariantResponse[], linked: [] as ModifierGroupResponse[],
  queries: [] as string[], dirty: [] as boolean[], write: vi.fn(), reload: vi.fn(), assertAccess: vi.fn(), factory: vi.fn(), signOut: vi.fn(), navigate: vi.fn()
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.cursor++;
    if (!(index in frame.values)) frame.values[index] = typeof initial === "function" ? initial() : initial;
    return [frame.values[index], (value: unknown) => { frame.values[index] = typeof value === "function" ? value(frame.values[index]) : value; }];
  },
  useRef(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.cursor++;
    if (!(index in frame.values)) frame.values[index] = { current: initial }; return frame.values[index];
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!; const index = scenario.cursor++; const previous = frame.effects[index];
    if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
      previous?.cleanup?.(); frame.effects[index] = { dependencies, cleanup: effect() };
    }
  }
}));
vi.mock("react-native", () => ({ View: "View", Switch: "Switch" }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: "ready", userId: scenario.userId,
  membership: { restaurantId: scenario.tenant, role: scenario.role } }, signOut: scenario.signOut, assertWorkspaceAccess: scenario.assertAccess }) }));
vi.mock("../../components/ui", () => ({ Action: "Action", Badge: "Badge", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", FormField: "FormField", Page: "Page", StateView: "StateView", Status: "Status",
  useUiTheme: () => ({ color: { border: "#ddd", primary: "#123B70" } }) }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: (dirty: boolean) => scenario.dirty.push(dirty),
  useDraftNavigation: () => ({ requestNavigation: (action: () => void) => { scenario.navigate(); action(); } }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => {
  scenario.queries.push(key);
  return { state: { status: "ready", data: key.startsWith("menu-product:") ? { variants: scenario.variants, linked: scenario.linked }
    : { products: scenario.products, categories: scenario.categories, groups: scenario.groups, currency: "MMK" } }, reload: scenario.reload };
} }));
vi.mock("../../api", () => ({ getOperationsApi: (access?: unknown) => {
  scenario.factory(access);
  return Object.fromEntries(["createCategory", "updateCategory", "createProduct", "updateProduct", "createVariant", "updateVariant", "createModifierGroup", "updateModifierGroup", "createModifierOption", "updateModifierOption", "linkProductModifierGroup", "unlinkProductModifierGroup"]
    .map(method => [method, (...args: unknown[]) => scenario.write(method, ...args)]));
} }));
vi.mock("./FeaturedProductPanel", () => ({ FeaturedProductPanel: "FeaturedProductPanel" }));
vi.mock("./CatalogImageControl", () => ({ CatalogImageControl: "CatalogImageControl", CatalogPicture: "CatalogPicture" }));

import { MenuScreen } from "./MenuScreen";
type Element = ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => ReactNode;
function render(component: Component, props: Record<string, unknown> = {}, key = component.name): ReactNode {
  scenario.active = key; scenario.cursor = 0;
  if (!scenario.frames.has(key)) scenario.frames.set(key, { values: [], effects: [] }); return component(props);
}
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") return expand(render(node.type as Component, node.props, `${node.type.name}:${node.key ?? ""}`));
  if (node.type === "QueryResult") return expand((node.props.children as (value: unknown) => ReactNode)((node.props.state as { data: unknown }).data));
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node) || node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const screen = () => expand(render(MenuScreen as Component));
function find(type: string, label: string) {
  const item = elements(screen()).find(value => value.type === type && [value.props.title, value.props.label].includes(label));
  if (!item) throw new Error(`Missing ${type}: ${label}`); return item;
}
function press(label: string) { (find("Action", label).props.onPress as () => void)(); }
function field(label: string, value: string) { (find("FormField", label).props.onChangeText as (value: string) => void)(value); }
function toggle(label: string, value: boolean) {
  const item = elements(screen()).find(element => element.type === "Switch" && element.props.accessibilityLabel === label)!;
  (item.props.onValueChange as (value: boolean) => void)(value);
}
function text(node = screen()): string { return nodeText(node); }
function nodeText(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (!isValidElement<Record<string, unknown>>(node)) return typeof node === "string" || typeof node === "number" ? String(node) : "";
  return [node.props.title, node.props.message, nodeText(node.props.children as ReactNode)].filter(Boolean).join(" ");
}
function confirm(title: string) { (find("ConfirmDialog", title).props.onConfirm as () => void)(); }
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const category: CategoryResponse = { id: "category-a", name: "Meals", displayOrder: 0, active: true };
const product: ProductManagementResponse = { id: "product-a", categoryId: category.id, name: "ထမင်း Rice bowl", description: "Long description\nမြန်မာစာ", price: 2500,
  trackStock: true, stockQuantity: 4, available: true, imageUrl: "https://media.example.test/a.png", createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z" };
const group: ModifierGroupResponse = { id: "group-a", name: "Spice\nအစပ်", required: false, minSelections: 0, maxSelections: 1, active: true,
  options: [{ id: "option-a", groupId: "group-a", name: "Mild", additionalPrice: 0, available: true }] };
const otherTenant = Object.freeze({ ...product, id: "product-b", categoryId: "category-b", name: "Restaurant B soup", price: 7000 });
const orderSnapshot = Object.freeze({ name: product.name, price: 2500, option: "Mild", quantity: 1 });

beforeEach(() => {
  vi.clearAllMocks(); scenario.frames.clear(); scenario.queries = []; scenario.dirty = []; scenario.role = "OWNER"; scenario.userId = "owner-a"; scenario.tenant = "tenant-a";
  scenario.products = [{ ...product }]; scenario.categories = [{ ...category }]; scenario.groups = [{ ...group, options: group.options.map(option => ({ ...option })) }];
  scenario.variants = [{ id: "variant-a", productId: product.id, name: "Large", description: "For sharing", price: 3500, available: true, imageUrl: null,
    createdAt: product.createdAt, updatedAt: product.updatedAt }]; scenario.linked = [];
  scenario.write.mockResolvedValue({ ...product });
});

describe("UXI-11 catalog review and role safeguards", () => {
  it.each(["OWNER", "MANAGER"])("%s reviews exact prices and stock before writing the actual product ID", async role => {
    scenario.role = role; press(`Edit ${product.name}`); field("Price (whole currency amount)", "9007199254740991"); field("Current stock quantity", "8");
    press("Review product"); expect(scenario.write).not.toHaveBeenCalled();
    expect(find("ConfirmDialog", "Save product?").props.message).toContain("9,007,199,254,740,991");
    const save = find("ConfirmDialog", "Save product?").props.onConfirm as () => void; save(); save(); await settle();
    expect(scenario.write).toHaveBeenCalledExactlyOnceWith("updateProduct", product.id, expect.objectContaining({ categoryId: category.id, price: Number.MAX_SAFE_INTEGER, stockQuantity: 8, imageUrl: product.imageUrl }));
    expect(scenario.factory).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "owner-a", assertCurrentAccess: expect.any(Function) }));
    expect(scenario.reload).toHaveBeenCalledOnce(); expect(otherTenant.price).toBe(7000); expect(orderSnapshot.price).toBe(2500);
  });
  it("keeps Staff read-only and denies Driver before any catalog query", () => {
    scenario.role = "STAFF"; expect(text()).toContain("can browse the menu"); expect(text()).not.toContain("Create product");
    expect(text()).not.toContain(`Edit ${product.name}`); scenario.queries = []; scenario.role = "DELIVERY_DRIVER";
    expect(text()).toContain("cannot access the catalog"); expect(scenario.queries).toEqual([]); expect(scenario.write).not.toHaveBeenCalled();
  });
  it("shows local validation before review and keeps the entered draft", () => {
    press(`Edit ${product.name}`); field("Price (whole currency amount)", "1.5"); press("Review product");
    expect(text()).toContain("Price must be a whole number"); expect(find("FormField", "Price (whole currency amount)").props.value).toBe("1.5");
    expect(scenario.write).not.toHaveBeenCalled(); expect(elements(screen()).some(item => item.type === "ConfirmDialog")).toBe(false);
  });
  it("invalidates review if entered values change before confirmation", () => {
    press(`Edit ${product.name}`); field("Price (whole currency amount)", "3000"); press("Review product");
    field("Price (whole currency amount)", "3100"); confirm("Save product?");
    expect(text()).toContain("draft changed"); expect(scenario.write).not.toHaveBeenCalled();
  });
  it("reviews category deactivation and product availability without deleting records", async () => {
    press("Categories"); press("Edit Meals"); toggle("Active", false); press("Review category");
    expect(find("ConfirmDialog", "Save category?").props.message).toContain("all products in this category stop accepting");
    confirm("Save category?"); await settle(); expect(scenario.write).toHaveBeenCalledWith("updateCategory", category.id, expect.objectContaining({ active: false }));
    press("Products"); press(`Edit ${product.name}`); toggle("Available for orders", false); press("Review product"); confirm("Save product?"); await settle();
    expect(scenario.write).toHaveBeenLastCalledWith("updateProduct", product.id, expect.objectContaining({ available: false })); expect(orderSnapshot.name).toBe(product.name);
  });
  it("requires discard confirmation and uses the workspace guard for menu tabs", () => {
    press(`Edit ${product.name}`); field("Product name", "Unsaved meal"); press("Cancel");
    expect(find("ConfirmDialog", "Discard catalog changes?").props.message).toContain("without saving");
    (find("ConfirmDialog", "Discard catalog changes?").props.onCancel as () => void)(); expect(find("FormField", "Product name").props.value).toBe("Unsaved meal");
    expect(scenario.dirty).toContain(true); press("Categories"); expect(scenario.navigate).toHaveBeenCalled(); expect(scenario.write).not.toHaveBeenCalled();
  });
  it("preserves edits on background refresh and requires explicit current-product loading", () => {
    press(`Edit ${product.name}`); field("Product name", "Draft meal"); scenario.products = [{ ...product, price: 2600 }];
    expect(text()).toContain("server product changed"); expect(find("FormField", "Product name").props.value).toBe("Draft meal");
    expect(find("Action", "Review product").props.disabled).toBe(true); press("Load current product");
    expect(find("FormField", "Price (whole currency amount)").props.value).toBe("2600"); expect(text()).not.toContain("server product changed"); expect(scenario.write).not.toHaveBeenCalled();
  });
  it("does not repeat an uncertain product creation and refreshes on reconciliation", async () => {
    scenario.write.mockRejectedValueOnce(new ApiNetworkError()); press("Create product"); field("Product name", "New meal"); field("Price (whole currency amount)", "1000");
    press("Review product"); confirm("Save product?"); await settle(); expect(text()).toContain("save is unconfirmed");
    expect(find("Action", "Review product").props.disabled).toBe(true); press("Review product"); expect(scenario.write).toHaveBeenCalledOnce();
    press("Close draft and check menu"); expect(scenario.reload).toHaveBeenCalledOnce();
  });
  it("preserves variant descriptions, price and availability through a reviewed update", async () => {
    press(`View ${product.name}`); press("Edit variant Large"); field("Variant description (optional)", "မိသားစုအတွက်\nFor sharing"); toggle("Variant available", false);
    press("Review variant"); expect(find("ConfirmDialog", "Save variant?").props.message).toContain("မိသားစုအတွက်"); confirm("Save variant?"); await settle();
    expect(scenario.write).toHaveBeenCalledExactlyOnceWith("updateVariant", product.id, "variant-a", expect.objectContaining({ description: "မိသားစုအတွက်\nFor sharing", price: 3500, available: false }));
  });
  it("validates required rules, then reviews changed minimums and option availability", async () => {
    press("Modifiers"); press(`Edit ${group.name} rules`); toggle("Selection required", true); press("Review group");
    expect(text()).toContain("Required groups need a minimum"); field("Minimum selections", "1"); press("Review group");
    expect(find("ConfirmDialog", "Save group?").props.message).toContain("Required · Choose 1–1"); confirm("Save group?"); await settle();
    expect(scenario.write).toHaveBeenCalledWith("updateModifierGroup", group.id, expect.objectContaining({ required: true, minSelections: 1, maxSelections: 1 }));
    press("Edit option Mild"); toggle("Option available", false); press("Review option"); expect(find("ConfirmDialog", "Save option?").props.message).toContain("required-group minimums");
    confirm("Save option?"); await settle(); expect(scenario.write).toHaveBeenLastCalledWith("updateModifierOption", group.id, "option-a", expect.objectContaining({ available: false, additionalPrice: 0 }));
  });
  it("reviews linked required groups and preserves attach/detach endpoints", async () => {
    scenario.groups = [{ ...group, required: true, minSelections: 1 }]; press(`View ${product.name}`); press(`Attach ${group.name}`);
    expect(scenario.write).not.toHaveBeenCalled(); expect(find("ConfirmDialog", "Attach modifier group?").props.message).toContain("Required");
    confirm("Attach modifier group?"); await settle(); expect(scenario.write).toHaveBeenCalledWith("linkProductModifierGroup", product.id, group.id);
    scenario.linked = scenario.groups; press(`Detach ${group.name}`); confirm("Detach modifier group?"); await settle();
    expect(scenario.write).toHaveBeenLastCalledWith("unlinkProductModifierGroup", product.id, group.id); expect(orderSnapshot.option).toBe("Mild");
  });
});
