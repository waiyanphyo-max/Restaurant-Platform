import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { RestaurantMemberResponse, RestaurantResponse, RestaurantSettingsResponse } from "@restaurant-platform/shared-types";

type Frame = { values: unknown[]; effects: { deps: unknown[]; cleanup?: () => void }[] };
const h = vi.hoisted(() => ({
  frames: new Map<string, Frame>(), active: "", cursor: 0, role: "OWNER", user: "owner-a", tenant: "11111111-1111-4111-8111-111111111111", status: "ready",
  profile: {} as RestaurantResponse, settings: {} as RestaurantSettingsResponse, members: [] as RestaurantMemberResponse[], tables: [] as unknown[],
  attempts: new Map<string, { email: string; state: string }>(), queries: [] as string[],
  profileSave: vi.fn(), settingsSave: vi.fn(), getProfile: vi.fn(), getSettings: vi.fn(), invite: vi.fn(), listMembers: vi.fn(), updateMember: vi.fn(), remove: vi.fn(), transfer: vi.fn(),
  createTable: vi.fn(), updateTable: vi.fn(), rotateTable: vi.fn(), rotateCommon: vi.fn(), listTables: vi.fn(), reload: vi.fn(), retryMembership: vi.fn(), signOut: vi.fn(), assertAccess: vi.fn(),
  refresh: vi.fn(), upload: vi.fn(), share: vi.fn(), dirty: vi.fn(), background: null as null | ((state: string) => void), focused: false, blur: null as null | (() => void),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const frame = h.frames.get(h.active)!; const i = h.cursor++;
    if (!(i in frame.values)) frame.values[i] = typeof initial === "function" ? initial() : initial;
    return [frame.values[i], (value: unknown) => { frame.values[i] = typeof value === "function" ? value(frame.values[i]) : value; }];
  },
  useRef(initial: unknown) {
    const frame = h.frames.get(h.active)!; const i = h.cursor++;
    if (!(i in frame.values)) frame.values[i] = { current: initial };
    return frame.values[i];
  },
  useEffect(effect: () => (() => void) | undefined, deps: unknown[] = []) {
    const frame = h.frames.get(h.active)!; const i = h.cursor++; const previous = frame.effects[i];
    if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) { previous?.cleanup?.(); frame.effects[i] = { deps, cleanup: effect() }; }
  },
  useCallback(callback: unknown) { return callback; },
}));
vi.mock("react-native", () => ({ Image: "Image", View: "View", Share: { share: h.share }, useWindowDimensions: () => ({ width: 320 }),
  AppState: { currentState: "active", addEventListener: (_event: string, listener: (state: string) => void) => { h.background = listener; return { remove() {} }; } },
}));
vi.mock("expo-router", () => ({ useFocusEffect: (focus: () => () => void) => { if (!h.focused) { h.focused = true; h.blur = focus(); } } }));
vi.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", readDirectoryAsync: async () => [], EncodingType: { Base64: "base64" } }));
vi.mock("expo-sharing", () => ({}));
vi.mock("react-native-qrcode-svg", () => ({ default: "QRCode" }));
vi.mock("../../hooks/useUnsavedChanges", () => ({ useUnsavedChanges: h.dirty }));
vi.mock("../../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", ConfirmDialog: "ConfirmDialog", FormField: "FormField", Page: "Page", StateView: "StateView", Status: "Status" }));
vi.mock("../../components/QueryResult", () => ({ QueryResult: "QueryResult" }));
vi.mock("./controls", () => ({ Toggle: "Toggle", Choices: "Choices", FormStatus: "FormStatus" }));
vi.mock("./RuntimePaletteEditor", () => ({ RuntimePaletteEditor: "RuntimePaletteEditor" }));
vi.mock("./InvitationRecoveryProvider", () => ({ useInvitationRecovery: () => ({
  get: (email: string) => h.attempts.get(email.trim().toLowerCase()), list: () => [...h.attempts.values()],
  record: (email: string, state: string) => h.attempts.set(email, { email, state }), rejected: (email: string) => h.attempts.delete(email),
}) }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: h.status, userId: h.user, membership: { restaurantId: h.tenant, role: h.role } },
  retryMembership: h.retryMembership, signOut: h.signOut, assertWorkspaceAccess: h.assertAccess }) }));
