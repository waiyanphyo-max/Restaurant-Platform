import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError } from "@restaurant-platform/api-client";
import type { FeaturedProductResponse, ProductManagementResponse, UpdateFeaturedProductRequest } from "@restaurant-platform/shared-types";

type Frame = { values: unknown[]; effects: { dependencies: unknown[]; cleanup?: () => void }[] };
const scenario = vi.hoisted(() => ({ frames: new Map<string, Frame>(), active: "", cursor: 0,
  role: "OWNER", userId: "owner", status: "ready", queryStatus: "ready", saved: null as FeaturedProductResponse | null,
  save: vi.fn(), read: vi.fn(), reload: vi.fn(), signOut: vi.fn(), announce: vi.fn(), choose: vi.fn(), upload: vi.fn(), imageSave: vi.fn(), imageRead: vi.fn(), onSaved: vi.fn(), queryCalls: [] as string[]
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const position = scenario.cursor++;
    if (!(position in frame.values)) frame.values[position] = typeof initial === "function" ? initial() : initial;
    return [frame.values[position], (value: unknown) => { frame.values[position] = typeof value === "function" ? value(frame.values[position]) : value; }];
  },
  useRef(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!; const position = scenario.cursor++;
    if (!(position in frame.values)) frame.values[position] = { current: initial }; return frame.values[position];
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!; const position = scenario.cursor++; const previous = frame.effects[position];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
      previous?.cleanup?.(); frame.effects[position] = { dependencies, cleanup: effect() };
    }
  }
}));
vi.mock("react-native", () => ({ Image: "Image", View: "View", AccessibilityInfo: { announceForAccessibility: scenario.announce } }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: scenario.status, userId: scenario.userId,
  membership: { role: scenario.role, restaurantId: "11111111-1111-4111-8111-111111111111" } }, signOut: scenario.signOut, assertWorkspaceAccess: vi.fn() }) }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", StateView: "StateView", Status: "Status" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../../api", () => ({ getOperationsApi: () => ({ updateFeaturedProduct: scenario.save, getFeaturedProduct: scenario.read }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => {
  scenario.queryCalls.push(key); return { state: scenario.queryStatus === "ready" ? { status: "ready", data: scenario.saved } : { status: scenario.queryStatus }, reload: scenario.reload };
} }));
vi.mock("../../components/imageUpload", () => ({ pickImage: scenario.choose }));
vi.mock("../../components/useImageUpload", () => ({ useImageUpload: () => scenario.upload }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: vi.fn() }));

