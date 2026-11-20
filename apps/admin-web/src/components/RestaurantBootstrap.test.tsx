import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBootstrapSnapshot } from "@restaurant-platform/shared-types";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, apply: vi.fn(), branding: vi.fn(), refresh: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = initial; return [hooks.values[index], (next: unknown) => { hooks.values[index] = next; }]; },
  useRef(initial: unknown) { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index]; },
  useEffect() {},
}));
vi.mock("@/app/(admin)/actions", () => ({ applyBootstrapStep: hooks.apply, initializeRestaurantBranding: hooks.branding, refreshBootstrap: hooks.refresh }));
vi.mock("./OwnerInvitation", () => ({ OwnerInvitation: "OwnerInvitation" }));
import { RestaurantBootstrap } from "./RestaurantBootstrap";
import { Button } from "./ui";

const id = "11111111-1111-4111-8111-111111111111";
function fixture(): PlatformBootstrapSnapshot { return { restaurantId: id, currency: "MMK", settings: { restaurantId: id, defaultDeliveryDriverUserId: null, currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 0, acceptsOrders: false, allowQrOrder: true, allowDelivery: false, allowTakeaway: true }, steps: [], categories: [], products: [], variants: [], modifierGroups: [], productModifierGroups: [], catalogComplete: false, mediaManifest: [], branding: { restaurantId: id, displayName: "A", logoUrl: null, palette: null, revision: 0 }, owners: [], ownerOnboardingConfirmed: false, photosStatus: "PENDING", nativeBuildStatus: "PENDING", handoffReady: false, handedOff: false, blockers: ["OWNER_ONBOARDING_PENDING"] }; }
type Element = ReactElement<Record<string, unknown>>;
let tree: ReactNode;
function render(snapshot = fixture()) { hooks.cursor = 0; tree = RestaurantBootstrap({ initial: snapshot }); }
function all(node: ReactNode = tree): Element[] { if (Array.isArray(node)) return node.flatMap(all); if (!isValidElement(node)) return []; const element = node as Element; return [element, ...all((element.props.children ?? null) as ReactNode)]; }
function text(node: ReactNode): string { if (Array.isArray(node)) return node.map(text).join(""); if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children); return typeof node === "string" || typeof node === "number" ? String(node) : ""; }
function button(label: string) { const found = all().find(item => item.type === Button && text(item.props.children as ReactNode).includes(label)); expect(found, label).toBeDefined(); return found!; }
async function click(label: string) { const item = button(label); expect(item.props.disabled).not.toBe(true); await (item.props.onClick as () => unknown)(); }
const NativeFormData = globalThis.FormData;
function formEvent(entries: Record<string, string>) { const data = new NativeFormData(); Object.entries(entries).forEach(([key, value]) => data.set(key, value)); return { preventDefault() {}, currentTarget: { data, elements: { namedItem: () => null }, querySelector: () => null } }; }
function prepareCatalog(entries = { operationKey: "category-1", name: "Dishes", displayOrder: "0", active: "on" }) { const form = all().filter(item => item.type === "form")[1]; (form.props.onSubmit as (event: unknown) => void)(formEvent(entries)); render(); }

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; vi.clearAllMocks();
  hooks.refresh.mockResolvedValue({ ok: true, data: fixture() });
  vi.stubGlobal("FormData", class { constructor(form: { data: FormData }) { return form.data; } });
  render();
});