vi.mock("../../branding/RuntimeBrandingProvider", () => ({ useRuntimeBranding: () => ({ scopeKey: `${h.user}:${h.tenant}:${h.role}`, logoUrl: null, displayName: "Synthetic restaurant", refresh: h.refresh }) }));
vi.mock("../../components/useImageUpload", () => ({ useImageUpload: () => h.upload }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: h.tenant, guestBaseUrl: "https://guest.example.test" }) }));
vi.mock("../../api", () => ({ getOperationsApi: () => ({ updateRestaurantProfile: h.profileSave, updateSettings: h.settingsSave, getRestaurant: h.getProfile, getSettings: h.getSettings,
  inviteMember: h.invite, listMembers: h.listMembers, updateMember: h.updateMember, removeMember: h.remove, transferOwnership: h.transfer,
  createTable: h.createTable, updateTable: h.updateTable, rotateTableQrToken: h.rotateTable, rotateCommonQrToken: h.rotateCommon, listTables: h.listTables }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: (_query: unknown, key: string) => {
  h.queries.push(key); return { state: { status: "ready", data: key === "managed-profile" ? h.profile : key === "managed-settings" ? h.settings : key === "managed-team" ? h.members : h.tables }, reload: h.reload };
} }));

import { SettingsScreen } from "./SettingsScreen";
import { TeamScreen } from "./TeamScreen";
import { TablesScreen } from "./TablesScreen";

type Props = Record<string, unknown>;
type Element = ReactElement<Props>;
function run(component: (props: Props) => ReactNode, props: Props = {}, key = component.name): ReactNode {
  h.active = key; h.cursor = 0;
  if (!h.frames.has(key)) h.frames.set(key, { values: [], effects: [] });
  return component(props);
}
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement<Props>(node)) return node;
  if (typeof node.type === "function") return expand(run(node.type as (props: Props) => ReactNode, node.props, `${node.type.name}:${node.key ?? ""}`));
  if (node.type === "QueryResult") return expand((node.props.children as (data: unknown) => ReactNode)((node.props.state as { data: unknown }).data));
  return { ...node, props: { ...node.props, children: expand(node.props.children as ReactNode) } };
}
function nodes(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node) || node.type === "ConfirmDialog" && !node.props.visible) return [];
  return [node, ...nodes(node.props.children as ReactNode)];
}
const settings = () => nodes(expand(run(SettingsScreen)));
const team = () => nodes(expand(run(TeamScreen)));
const tables = () => nodes(expand(run(TablesScreen)));
function find(tree: Element[], type: string, label: string) {
  const match = tree.find(node => node.type === type && [node.props.label, node.props.title].includes(label));
  if (!match) throw new Error(`Missing ${type}: ${label}`);
  return match.props;
}
function press(tree: Element[], label: string) { const action = find(tree, "Action", label); if (!action.disabled) (action.onPress as () => void)(); }
function input(tree: Element[], label: string, value: string) { (find(tree, "FormField", label).onChangeText as (value: string) => void)(value); }
function confirm(tree: Element[], title: string) { const dialog = find(tree, "ConfirmDialog", title); if (!dialog.confirmDisabled) (dialog.onConfirm as () => void)(); }
function copy(tree: Element[]) { return tree.map(node => [node.props.title, node.props.message, node.props.error, node.props.children].filter(value => typeof value === "string").join(" ")).join(" "); }
async function tick() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
function member(role = "STAFF"): RestaurantMemberResponse { return { id: "member-a", restaurantId: h.tenant, userId: "member-user-a", email: "member@example.test", fullName: "အဖွဲ့ဝင် အမည်ရှည်", role, createdAt: "2026-11-21T10:00:00Z" }; }
beforeEach(() => {
  vi.stubGlobal("React", React); vi.clearAllMocks();
  for (const frame of h.frames.values()) frame.effects.forEach(effect => effect?.cleanup?.());
  h.frames.clear(); h.attempts.clear(); h.queries = []; h.role = "OWNER"; h.user = "owner-a"; h.tenant = "11111111-1111-4111-8111-111111111111"; h.status = "ready"; h.focused = false; h.background = null; h.blur = null;
  h.profile = { id: h.tenant, name: "Synthetic A", active: true, township: "Township", city: "City", slug: "synthetic-a" } as RestaurantResponse;
  h.settings = { restaurantId: h.tenant, currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 1000, defaultDeliveryFee: 500, acceptsOrders: true, allowQrOrder: true, allowDelivery: true, allowTakeaway: true, defaultDeliveryDriverUserId: null };
  h.members = []; h.tables = [{ id: "table-a", tableNumber: "T1", active: true }];
  h.profileSave.mockImplementation(async body => ({ ...h.profile, ...body })); h.settingsSave.mockImplementation(async body => ({ ...h.settings, ...body }));
  h.getProfile.mockImplementation(async () => h.profile); h.getSettings.mockImplementation(async () => h.settings);
  h.invite.mockImplementation(async body => ({ ...member(body.role), email: body.email })); h.listMembers.mockImplementation(async () => h.members);
  for (const fn of [h.retryMembership, h.signOut, h.refresh, h.updateMember, h.remove, h.transfer, h.updateTable, h.reload]) fn.mockResolvedValue(undefined);
  h.createTable.mockResolvedValue({ id: "new-table-a", tableNumber: "T2", active: true, qrToken: "synthetic-one-time-token" });
  h.rotateTable.mockResolvedValue({ id: "table-a", tableNumber: "T1", active: true, qrToken: "synthetic-rotated-token" });
  h.rotateCommon.mockResolvedValue({ restaurantId: h.tenant, commonQrToken: "synthetic-common-token" }); h.listTables.mockImplementation(async () => h.tables);
});