import { FeaturedProductPanel } from "./FeaturedProductPanel";
import { CatalogImageControl, CatalogPicture, catalogImageUrl } from "./CatalogImageControl";
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
  if (node.type === "QueryResult") {
    const state = node.props.state as { status: string; data: unknown };
    return state.status === "ready" ? expand((node.props.children as (value: unknown) => ReactNode)(state.data)) : `query-${state.status}`;
  }
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node) || node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(node: ReactNode, type: string, label: string) {
  const item = elements(node).find(value => value.type === type && [value.props.title, value.props.label, value.props.accessibilityLabel].includes(label));
  if (!item) throw new Error(`Missing ${type}: ${label}`); return item;
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (!isValidElement<Record<string, unknown>>(node)) return typeof node === "string" || typeof node === "number" ? String(node) : "";
  return [node.props.title, node.props.message, text(node.props.children as ReactNode)].filter(Boolean).join(" ");
}
function press(node: ReactNode, label: string) { (find(node, "Action", label).props.onPress as () => void)(); }
function unmount() { for (const frame of scenario.frames.values()) for (const effect of frame.effects) effect?.cleanup?.(); }
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const restaurantId = "11111111-1111-4111-8111-111111111111";
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";
const categoryId = "44444444-4444-4444-8444-444444444444";
const product = (id: string, name: string): ProductManagementResponse => ({ id, categoryId, name, description: null, imageUrl: null, price: 1200, available: true, trackStock: false, stockQuantity: null,
  createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-20T00:00:00Z" });
const products = [product(firstId, "Rice bowl"), product(secondId, "Soup")];
const categories = [{ id: categoryId, name: "Meals", displayOrder: 0, active: true }];
let catalog = { products, categories };
const panel = () => expand(render(FeaturedProductPanel as Component, catalog));
function proposal(name = "Soup") { press(panel(), "Edit Featured selection"); press(panel(), `Feature ${name}`); press(panel(), "Review Featured change"); }
function confirm() { (find(panel(), "ConfirmDialog", "Save Featured selection?").props.onConfirm as () => void)(); }
const oldUrl = "https://images.example.test/previous.png";
let imageProps: Record<string, unknown>;
const image = () => expand(render(CatalogImageControl as Component, imageProps));

beforeEach(() => {
  vi.clearAllMocks(); scenario.frames.clear(); scenario.queryCalls = [];
  scenario.role = "OWNER"; scenario.userId = "owner"; scenario.status = "ready"; scenario.queryStatus = "ready";
  scenario.saved = { restaurantId, productId: firstId, status: "AVAILABLE", revision: 1 };
  scenario.read.mockImplementation(async () => scenario.saved);
  scenario.save.mockImplementation(async (request: UpdateFeaturedProductRequest) => ({ restaurantId, productId: request.productId, status: request.productId ? "AVAILABLE" : "NONE", revision: request.expectedRevision + 1 }));
  catalog = { products: products.map(value => ({ ...value })), categories: categories.map(value => ({ ...value })) };
  imageProps = { id: firstId, name: "Rice bowl", publishedUrl: oldUrl, upload: scenario.imageSave, check: scenario.imageRead, onSaved: scenario.onSaved };
  scenario.choose.mockResolvedValue({ uri: "file:///device/preview.png", mimeType: "image/png", fileSize: 1024 });
  scenario.imageSave.mockResolvedValue({ ...products[0], imageUrl: "https://images.example.test/new.png" });
  scenario.imageRead.mockResolvedValue({ ...products[0], imageUrl: oldUrl });
  scenario.upload.mockImplementation(async (upload: (api: unknown, form: FormData) => Promise<unknown>) => { await upload({}, new FormData()); return true; });
});

describe("Owner-curated Featured", () => {
  it("reviews, cancels and saves a replacement only after backend success", async () => {
    proposal(); const dialog = find(panel(), "ConfirmDialog", "Save Featured selection?");
    expect(dialog.props.message).toContain("Rice bowl → Soup"); expect(dialog.props.returnFocusRef).toBeDefined(); expect(scenario.save).not.toHaveBeenCalled();
    (dialog.props.onCancel as () => void)(); expect(scenario.save).not.toHaveBeenCalled();
    press(panel(), "Review Featured change"); confirm(); await settle();
    expect(scenario.save).toHaveBeenCalledExactlyOnceWith({ productId: secondId, expectedRevision: 1 });
    expect(text(panel())).toContain("Saved selection:  Soup"); expect(scenario.announce).toHaveBeenCalledWith("Featured selection saved.");
  });
  it("selects from empty and explicitly clears without inferring another product", async () => {
    scenario.saved = { restaurantId, productId: null, status: "NONE", revision: 0 };
    expect(text(panel())).toContain("No Featured product is selected"); proposal(); confirm(); await settle();
    press(panel(), "Edit Featured selection"); press(panel(), "Clear Featured selection"); press(panel(), "Review Featured change"); confirm(); await settle();
    expect(scenario.save).toHaveBeenLastCalledWith({ productId: null, expectedRevision: 1 }); expect(text(panel())).toContain("No Featured product is selected");
  });
  it.each(["MANAGER", "STAFF"])("shows read-only status to %s", role => {
    scenario.role = role; expect(text(panel())).toContain("Featured is read-only");
    expect(elements(panel()).some(value => value.props.title === "Edit Featured selection")).toBe(false); expect(scenario.save).not.toHaveBeenCalled();
  });
  it.each(["DELIVERY_DRIVER", "UNKNOWN"])("denies %s without requesting editorial records", role => {
    scenario.role = role; expect(text(panel())).toContain("cannot access Featured"); expect(scenario.queryCalls).toEqual([]);
  });
  it.each(["loading", "offline", "denied", "error"])("preserves %s read state", status => { scenario.queryStatus = status; expect(text(panel())).toContain(`query-${status}`); });
  it("keeps unavailable/removed selection truthful and offers no unavailable choice", () => {
    scenario.saved = { restaurantId, productId: firstId, status: "UNAVAILABLE", revision: 1 }; catalog.products[0].available = false;
    expect(text(panel())).toContain("not advertised as an orderable Featured"); press(panel(), "Edit Featured selection");
    expect(elements(panel()).some(value => value.props.title === "Feature Rice bowl")).toBe(false);
    expect(text(panel())).toContain("Saved selection:  Rice bowl");
  });
  it("shows empty eligibility and validates a formerly selected unavailable product", () => {
    catalog.categories[0].active = false; press(panel(), "Edit Featured selection"); press(panel(), "Review Featured change");
    expect(text(panel())).toContain("No eligible products"); expect(text(panel())).toContain("Choose an available product"); expect(scenario.save).not.toHaveBeenCalled();
  });
  it("refreshes editorial availability after a catalog update and accepts newer same-revision status", async () => {
    panel(); catalog.products = catalog.products.map(value => ({ ...value })); panel(); expect(scenario.reload).toHaveBeenCalledOnce();
    proposal(); confirm(); await settle();
    expect(text(panel())).toContain("Currently available as");
    scenario.saved = { restaurantId, productId: secondId, status: "UNAVAILABLE", revision: 2 };
    expect(text(panel())).toContain("not advertised as an orderable Featured");
    expect(text(panel())).not.toContain("Currently available as");
  });
  it("blocks stale review, then loads latest and requires a new review", async () => {
    proposal(); scenario.saved = { restaurantId, productId: null, status: "NONE", revision: 2 };
    expect(find(panel(), "ConfirmDialog", "Save Featured selection?").props.confirmDisabled).toBe(true); confirm(); expect(scenario.save).not.toHaveBeenCalled();
    press(panel(), "Load latest Featured selection"); await settle(); proposal("Rice bowl"); confirm(); await settle();
    expect(scenario.save).toHaveBeenCalledExactlyOnceWith({ productId: firstId, expectedRevision: 2 });
  });
  it.each([new ApiNetworkError(), new ApiHttpError(409, "FEATURED_PRODUCT_STALE")])("requires successful refresh after uncertain/conflicting save", async failure => {
    scenario.save.mockRejectedValueOnce(failure); proposal(); confirm(); await settle();
    press(panel(), "Cancel Featured edits"); expect(find(panel(), "Action", "Edit Featured selection").props.disabled).toBe(true);
    press(panel(), "Edit Featured selection"); expect(scenario.save).toHaveBeenCalledOnce();
    scenario.read.mockRejectedValueOnce(new ApiNetworkError()); press(panel(), "Load latest Featured selection"); await settle();
    expect(find(panel(), "Action", "Edit Featured selection").props.disabled).toBe(true);
    press(panel(), "Load latest Featured selection"); await settle(); expect(find(panel(), "Action", "Edit Featured selection").props.disabled).toBe(false);
  });
  it("shows forbidden save without success", async () => {
    scenario.save.mockRejectedValue(new ApiHttpError(403, "FORBIDDEN")); proposal(); confirm(); await settle(); expect(text(panel())).toContain("Featured change not permitted"); expect(scenario.announce).not.toHaveBeenCalled();
  });
  it("prevents duplicate submissions and ignores results after unmount", async () => {
    let complete!: (value: FeaturedProductResponse) => void; scenario.save.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    proposal(); const callback = find(panel(), "ConfirmDialog", "Save Featured selection?").props.onConfirm as () => void;
    callback(); callback(); expect(scenario.save).toHaveBeenCalledOnce(); expect(text(panel())).not.toContain("Featured selection saved:");
    unmount(); complete({ restaurantId, productId: secondId, status: "AVAILABLE", revision: 2 }); await settle(); expect(scenario.announce).not.toHaveBeenCalled();
  });
});

describe("Catalog image publication states", () => {
  it.each(["http://media.example.test/meal.png", "file:///private/meal.png", "javascript:alert(1)", "https://user:password@media.example.test/meal.png", "https://media.example.test/meal.png#qrToken=private", "invalid"])("withholds unsafe published image URL %s", url => {
    expect(catalogImageUrl(url)).toBeNull();
    const picture = expand(render(CatalogPicture as Component, { url, name: "Rice bowl" }, `picture:${url}`));
    expect(text(picture)).toContain("Image unavailable"); expect(elements(picture).some(value => value.type === "Image")).toBe(false);
  });
  it("keeps local preview separate, allows discard and uploads once after explicit action", async () => {
    press(image(), "Choose Rice bowl image"); await settle(); expect(text(image())).toContain("Local preview — not published");
    expect(find(image(), "Image", "Rice bowl local preview").props.source).toEqual({ uri: "file:///device/preview.png" });
    expect(scenario.imageSave).not.toHaveBeenCalled(); expect(text(image())).not.toContain("Image update confirmed");
    press(image(), "Discard Rice bowl preview"); expect(text(image())).not.toContain("Local preview");
    press(image(), "Choose Rice bowl image"); await settle();
    const callback = find(image(), "Action", "Upload reviewed Rice bowl image").props.onPress as () => void; callback(); callback(); await settle();
    expect(scenario.imageSave).toHaveBeenCalledOnce(); expect(scenario.upload.mock.calls[0][1]).toMatchObject({ uri: "file:///device/preview.png" });
    expect(text(image())).toContain("Image update confirmed by the server"); expect(scenario.onSaved).toHaveBeenCalledOnce();
    expect(elements(image()).find(value => value.type === "Image")?.props.source).toEqual({ uri: "https://images.example.test/new.png" });
  });
  it("preserves published image on failed upload and requires read after ambiguous failure", async () => {
    scenario.imageSave.mockRejectedValue(new ApiNetworkError()); press(image(), "Choose Rice bowl image"); await settle(); press(image(), "Upload reviewed Rice bowl image"); await settle();
    expect(text(image())).toContain("Upload failed or unconfirmed"); expect(text(image())).not.toContain("Image update confirmed"); expect(scenario.onSaved).not.toHaveBeenCalled();
    expect(elements(image()).find(value => value.type === "Image")?.props.source).toEqual({ uri: oldUrl });
    expect(find(image(), "Action", "Upload reviewed Rice bowl image").props.disabled).toBe(true);
    press(image(), "Check published Rice bowl image"); await settle(); expect(text(image())).toContain("Latest server image loaded");
    expect(text(image())).not.toContain("Local preview"); expect(scenario.imageSave).toHaveBeenCalledOnce();
  });
  it("rejects a success response for a different product without false publication", async () => {
    scenario.imageSave.mockResolvedValue({ ...products[1], imageUrl: "https://images.example.test/foreign.png" });
    press(image(), "Choose Rice bowl image"); await settle(); press(image(), "Upload reviewed Rice bowl image"); await settle();
    expect(text(image())).not.toContain("Image update confirmed"); expect(scenario.onSaved).not.toHaveBeenCalled();
  });
  it("removes the old confirmation marker when a later server image changes", async () => {
    press(image(), "Choose Rice bowl image"); await settle(); press(image(), "Upload reviewed Rice bowl image"); await settle();
    expect(text(image())).toContain("Image update confirmed");
    imageProps = { ...imageProps, publishedUrl: "https://images.example.test/later.png" };
    expect(text(image())).not.toContain("Image update confirmed");
    expect(elements(image()).find(value => value.type === "Image")?.props.source).toEqual({ uri: "https://images.example.test/later.png" });
  });
  it("shows pending upload and ignores completion after leaving the screen", async () => {
    let complete!: (value: ProductManagementResponse) => void; scenario.imageSave.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    press(image(), "Choose Rice bowl image"); await settle(); press(image(), "Upload reviewed Rice bowl image"); expect(text(image())).toContain("Upload pending");
    unmount(); complete({ ...products[0], imageUrl: "https://images.example.test/new.png" }); await settle(); expect(scenario.onSaved).not.toHaveBeenCalled();
  });
  it("renders failed image fallback with a screen reader image label", () => {
    let picture = expand(render(CatalogPicture as Component, { url: oldUrl, name: "Rice bowl" }, "picture"));
    (find(picture, "Image", "Rice bowl image").props.onError as () => void)();
    picture = expand(render(CatalogPicture as Component, { url: oldUrl, name: "Rice bowl" }, "picture")); expect(text(picture)).toContain("Image unavailable");
  });
  it.each(["STAFF", "DELIVERY_DRIVER"])("withholds image actions from %s", role => { scenario.role = role; expect(elements(image())).toEqual([]); expect(scenario.choose).not.toHaveBeenCalled(); });
});
