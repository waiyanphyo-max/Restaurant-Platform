import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { RestaurantBrandingResponse, UpdateRestaurantBrandingRequest } from "@restaurant-platform/shared-types";

type Frame = { values: unknown[]; effects: { dependencies: unknown[]; cleanup?: () => void }[] };
const scenario = vi.hoisted(() => ({
  frames: new Map<string, Frame>(), active: "", cursor: 0,
  role: "OWNER", status: "ready", scopeKey: "tenant-a:staging:owner", userId: "owner",
  branding: null as RestaurantBrandingResponse | null,
  error: null as "offline" | "error" | "denied" | null, loading: false, refreshing: false,
  save: vi.fn(), refresh: vi.fn(), signOut: vi.fn(), announce: vi.fn(), profileSave: vi.fn(), settingsSave: vi.fn(), logoUpload: vi.fn(), upload: vi.fn(), reload: vi.fn(),
  queryCalls: [] as string[],
  profile: { id: "11111111-1111-4111-8111-111111111111", name: "Restaurant A", township: "Township", city: "City", active: true, slug: "restaurant-a", logoUrl: "javascript:untrusted-profile-logo" },
  settings: { currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 0, acceptsOrders: true, allowQrOrder: true, allowDelivery: true, allowTakeaway: true }
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!;
    const position = scenario.cursor++;
    if (!(position in frame.values)) frame.values[position] = typeof initial === "function" ? initial() : initial;
    return [frame.values[position], (value: unknown) => { frame.values[position] = typeof value === "function" ? value(frame.values[position]) : value; }];
  },
  useRef(initial: unknown) {
    const frame = scenario.frames.get(scenario.active)!;
    const position = scenario.cursor++;
    if (!(position in frame.values)) frame.values[position] = { current: initial };
    return frame.values[position];
  },
  useEffect(effect: () => (() => void) | undefined, dependencies: unknown[]) {
    const frame = scenario.frames.get(scenario.active)!;
    const position = scenario.cursor++;
    const previous = frame.effects[position];
    if (!previous || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
      previous?.cleanup?.(); frame.effects[position] = { dependencies, cleanup: effect() };
    }
  }
}));
vi.mock("react-native", () => ({ Image: "Image", View: "View", TextInput: "TextInput", AccessibilityInfo: { announceForAccessibility: scenario.announce } }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({
  state: { status: scenario.status, userId: scenario.userId, membership: { role: scenario.role, restaurantId: "11111111-1111-4111-8111-111111111111", active: true } },
  signOut: scenario.signOut, assertWorkspaceAccess: vi.fn()
}) }));
vi.mock("../../branding/RuntimeBrandingProvider", () => ({ useRuntimeBranding: () => ({
  branding: scenario.branding, scopeKey: scenario.scopeKey, loading: scenario.loading, refreshing: scenario.refreshing, error: scenario.error,
  save: scenario.save, refresh: scenario.refresh, logoUrl: "https://images.example.test/safe-logo.png", displayName: "Safe Restaurant A"
}) }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: "11111111-1111-4111-8111-111111111111", environment: "staging", apiBaseUrl: "https://api.example.test",
  branding: { displayName: "Embedded A", primaryColor: "#234D3C", secondaryColor: "#E8EEDB", backgroundColor: "#FFFFFF" } }) }));
