import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, mounted: false, provision: vi.fn(), reconcile: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = initial; return [hooks.values[index], (next: unknown) => { hooks.values[index] = next; }]; },
  useRef(initial: unknown) { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index]; },
  useEffect(effect: () => void) { if (!hooks.mounted) { hooks.mounted = true; effect(); } },
}));
vi.mock("@/app/(admin)/actions", () => ({ provisionRestaurant: hooks.provision, reconcileProvisioning: hooks.reconcile }));
import { ProvisioningForm } from "./ProvisioningForm";
import { Button } from "./ui";

const scope = { userId: "11111111-1111-4111-8111-111111111111", apiOrigin: "http://localhost:8080" };
const id = "22222222-2222-4222-8222-222222222222";
const draft = { name: "Restaurant A", slug: "restaurant-a", city: "Yangon", township: "Bahan", ownerEmail: "owner@example.test", ownerFullName: "Owner", timezone: "Asia/Yangon", currency: "MMK" };
const NativeFormData = globalThis.FormData;
let storage: Map<string, string>;
let tree: ReactNode;
type Element = ReactElement<Record<string, unknown>>;
function render() { hooks.cursor = 0; tree = ProvisioningForm({ recoveryScope: scope }); }
function all(node: ReactNode = tree): Element[] { if (Array.isArray(node)) return node.flatMap(all); if (!isValidElement(node)) return []; const element = node as Element; return [element, ...all((element.props.children ?? null) as ReactNode)]; }
function text(node: ReactNode): string { if (Array.isArray(node)) return node.map(text).join(""); if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children); return typeof node === "string" ? node : ""; }
function button(label: string) { return all().find(item => item.type === Button && text(item.props.children as ReactNode).includes(label))!; }
async function click(label: string) { const item = button(label); expect(item).toBeDefined(); expect(item.props.disabled).not.toBe(true); await (item.props.onClick as () => unknown)(); render(); }
function prepare(values = draft) { const data = new NativeFormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); const form = all().find(item => item.type === "form")!; (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {}, currentTarget: { data, elements: { namedItem: () => null } } }); render(); }
function remount() { hooks.values = []; hooks.mounted = false; render(); render(); }

beforeEach(() => {
  vi.clearAllMocks(); storage = new Map();
  vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
  vi.stubGlobal("FormData", class { constructor(form: { data: FormData }) { return form.data; } });
  remount();
});