describe("reviewed profile and ordering settings", () => {
  it.each(["OWNER", "MANAGER"])("reviews %s public profile writes and omits logo mutation", async role => {
    h.role = role; input(settings(), "Restaurant name", "Updated A"); press(settings(), "Save profile");
    expect(h.profileSave).not.toHaveBeenCalled(); expect(find(settings(), "ConfirmDialog", "Save restaurant profile?").message).toContain("Updated A");
    confirm(settings(), "Save restaurant profile?"); await tick();
    expect(h.profileSave).toHaveBeenCalledOnce(); expect(h.profileSave.mock.calls[0][0]).not.toHaveProperty("logoUrl");
    expect(copy(settings())).toContain("Profile saved by the server"); expect(h.refresh).toHaveBeenCalledOnce();
    if (role === "MANAGER") expect(settings().some(node => node.props.title === "Choose and upload logo")).toBe(false);
  });
  it("keeps drafts on refresh, blocks stale saves, and confirms discard", () => {
    input(settings(), "Restaurant name", "Unsaved local name"); h.profile = { ...h.profile, name: "Remote name" };
    expect(find(settings(), "FormField", "Restaurant name").value).toBe("Unsaved local name"); expect(find(settings(), "Action", "Save profile").disabled).toBe(true);
    press(settings(), "Discard profile changes"); expect(find(settings(), "FormField", "Restaurant name").value).toBe("Unsaved local name");
    confirm(settings(), "Discard profile changes?"); expect(find(settings(), "FormField", "Restaurant name").value).toBe("Remote name"); expect(h.profileSave).not.toHaveBeenCalled();
  });
  it("reviews exact flag/amount changes without rotating credentials or collecting payments", async () => {
    const change = find(settings(), "Toggle", "Accept new orders").onChange as (value: boolean) => void; change(false);
    input(settings(), "Minimum order (whole amount)", "9007199254740991"); press(settings(), "Review settings update");
    const review = find(settings(), "ConfirmDialog", "Update restaurant settings?");
    expect(review.message).toContain("Enabled → Disabled"); expect(review.message).toContain("9007199254740991 MMK"); expect(review.message).toContain("payments are not collected"); expect(h.settingsSave).not.toHaveBeenCalled();
    confirm(settings(), "Update restaurant settings?"); await tick();
    expect(h.settingsSave.mock.calls[0][0]).toMatchObject({ acceptsOrders: false, minimumOrder: Number.MAX_SAFE_INTEGER }); expect(h.rotateCommon).not.toHaveBeenCalled();
  });
  it("blocks unsafe whole amounts and requires successful read after an uncertain save", async () => {
    input(settings(), "Default delivery fee (whole amount)", "1.5"); press(settings(), "Review settings update"); expect(h.settingsSave).not.toHaveBeenCalled(); expect(copy(settings())).toContain("whole amount");
    input(settings(), "Default delivery fee (whole amount)", "2500"); h.settingsSave.mockRejectedValueOnce(new ApiTimeoutError());
    press(settings(), "Review settings update"); confirm(settings(), "Update restaurant settings?"); await tick(); expect(find(settings(), "Action", "Review settings update").disabled).toBe(true);
    h.getSettings.mockRejectedValueOnce(new ApiNetworkError()); press(settings(), "Check current ordering settings"); await tick(); expect(find(settings(), "Action", "Review settings update").disabled).toBe(true);
    press(settings(), "Check current ordering settings"); await tick(); expect(h.settingsSave).toHaveBeenCalledOnce(); expect(copy(settings())).toContain("Current ordering settings loaded");
  });
  it.each(["STAFF", "DELIVERY_DRIVER"])("withholds settings requests from %s", role => { h.role = role; expect(copy(settings())).toContain("Only the restaurant Owner or Manager"); expect(h.queries).toEqual([]); });
});