vi.mock("../../components/ui", async () => {
  const { resolveThemeTokens } = await import("@restaurant-platform/ui-tokens");
  return {
    Action: "Action", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", FormField: "FormField", StateView: "StateView", Status: "Status", ThemeProvider: "ThemeProvider", Page: "Page",
    useUiTheme: () => resolveThemeTokens(scenario.branding?.palette, { primaryColor: "#234D3C", secondaryColor: "#E8EEDB", backgroundColor: "#FFFFFF" })
  };
});
vi.mock("../../api", () => ({ getOperationsApi: () => ({ updateRestaurantProfile: scenario.profileSave, updateSettings: scenario.settingsSave, uploadRestaurantLogo: scenario.logoUpload }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_load: unknown, key: string) => {
  scenario.queryCalls.push(key);
  return { state: { status: "ready", data: key === "managed-profile" ? scenario.profile : scenario.settings }, reload: scenario.reload };
} }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("../../components/useImageUpload", () => ({ useImageUpload: () => scenario.upload }));
vi.mock("./controls", () => ({ FormStatus: "FormStatus", Toggle: "Toggle" }));

import { RuntimePaletteEditor } from "./RuntimePaletteEditor";
import { SettingsScreen } from "./SettingsScreen";

type Element = ReactElement<Record<string, unknown>>;
type Component = (props: Record<string, unknown>) => ReactNode;
const originalPalette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const proposed = { primaryColor: "#102030", secondaryColor: "#334455", backgroundColor: "#050505" };
function render(component: Component, props: Record<string, unknown> = {}, key = component.name): ReactNode {
  scenario.active = key; scenario.cursor = 0;
  if (!scenario.frames.has(key)) scenario.frames.set(key, { values: [], effects: [] });
  return component(props);
}
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") return expand(render(node.type as Component, node.props, `${node.type.name}:${node.key ?? ""}`));
  if (node.type === "QueryResult") return expand((node.props.children as (record: unknown) => ReactNode)((node.props.state as { data: unknown }).data));
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function find(node: ReactNode, type: string, label: string) {
  const result = elements(node).find(value => value.type === type && [value.props.title, value.props.label, value.props.accessibilityLabel].includes(label));
  if (!result) throw new Error(`Missing ${type}: ${label}`);
  return result;
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (!isValidElement<Record<string, unknown>>(node)) return typeof node === "string" || typeof node === "number" ? String(node) : "";
  return [node.props.title, node.props.label, node.props.message, text(node.props.children as ReactNode)].filter(Boolean).join(" ");
}
const editor = () => expand(render(RuntimePaletteEditor));
const settings = () => expand(render(SettingsScreen));
function press(node: ReactNode, label: string) { (find(node, "Action", label).props.onPress as () => void)(); }
function enter(node: ReactNode, label: string, value: string) { (find(node, "FormField", label).props.onChangeText as (value: string) => void)(value); }
function edit() { press(editor(), "Edit runtime palette"); }
function proposal() {
  edit(); enter(editor(), "Primary color", proposed.primaryColor); enter(editor(), "Secondary color", proposed.secondaryColor); enter(editor(), "Background color", proposed.backgroundColor);
}
function confirm() { (find(editor(), "ConfirmDialog", "Save runtime palette?").props.onConfirm as () => void)(); }
function unmount() { for (const frame of scenario.frames.values()) for (const effect of frame.effects) effect?.cleanup?.(); }
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks(); scenario.frames.clear(); scenario.queryCalls = [];
  scenario.role = "OWNER"; scenario.userId = "owner"; scenario.status = "ready"; scenario.scopeKey = "tenant-a:staging:owner";
  scenario.loading = false; scenario.refreshing = false; scenario.error = null;
  scenario.branding = { restaurantId: "11111111-1111-4111-8111-111111111111", displayName: "Restaurant A", logoUrl: null, revision: 4, palette: { ...originalPalette } };
  scenario.save.mockImplementation(async (request: UpdateRestaurantBrandingRequest) => {
    scenario.branding = { ...scenario.branding!, palette: request.palette, revision: request.expectedRevision + 1 }; return scenario.branding;
  });
  scenario.refresh.mockResolvedValue(true); scenario.signOut.mockResolvedValue(undefined);
  scenario.profileSave.mockResolvedValue(scenario.profile); scenario.settingsSave.mockResolvedValue(scenario.settings);
  scenario.logoUpload.mockResolvedValue({ logoUrl: "https://images.example.test/new.png" });
  scenario.upload.mockImplementation(async (upload: (api: unknown, file: unknown) => Promise<unknown>) => { await upload({ uploadRestaurantLogo: scenario.logoUpload }, new FormData()); return true; });
});