describe("actual staged bootstrap interactions", () => {
  it("reviews before writing and gates rapid duplicate confirmations", async () => {
    prepareCatalog();
    expect(hooks.apply).not.toHaveBeenCalled();
    let resolve!: (value: unknown) => void;
    hooks.apply.mockReturnValue(new Promise(done => { resolve = done; }));
    const confirmation = button("Confirm reviewed step");
    const first = (confirmation.props.onClick as () => Promise<void>)();
    const second = (confirmation.props.onClick as () => Promise<void>)();
    expect(hooks.apply).toHaveBeenCalledExactlyOnceWith(id, { operationKey: "category-1", kind: "CATEGORY", category: { name: "Dishes", displayOrder: 0, active: true } });
    resolve({ ok: true, data: {} }); await Promise.all([first, second]);
    render(); expect(text(tree)).toContain("confirmed");
  });
  it("requires a trusted refresh and exact replay after an ambiguous write, even when the key already exists", async () => {
    prepareCatalog(); hooks.apply.mockResolvedValue({ ok: false, message: "Unconfirmed", fields: {}, uncertain: true });
    await click("Confirm reviewed step"); render();
    expect(button("Confirm reviewed step").props.disabled).toBe(true);
    const current = fixture(); current.steps.push({ operationKey: "category-1", kind: "CATEGORY", resourceId: id, result: { name: "Old proposal" }, actorId: id, completedAt: "2026-11-19T00:00:00Z" });
    hooks.refresh.mockResolvedValue({ ok: true, data: current });
    await click("Refresh and reconcile setup"); render();
    expect(text(tree)).toContain("receipt alone may belong to an earlier proposal");
    expect(text(tree)).toContain("Dishes");
    hooks.apply.mockResolvedValue({ ok: false, message: "Changed payload conflicts", fields: {}, uncertain: true });
    await click("Retry exact reviewed request"); render();
    expect(hooks.apply).toHaveBeenCalledTimes(2);
    expect(hooks.apply.mock.calls[1]).toEqual(hooks.apply.mock.calls[0]);
    expect(text(tree)).toContain("Changed payload conflicts");
    expect(text(tree)).not.toContain("Operation category-1 confirmed");
  });
  it("keeps a failed reviewed proposal available for correction without false success", async () => {
    prepareCatalog(); hooks.apply.mockResolvedValue({ ok: false, message: "Invalid catalog", fields: {}, uncertain: false });
    await click("Confirm reviewed step"); render();
    expect(text(tree)).toContain("Invalid catalog");
    await click("Cancel review"); render();
    expect(hooks.apply).toHaveBeenCalledOnce(); expect(text(tree)).not.toContain("confirmed.");
  });
  it("initializes runtime branding using the target UUID only after explicit review", async () => {
    const form = all().filter(item => item.type === "form")[0];
    (form.props.onSubmit as (event: unknown) => void)(formEvent({ primaryColor: "#a51d22", secondaryColor: "#c99632", backgroundColor: "#fff8f0" })); render();
    expect(hooks.branding).not.toHaveBeenCalled();
    hooks.branding.mockResolvedValue({ ok: true, data: {} });
    await click("Confirm reviewed step");
    expect(hooks.branding).toHaveBeenCalledExactlyOnceWith(id, { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" });
  });
  it("blocks handoff until the server checklist is ready and freezes in-use restaurants", () => {
    const kindSelect = all().find(item => item.type === "select" && item.props.name === "kind")!;
    (kindSelect.props.onChange as (event: unknown) => void)({ target: { value: "HANDOFF" } }); render();
    expect(button("Review confirm operations handoff").props.disabled).toBe(true);
    const current = fixture(); current.blockers.push("RESTAURANT_IN_USE"); hooks.values = []; render(current);
    expect(all().some(item => item.props.title === "Initial setup is closed")).toBe(true);
    expect(all().filter(item => item.type === "fieldset").every(item => item.props.disabled === true)).toBe(true);
    expect(hooks.apply).not.toHaveBeenCalled();
  });
  it("keeps a stale reviewed manifest unchanged until refresh, cancel and a new review", async () => {
    const kindSelect = all().find(item => item.type === "select" && item.props.name === "kind")!;
    (kindSelect.props.onChange as (event: unknown) => void)({ target: { value: "MEDIA_MANIFEST" } }); render();
    const prepareMedia = (operationKey: string) => {
      const form = all().filter(item => item.type === "form")[1];
      (form.props.onSubmit as (event: unknown) => void)(formEvent({ operationKey, originalFilename: "new.jpg", reviewStatus: "PENDING" })); render();
    };
    prepareMedia("media-reviewed");
    hooks.apply.mockResolvedValueOnce({ ok: false, message: "Manifest changed; refresh, cancel and rebuild", fields: {}, uncertain: true, rebuildRequired: true });
    await click("Confirm reviewed step"); render();
    const reviewed = hooks.apply.mock.calls[0][1];
    expect(reviewed).toMatchObject({ expectedMediaOperationKey: null, mediaManifest: [{ originalFilename: "new.jpg" }] });
    const current = fixture();
    current.steps = [{ operationKey: "media-other-tab", kind: "MEDIA_MANIFEST", resourceId: null, result: {}, actorId: id, completedAt: "2026-11-20T00:00:00Z" }];
    current.mediaManifest = [{ originalFilename: "other.jpg", restaurantId: id, productId: null, variantId: null, intendedAssociation: "PRODUCT_IMAGE", reviewStatus: "PENDING", originalContentHash: null, uploadStatus: "PENDING" }];
    hooks.refresh.mockResolvedValue({ ok: true, data: current });
    await click("Refresh and reconcile setup"); render();
    expect(button("Confirm reviewed step").props.disabled).toBe(true);
    expect(text(tree)).toContain("Cancel this old review");
    expect(reviewed.expectedMediaOperationKey).toBeNull(); expect(reviewed.mediaManifest).toHaveLength(1);
    await click("Cancel review"); render(); prepareMedia("media-rebuilt");
    hooks.apply.mockResolvedValueOnce({ ok: true, data: {} });
    await click("Confirm reviewed step");
    expect(hooks.apply.mock.calls[1][1]).toMatchObject({ expectedMediaOperationKey: "media-other-tab", mediaManifest: [{ originalFilename: "other.jpg" }, { originalFilename: "new.jpg" }] });
  });
});