describe("Owner-only invitations and membership review", () => {
  it.each(["MANAGER", "STAFF", "DELIVERY_DRIVER"])("withholds private member queries and invitations from %s", role => { h.role = role; expect(copy(team())).toContain("Only the restaurant Owner"); expect(h.queries).toEqual([]); });
  it("reviews email/non-owner role before the external invitation and reports verified provider state only", async () => {
    input(team(), "Invitation email", "NEW@EXAMPLE.TEST"); press(team(), "Send invitation"); expect(h.invite).not.toHaveBeenCalled();
    expect(find(team(), "ConfirmDialog", "Send team invitation?").message).toContain("new@example.test"); confirm(team(), "Send team invitation?"); await tick();
    expect(h.invite).toHaveBeenCalledExactlyOnceWith({ email: "new@example.test", fullName: null, role: "STAFF" }); expect(copy(team())).toContain("Email delivery and account acceptance status are unavailable");
    expect(find(team(), "Choices", "Restaurant role").values).not.toContain("OWNER");
  });
  it("keeps an uncertain email blocked across remount and absent-member reconciliation while allowing another address", async () => {
    h.invite.mockRejectedValueOnce(new ApiTimeoutError()); input(team(), "Invitation email", "uncertain@example.test"); press(team(), "Send invitation"); confirm(team(), "Send team invitation?"); await tick();
    expect(h.invite).toHaveBeenCalledOnce();
    for (const frame of h.frames.values()) frame.effects.forEach(effect => effect?.cleanup?.()); h.frames.clear();
    input(team(), "Invitation email", "uncertain@example.test"); expect(find(team(), "Action", "Send invitation").disabled).toBe(true);
    press(team(), "Check current team for uncertain@example.test"); await tick(); expect(copy(team())).toContain("does not prove the provider failed"); expect(find(team(), "Action", "Send invitation").disabled).toBe(true);
    input(team(), "Invitation email", "other@example.test"); press(team(), "Send invitation"); expect(find(team(), "ConfirmDialog", "Send team invitation?").message).toContain("other@example.test"); expect(h.invite).toHaveBeenCalledOnce();
  });
  it("does not resend registered-email conflicts and revokes controls on forbidden", async () => {
    h.invite.mockRejectedValueOnce(new ApiHttpError(409, "MEMBER_EMAIL_ALREADY_REGISTERED")); input(team(), "Invitation email", "registered@example.test"); press(team(), "Send invitation"); confirm(team(), "Send team invitation?"); await tick();
    expect(find(team(), "Action", "Send invitation").disabled).toBe(true); expect(copy(team())).toContain("verified-account support");
    input(team(), "Invitation email", "forbidden@example.test"); h.invite.mockRejectedValueOnce(new ApiHttpError(403, "DENIED")); press(team(), "Send invitation"); confirm(team(), "Send team invitation?"); await tick(); expect(copy(team())).toContain("Owner access is no longer available"); expect(h.retryMembership).toHaveBeenCalledOnce();
  });
  it("reviews current to proposed role and transfers only an existing member with membership refresh", async () => {
    h.members = [member()]; press(team(), "Member details"); (find(team(), "Choices", "New restaurant role").onChange as (role: string) => void)("MANAGER"); press(team(), "Review role change");
    expect(find(team(), "ConfirmDialog", "Change member role?").message).toContain("STAFF → MANAGER"); confirm(team(), "Change member role?"); await tick(); expect(h.updateMember).toHaveBeenCalledExactlyOnceWith("member-a", { userId: "member-user-a", role: "MANAGER" });
    press(team(), "Member details"); press(team(), "Transfer ownership to this member"); expect(h.transfer).not.toHaveBeenCalled(); confirm(team(), "Transfer restaurant ownership?"); await tick();
    expect(h.transfer).toHaveBeenCalledExactlyOnceWith({ newOwnerUserId: "member-user-a" }); expect(h.retryMembership).toHaveBeenCalledOnce();
    expect(copy(team())).toContain("Ownership transferred"); expect(team().some(node => node.props.title === "Send invitation")).toBe(false);
  });
  it("pauses team administration after uncertain ownership and revalidates without replaying transfer", async () => {
    h.members = [member()]; h.transfer.mockRejectedValueOnce(new ApiTimeoutError()); press(team(), "Member details"); press(team(), "Transfer ownership to this member"); confirm(team(), "Transfer restaurant ownership?"); await tick();
    expect(copy(team())).toContain("Ownership outcome unconfirmed"); expect(team().some(node => node.props.title === "Send invitation")).toBe(false);
    press(team(), "Recheck current membership"); await tick(); expect(h.retryMembership).toHaveBeenCalledTimes(2); expect(h.assertAccess).toHaveBeenCalledWith("owner-a", "OWNER"); expect(h.transfer).toHaveBeenCalledOnce(); expect(team().some(node => node.props.title === "Send invitation")).toBe(true);
  });
});