describe("Owner and Manager runtime palette editing", () => {
  it.each(["OWNER", "MANAGER"])("lets %s preview, review and save exactly the three colors and revision", async role => {
    scenario.role = role; proposal();
    press(editor(), "Preview palette");
    const preview = elements(editor()).find(element => element.type === "ThemeProvider")!;
    expect(preview.props.branding).toEqual(proposed);
    expect(text(editor())).toContain("Unsaved preview");
    expect(scenario.branding?.palette).toEqual(originalPalette); expect(scenario.save).not.toHaveBeenCalled();
    press(editor(), "Review palette changes");
    const review = find(editor(), "ConfirmDialog", "Save runtime palette?");
    expect(review.props.message).toContain("revision 4"); expect(review.props.message).toContain("#A51D22 → #102030");
    expect(review.props.returnFocusRef).toBeDefined();
    confirm(); await settle();
    expect(scenario.save).toHaveBeenCalledExactlyOnceWith({ expectedRevision: 4, palette: proposed });
    expect(text(editor())).toContain("Palette saved"); expect(text(editor())).toContain("revision:  5");
    expect(scenario.announce).toHaveBeenCalledWith("Palette saved.");
  });

  it.each(["STAFF", "DELIVERY_DRIVER"])("withholds editor and settings/profile requests from %s", role => {
    scenario.role = role;
    expect(text(editor())).toContain("Only the restaurant Owner or Manager");
    const denied = settings(); expect(text(denied)).toContain("Only the restaurant Owner or Manager");
    expect(elements(denied).some(element => element.type === "FormField")).toBe(false);
    expect(scenario.queryCalls).toEqual([]); expect(scenario.save).not.toHaveBeenCalled();
  });

  it("truthfully identifies missing revision-zero palette and uses embedded colors only as an unsaved starting point", () => {
    scenario.branding = { ...scenario.branding!, palette: null, revision: 0 };
    expect(text(editor())).toContain("No runtime palette is saved"); expect(text(editor())).toContain("have not been saved");
    edit(); expect(find(editor(), "FormField", "Primary color").props.value).toBe("#234D3C");
    expect(text(editor())).toContain("its embedded fallback.");
    press(editor(), "Review palette changes");
    expect(find(editor(), "ConfirmDialog", "Save runtime palette?").props.message).toContain("revision 0");
    expect(scenario.save).not.toHaveBeenCalled();
  });

  it.each(["red", "#FFF", "#12GG00", " #112233", "#112233\n"])("rejects invalid input %j with field error, focus and announcement", invalid => {
    edit(); enter(editor(), "Primary color", invalid);
    const focus = vi.fn(); (find(editor(), "FormField", "Primary color").props.inputRef as { current: unknown }).current = { focus };
    press(editor(), "Review palette changes");
    expect(find(editor(), "FormField", "Primary color").props.error).toContain("six-digit");
    expect(focus).toHaveBeenCalledOnce(); expect(scenario.announce).toHaveBeenCalledWith(expect.stringContaining("Primary color is invalid"));
    expect(elements(editor()).some(element => element.type === "ConfirmDialog")).toBe(false); expect(scenario.save).not.toHaveBeenCalled();
  });

  it("cancels the review or complete edit without mutation and keeps persisted colors", () => {
    proposal(); press(editor(), "Review palette changes");
    (find(editor(), "ConfirmDialog", "Save runtime palette?").props.onCancel as () => void)();
    expect(find(editor(), "FormField", "Primary color").props.value).toBe(proposed.primaryColor);
    press(editor(), "Cancel palette edits");
    expect(text(editor())).not.toContain("Unsaved palette edits"); expect(scenario.branding?.palette).toEqual(originalPalette);
    expect(scenario.save).not.toHaveBeenCalled();
  });

  it("retains draft edits but invalidates review when a foreground refresh discovers a newer palette", () => {
    proposal(); press(editor(), "Review palette changes");
    scenario.branding = { ...scenario.branding!, palette: { ...originalPalette, primaryColor: "#445566" }, revision: 5 };
    expect(find(editor(), "FormField", "Primary color").props.value).toBe(proposed.primaryColor);
    expect(find(editor(), "ConfirmDialog", "Save runtime palette?").props.confirmDisabled).toBe(true);
    confirm(); expect(scenario.save).not.toHaveBeenCalled(); expect(text(editor())).toContain("Another change was saved");
  });

  it("requires explicit latest-palette load and a new review after stale409; never retries the write", async () => {
    scenario.save.mockImplementationOnce(async () => { scenario.branding = { ...scenario.branding!, palette: originalPalette, revision: 5 }; throw new ApiHttpError(409, "RESTAURANT_BRANDING_STALE"); });
    proposal(); press(editor(), "Review palette changes"); confirm(); await settle();
    expect(scenario.save).toHaveBeenCalledOnce(); expect(text(editor())).toContain("Another change was saved");
    expect(find(editor(), "Action", "Review palette changes").props.disabled).toBe(true);
    press(editor(), "Load latest palette"); await settle();
    expect(scenario.refresh).toHaveBeenCalledOnce(); expect(text(editor())).toContain("Edit and review again");
    expect(scenario.save).toHaveBeenCalledOnce(); edit(); press(editor(), "Review palette changes");
    expect(find(editor(), "ConfirmDialog", "Save runtime palette?").props.message).toContain("revision 5");
  });

  it.each([new ApiNetworkError(), new ApiTimeoutError(), new ApiHttpError(500, "UNKNOWN")])("requires a successful explicit refresh after an uncertain failed write", async failure => {
    scenario.save.mockRejectedValueOnce(failure); scenario.refresh.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    proposal(); press(editor(), "Review palette changes"); confirm(); await settle();
    expect(text(editor())).toContain("save could not be confirmed"); expect(scenario.branding?.palette).toEqual(originalPalette);
    press(editor(), "Load latest palette"); await settle();
    expect(find(editor(), "Action", "Review palette changes").props.disabled).toBe(true);
    press(editor(), "Load latest palette"); await settle();
    expect(scenario.save).toHaveBeenCalledOnce(); expect(text(editor())).toContain("Edit and review again");
  });

  it.each([new ApiNetworkError(), new ApiHttpError(409, "RESTAURANT_BRANDING_STALE")])("does not bypass required refresh by cancelling and reopening after a failed save", async failure => {
    scenario.save.mockRejectedValueOnce(failure);
    proposal(); press(editor(), "Review palette changes"); confirm(); await settle();
    press(editor(), "Cancel palette edits");
    expect(find(editor(), "Action", "Edit runtime palette").props.disabled).toBe(true);
    press(editor(), "Edit runtime palette");
    expect(elements(editor()).some(element => element.type === "FormField")).toBe(false);
    press(editor(), "Load latest palette"); await settle();
    expect(find(editor(), "Action", "Edit runtime palette").props.disabled).toBe(false);
    expect(scenario.save).toHaveBeenCalledOnce();
  });

  it("associates backend validation errors with their color field without exposing arbitrary server text", async () => {
    scenario.save.mockRejectedValueOnce(new ApiHttpError(400, "VALIDATION_FAILED", [{ field: "palette.secondaryColor", message: "private server detail" }]));
    proposal(); press(editor(), "Review palette changes"); confirm(); await settle();
    expect(find(editor(), "FormField", "Secondary color").props.error).toContain("server rejected");
    expect(text(editor())).not.toContain("private server detail"); expect(scenario.save).toHaveBeenCalledOnce();
  });

  it("uses session-expiry behavior for401 and a forbidden state for403 without success", async () => {
    scenario.save.mockRejectedValueOnce(new ApiHttpError(401, "EXPIRED"));
    proposal(); press(editor(), "Review palette changes"); confirm(); await settle();
    expect(scenario.signOut).toHaveBeenCalledOnce(); expect(text(editor())).not.toContain("Palette saved");
    scenario.frames.clear(); scenario.save.mockRejectedValueOnce(new ApiHttpError(403, "DENIED"));
    proposal(); press(editor(), "Review palette changes"); confirm(); await settle();
    expect(text(editor())).toContain("Palette change not permitted"); expect(text(editor())).not.toContain("Saved successfully");
  });

  it("prevents duplicate writes from rapid confirmation taps and suppresses late success after sign-out/unmount", async () => {
    let finish!: (value: RestaurantBrandingResponse) => void;
    scenario.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    proposal(); press(editor(), "Review palette changes");
    const action = find(editor(), "ConfirmDialog", "Save runtime palette?").props.onConfirm as () => void;
    action(); action(); expect(scenario.save).toHaveBeenCalledOnce();
    unmount(); scenario.status = "signed_out"; finish({ ...scenario.branding!, revision: 5, palette: proposed }); await settle();
    expect(scenario.announce).not.toHaveBeenCalledWith("Palette saved."); expect(text(editor())).not.toContain("Palette saved");
  });

  it("keeps the last valid palette and bounded retry guidance on refresh failure", () => {
    scenario.error = "offline";
    expect(text(editor())).toContain("last validated branding is still shown"); expect(text(editor())).toContain(originalPalette.primaryColor);
    const retry = find(editor(), "StateView", "Branding request failed").props.onRetry as () => void;
    retry(); expect(scenario.refresh).toHaveBeenCalledOnce(); expect(scenario.save).not.toHaveBeenCalled();
  });
});