describe("provisioning attempt interaction recovery", () => {
  it("persists uncertainty across reload, reconciles the exact slug, and resumes the returned restaurant without another invitation", async () => {
    prepare(); hooks.provision.mockResolvedValue({ ok: false, message: "Unconfirmed", fields: {}, uncertain: true });
    await click("Create restaurant"); expect(storage.size).toBe(1);
    remount(); prepare(); expect(button("Create restaurant").props.disabled).toBe(true);
    hooks.reconcile.mockResolvedValue({ ok: true, data: { id } });
    await click("Check exact slug in registry");
    expect(hooks.reconcile).toHaveBeenCalledExactlyOnceWith("restaurant-a");
    expect(storage.size).toBe(0); expect(hooks.provision).toHaveBeenCalledOnce();
    expect(all().some(item => item.props.href === `/restaurant-setup?id=${id}`)).toBe(true);
  });
  it("allows repairing a confirmed local validation rejection without leaving a phantom pending invitation", async () => {
    prepare(); hooks.provision.mockResolvedValue({ ok: false, message: "Invalid local input", fields: { currency: "Invalid" }, safeToEdit: true });
    await click("Create restaurant"); expect(storage.size).toBe(0);
    prepare({ ...draft, currency: "USD" }); expect(button("Create restaurant").props.disabled).not.toBe(true);
    hooks.provision.mockResolvedValue({ ok: true, data: { id, name: "Restaurant A", ownerInvitationStatus: "INVITED" } });
    await click("Create restaurant"); expect(hooks.provision).toHaveBeenCalledTimes(2); expect(storage.size).toBe(0);
  });
  it("requires a reviewed verified-UUID path after confirmed slug absence instead of inviting by email again", async () => {
    prepare(); hooks.provision.mockResolvedValue({ ok: false, message: "Provider uncertain", fields: {}, uncertain: true });
    await click("Create restaurant"); hooks.reconcile.mockResolvedValue({ ok: true, data: { id: null } });
    await click("Check exact slug in registry"); expect(storage.size).toBe(1);
    prepare({ ...draft, ownerUserId: id } as typeof draft);
    expect(button("Create restaurant").props.disabled).toBe(true);
    await click("Check exact slug in registry"); expect(storage.size).toBe(1);
    expect(button("Create restaurant").props.disabled).not.toBe(true); expect(hooks.provision).toHaveBeenCalledOnce();
  });
  it("keeps the uncertain marker until verified-UUID creation succeeds and blocks removing that UUID", async () => {
    prepare(); hooks.provision.mockResolvedValueOnce({ ok: false, message: "Unknown provider outcome", fields: {}, uncertain: true });
    await click("Create restaurant");
    await click("Edit information"); prepare({ ...draft, ownerUserId: id } as typeof draft);
    hooks.reconcile.mockResolvedValue({ ok: true, data: { id: null } });
    await click("Check exact slug in registry");
    expect(storage.size).toBe(1); expect(button("Create restaurant").props.disabled).not.toBe(true);
    await click("Edit information"); prepare({ ...draft, ownerUserId: "" } as typeof draft);
    const unsafe = button("Create restaurant"); expect(unsafe.props.disabled).toBe(true);
    await (unsafe.props.onClick as () => Promise<void>)(); expect(hooks.provision).toHaveBeenCalledOnce();
    remount(); prepare({ ...draft, ownerUserId: id } as typeof draft);
    expect(button("Create restaurant").props.disabled).toBe(true);
    await click("Check exact slug in registry");
    hooks.provision.mockResolvedValueOnce({ ok: true, data: { id, name: "Restaurant A", ownerInvitationStatus: "ACCEPTED" } });
    await click("Create restaurant");
    expect(hooks.provision.mock.calls[1][0]).toMatchObject({ ownerUserId: id, restaurant: { slug: draft.slug } });
    expect(storage.size).toBe(0);
  });
  it("does not erase the original uncertain invitation when a verified-UUID recovery is rejected locally", async () => {
    prepare(); hooks.provision.mockResolvedValueOnce({ ok: false, message: "Unknown provider outcome", fields: {}, uncertain: true });
    await click("Create restaurant"); await click("Edit information"); prepare({ ...draft, ownerUserId: id } as typeof draft);
    hooks.reconcile.mockResolvedValue({ ok: true, data: { id: null } }); await click("Check exact slug in registry");
    hooks.provision.mockResolvedValueOnce({ ok: false, message: "Configuration prevented the request", fields: {}, safeToEdit: true });
    await click("Create restaurant"); expect(storage.size).toBe(1);
    prepare(draft); expect(button("Create restaurant").props.disabled).toBe(true);
    expect(hooks.provision).toHaveBeenCalledTimes(2);
  });
  it("fails closed before dispatch when it cannot persist an attempt marker", async () => {
    (window.sessionStorage.setItem as unknown as (key: string, value: string) => void) = () => { throw new Error("storage denied"); };
    prepare(); await click("Create restaurant");
    expect(hooks.provision).not.toHaveBeenCalled(); expect(button("Create restaurant").props.disabled).toBe(true);
    expect(text(tree)).toContain("No request was sent");
  });
  it.each(["public origin", "Auth invitation configuration"])("allows another explicit review after %s prevented sending an invitation", async () => {
    prepare();
    hooks.provision.mockResolvedValueOnce({ ok: false, message: "Configuration prevented the request; no invitation was sent. Correct configuration and review again.", fields: {}, safeToEdit: true });
    await click("Create restaurant");
    expect(storage.size).toBe(0);
    expect(text(tree)).toContain("no invitation was sent");
    remount(); prepare();
    expect(button("Create restaurant").props.disabled).not.toBe(true);
    expect(hooks.provision).toHaveBeenCalledOnce();
    hooks.provision.mockResolvedValueOnce({ ok: true, data: { id, name: "Restaurant A", ownerInvitationStatus: "INVITED" } });
    await click("Create restaurant");
    expect(hooks.provision).toHaveBeenCalledTimes(2);
    expect(hooks.provision.mock.calls[1][0]).toMatchObject({ ownerUserId: null });
    expect(storage.size).toBe(0);
  });
});