describe("table review and ephemeral QR credentials", () => {
  it.each(["STAFF", "DELIVERY_DRIVER"])("denies direct table controls and reads to %s", role => { h.role = role; expect(copy(tables())).toContain("Only the restaurant Owner or Manager"); expect(h.queries).toEqual([]); });
  it("requires confirmation when deactivating through the edit form and preserves QR identity", async () => {
    press(tables(), "Edit table"); (find(tables(), "Toggle", "Table active").onChange as (value: boolean) => void)(false); press(tables(), "Save table");
    expect(h.updateTable).not.toHaveBeenCalled(); expect(find(tables(), "ConfirmDialog", "Save table changes?").message).toContain("will be blocked"); confirm(tables(), "Save table changes?"); await tick();
    expect(h.updateTable).toHaveBeenCalledExactlyOnceWith("table-a", { tableNumber: "T1", active: false }); expect(h.rotateTable).not.toHaveBeenCalled();
  });
  it("preserves a table draft and blocks a stale update after refresh", () => {
    press(tables(), "Edit table"); input(tables(), "Table number or name", "Local rename"); h.tables = [{ id: "table-a", tableNumber: "Server rename", active: true }];
    expect(find(tables(), "FormField", "Table number or name").value).toBe("Local rename"); expect(find(tables(), "Action", "Save table").disabled).toBe(true);
    press(tables(), "Cancel table edit"); confirm(tables(), "Discard table changes?"); expect(h.updateTable).not.toHaveBeenCalled();
    press(tables(), "Deactivate table"); h.tables = [{ id: "table-a", tableNumber: "Newer server rename", active: true }]; confirm(tables(), "Deactivate table?"); expect(h.updateTable).not.toHaveBeenCalled(); expect(copy(tables())).toContain("changed while the confirmation was open");
  });
  it.each(["background", "blur"])("clears a one-time QR on %s and never prints raw token metadata", async cleanup => {
    input(tables(), "Table number or name", "T2"); press(tables(), "Create table and QR"); await tick();
    expect(tables().find(node => node.type === "QRCode")?.props.value).toContain("#qrToken=synthetic-one-time-token"); expect(copy(tables())).not.toContain("synthetic-one-time-token");
    if (cleanup === "background") h.background!("background"); else h.blur!();
    expect(tables().some(node => node.type === "QRCode")).toBe(false); expect(h.share).not.toHaveBeenCalled();
  });
  it("suppresses late QR display after background and blocks blind rotation retry after timeout", async () => {
    let resolve!: (value: unknown) => void; h.rotateCommon.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    press(tables(), "Rotate Common QR"); expect(h.rotateCommon).not.toHaveBeenCalled(); confirm(tables(), "Rotate QR credential?"); h.background!("background"); resolve({ commonQrToken: "late-secret" }); await tick(); expect(tables().some(node => node.type === "QRCode")).toBe(false); expect(copy(tables())).toContain("one-time display was cleared"); expect(copy(tables())).not.toContain("late-secret");
    h.background!("active"); h.rotateCommon.mockRejectedValueOnce(new ApiTimeoutError()); press(tables(), "Rotate Common QR"); confirm(tables(), "Rotate QR credential?"); await tick(); expect(find(tables(), "Action", "Rotate Common QR").disabled).toBe(true);
    h.listTables.mockRejectedValueOnce(new ApiNetworkError()); press(tables(), "Check tables after uncertain action"); await tick(); expect(find(tables(), "Action", "Rotate Common QR").disabled).toBe(true);
    press(tables(), "Check tables after uncertain action"); await tick(); expect(h.rotateCommon).toHaveBeenCalledTimes(2); press(tables(), "Rotate Common QR"); expect(find(tables(), "ConfirmDialog", "Rotate QR credential?").message).toContain("intentional new replacement");
  });
});