describe("profile, ordering and Owner-only logo compatibility", () => {
  it.each(["OWNER", "MANAGER"])("keeps %s profile and ordering forms while omitting logo mutation fields", async role => {
    scenario.role = role; const page = settings();
    expect(text(page)).toContain("Restaurant profile"); expect(text(page)).toContain("Ordering settings");
    expect(text(page)).toContain("separately reviewed release");
    expect(elements(page).find(element => element.type === "Image")?.props.source).toEqual({ uri: "https://images.example.test/safe-logo.png" });
    expect(text(page)).not.toContain("javascript:");
    press(page, "Save profile"); await settle();
    expect(scenario.profileSave).toHaveBeenCalledOnce(); expect(scenario.profileSave.mock.calls[0][0]).not.toHaveProperty("logoUrl");
    expect(scenario.refresh).toHaveBeenCalledOnce(); expect(scenario.reload).toHaveBeenCalledOnce();
    if (role === "MANAGER") {
      expect(text(page)).toContain("current logo is read-only"); expect(text(page)).not.toContain("Choose and upload logo");
    } else expect(text(page)).toContain("Choose and upload logo");
  });

  it("refreshes branding after Spring-mediated Owner logo upload and retains the safe image on failure", async () => {
    press(settings(), "Choose and upload logo"); await settle();
    expect(scenario.logoUpload).toHaveBeenCalledOnce(); expect(scenario.refresh).toHaveBeenCalledOnce();
    scenario.upload.mockRejectedValueOnce(new ApiNetworkError());
    press(settings(), "Choose and upload logo"); await settle();
    expect(scenario.refresh).toHaveBeenCalledOnce();
    expect(elements(settings()).find(element => element.type === "Image")?.props.source).toEqual({ uri: "https://images.example.test/safe-logo.png" });
  });

  it("continues reviewing and saving the existing backend-supported ordering flags", async () => {
    press(settings(), "Review settings update");
    const dialog = find(settings(), "ConfirmDialog", "Update restaurant settings?");
    (dialog.props.onConfirm as () => void)(); await settle();
    expect(scenario.settingsSave).toHaveBeenCalledExactlyOnceWith(scenario.settings);
    expect(scenario.save).not.toHaveBeenCalled();
  });
});
