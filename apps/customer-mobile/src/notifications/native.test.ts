import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  enabled: true,
  physical: true,
  snapshot: { status: "signed_in", userId: "alice" } as { status: string; userId?: string },
  raw: null as string | null,
  tokenListener: undefined as undefined | ((token: { type: string; data: string }) => void),
  foreground: undefined as undefined | ((state: string) => void),
  authListener: undefined as undefined | ((state: { status: string; userId?: string }) => void),
  channel: vi.fn(), request: vi.fn(), permission: vi.fn(), token: vi.fn(),
  unregister: vi.fn(), dismiss: vi.fn(), cancel: vi.fn(), save: vi.fn(),
  register: vi.fn(), deactivate: vi.fn(), bearer: vi.fn(),
  tokenRemove: vi.fn(), foregroundRemove: vi.fn(), authRemove: vi.fn()
}));

vi.mock("expo-device", () => ({ get isDevice() { return native.physical; } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => native.raw),
  setItemAsync: async (key: string, value: string) => { native.raw = value; native.save(key, value); }
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 }, AndroidNotificationVisibility: { PRIVATE: 0 },
  setNotificationChannelAsync: native.channel, requestPermissionsAsync: native.request,
  getPermissionsAsync: native.permission, getDevicePushTokenAsync: native.token,
  unregisterForNotificationsAsync: native.unregister, dismissAllNotificationsAsync: native.dismiss,
  cancelAllScheduledNotificationsAsync: native.cancel,
  addPushTokenListener(callback: typeof native.tokenListener) { native.tokenListener = callback; return { remove: native.tokenRemove }; }
}));
vi.mock("react-native", () => ({ AppState: { addEventListener(_event: string, callback: typeof native.foreground) {
  native.foreground = callback; return { remove: native.foregroundRemove };
} } }));
vi.mock("../tenant", () => ({ readEmbeddedTenant: () => ({ notificationsEnabled: native.enabled,
  environment: "development", restaurantId: "restaurant", apiBaseUrl: "https://api.example.test" }) }));
vi.mock("../auth/native", () => ({ getCustomerAuth: () => ({ getSnapshot: () => native.snapshot,
  getAccessToken: native.bearer, subscribe(callback: typeof native.authListener) {
    native.authListener = callback;
    return native.authRemove;
  } }) }));
vi.mock("@restaurant-platform/api-client", () => ({ createDeviceApiClient: (options: { getAccessToken(): Promise<string | null> }) => ({
  async registerDevice(token: string, requestOptions: unknown) {
    const bearer = await options.getAccessToken();
    return native.register(token, requestOptions, bearer);
  },
  async deactivateDevice(id: string, requestOptions: unknown) {
    const bearer = await options.getAccessToken();
    return native.deactivate(id, requestOptions, bearer);
  }
}) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function savedState() { return JSON.parse(native.raw ?? "{}"); }

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.enabled = true; native.physical = true;
  native.snapshot = { status: "signed_in", userId: "alice" };
  native.raw = null; native.tokenListener = undefined; native.foreground = undefined; native.authListener = undefined;
  native.channel.mockResolvedValue(undefined);
  native.request.mockResolvedValue({ granted: true });
  native.permission.mockResolvedValue({ granted: true });
  native.token.mockResolvedValue({ type: "android", data: "native-fcm-token" });
  native.unregister.mockResolvedValue(undefined); native.dismiss.mockResolvedValue(undefined); native.cancel.mockResolvedValue(undefined);
  native.bearer.mockResolvedValue("alice-access-token");
  native.register.mockResolvedValue({ id: "device-one" });
  native.deactivate.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe("customer native notification registration", () => {
  it("fails closed without provider configuration and never prompts on restore", async () => {
    native.enabled = false;
    const notifications = await import("./native");
    expect(await notifications.enableCustomerNotifications()).toContain("not configured");
    await notifications.resumeCustomerNotifications();
    expect(native.request).not.toHaveBeenCalled();
    expect(native.token).not.toHaveBeenCalled();
    expect(native.register).not.toHaveBeenCalled();
  });

  it("requires a signed-in customer and a physical device before asking permission", async () => {
    const notifications = await import("./native");
    native.snapshot = { status: "signed_out" };
    expect(await notifications.enableCustomerNotifications()).toContain("Sign in");
    native.snapshot = { status: "signed_in", userId: "alice" }; native.physical = false;
    expect(await notifications.enableCustomerNotifications()).toContain("physical");
    expect(native.request).not.toHaveBeenCalled();
  });

  it("handles denied permission without requesting a token or creating an association", async () => {
    native.request.mockResolvedValue({ granted: false });
    const notifications = await import("./native");
    expect(await notifications.enableCustomerNotifications()).toContain("not granted");
    expect(native.token).not.toHaveBeenCalled();
    expect(native.register).not.toHaveBeenCalled();
    expect(native.raw).toBeNull();
  });

  it("sends a native FCM token with the current bearer and stores only private metadata", async () => {
    const notifications = await import("./native");
    expect(await notifications.enableCustomerNotifications()).toContain("registered");
    expect(native.channel).toHaveBeenCalledWith("default", { name: "Order updates", importance: 3, lockscreenVisibility: 0 });
    expect(native.register).toHaveBeenCalledWith("native-fcm-token", { timeoutMs: 3000 }, "alice-access-token");
    expect(savedState()).toEqual({ optedInUser: "alice", activeDeviceId: "device-one", associations: [{ userId: "alice", deviceId: "device-one" }] });
    expect(native.raw).not.toContain("native-fcm-token");
    expect(native.save.mock.calls[0]?.[0]).toBe("rp.customer.devices.development.restaurant");
  });

  it("rejects a non-Android token instead of passing an Expo token to Firebase", async () => {
    native.token.mockResolvedValue({ type: "expo", data: "ExponentPushToken[wrong-provider]" });
    const notifications = await import("./native");
    await expect(notifications.enableCustomerNotifications()).rejects.toThrow("Native Android");
    expect(native.register).not.toHaveBeenCalled();
  });

  it("restores an earlier opt-in without prompting and refreshes a rotated token on foreground", async () => {
    native.raw = JSON.stringify({ optedInUser: "alice", associations: [{ userId: "alice", deviceId: "old-device" }] });
    const notifications = await import("./native");
    await notifications.resumeCustomerNotifications();
    expect(native.request).not.toHaveBeenCalled();
    expect(native.deactivate).toHaveBeenCalledWith("old-device", { timeoutMs: 3000 }, "alice-access-token");
    native.register.mockResolvedValue({ id: "device-two" });
    native.token.mockResolvedValue({ type: "android", data: "rotated-fcm-token" });
    native.foreground?.("active");
    await flush();
    expect(native.register).toHaveBeenLastCalledWith("rotated-fcm-token", { timeoutMs: 3000 }, "alice-access-token");
    expect(savedState().activeDeviceId).toBe("device-two");
  });

  it("ignores restore for another account and for accounts without prior consent", async () => {
    const notifications = await import("./native");
    await notifications.resumeCustomerNotifications();
    native.raw = JSON.stringify({ optedInUser: "bob", activeDeviceId: "bob-device", associations: [{ userId: "bob", deviceId: "bob-device" }] });
    await notifications.resumeCustomerNotifications();
    expect(native.permission).not.toHaveBeenCalled();
    expect(native.request).not.toHaveBeenCalled();
    expect(native.register).not.toHaveBeenCalled();
  });

  it("processes native token rotation and preserves the new row while retiring the previous row", async () => {
    const notifications = await import("./native");
    await notifications.enableCustomerNotifications();
    native.register.mockResolvedValue({ id: "device-two" });
    native.tokenListener?.({ type: "android", data: "rotated-native-token" });
    await flush();
    expect(savedState().associations).toEqual([{ userId: "alice", deviceId: "device-two" }]);
    const rotationSaves = native.save.mock.calls.slice(1).map(call => JSON.parse(String(call[1])));
    expect(rotationSaves.every(state => state.associations.some((row: { deviceId: string }) => row.deviceId === "device-two"))).toBe(true);
    expect(native.deactivate).toHaveBeenCalledWith("device-one", { timeoutMs: 3000 }, "alice-access-token");
  });

  it("cleans an earlier opt-in if Android notification permission was revoked", async () => {
    const notifications = await import("./native");
    await notifications.enableCustomerNotifications();
    native.permission.mockResolvedValue({ granted: false });
    await notifications.resumeCustomerNotifications();
    expect(savedState()).toEqual({ optedInUser: null, activeDeviceId: null, associations: [] });
    expect(native.unregister).toHaveBeenCalledOnce();
    expect(native.request).toHaveBeenCalledOnce();
  });

  it("cancels an in-flight permission request when logout starts", async () => {
    const permission = deferred<{ granted: boolean }>();
    native.request.mockReturnValue(permission.promise);
    const notifications = await import("./native");
    const enabling = notifications.enableCustomerNotifications();
    const rejection = expect(enabling).rejects.toThrow("account changed");
    await flush();
    await notifications.cleanupCustomerDevice();
    permission.resolve({ granted: true });
    await rejection;
    expect(native.token).not.toHaveBeenCalled();
    expect(native.register).not.toHaveBeenCalled();
  });

  it("binds asynchronous bearer refresh to the original account", async () => {
    const access = deferred<string>();
    native.bearer.mockReturnValue(access.promise);
    const notifications = await import("./native");
    const enabling = notifications.enableCustomerNotifications();
    const rejection = expect(enabling).rejects.toThrow("account changed");
    await flush();
    native.snapshot = { status: "signed_in", userId: "bob" };
    access.resolve("bob-access-token");
    await rejection;
    expect(native.register).not.toHaveBeenCalled();
  });

  it("retains owned offline cleanup metadata and does not re-register after logout", async () => {
    const notifications = await import("./native");
    await notifications.enableCustomerNotifications();
    const oldListener = native.tokenListener;
    native.deactivate.mockRejectedValue(new Error("offline"));
    await notifications.cleanupCustomerDevice();
    expect(savedState()).toEqual({ optedInUser: null, activeDeviceId: null, associations: [{ userId: "alice", deviceId: "device-one" }] });
    expect(native.tokenRemove).toHaveBeenCalledOnce();
    expect(native.authRemove).toHaveBeenCalledOnce();
    oldListener?.({ type: "android", data: "late-token" });
    await notifications.resumeCustomerNotifications();
    expect(native.register).toHaveBeenCalledOnce();
    native.deactivate.mockResolvedValue(undefined);
    await notifications.retryCustomerDeviceCleanup();
    expect(savedState().associations).toEqual([]);
  });

  it("bounds logout to seven seconds and safely retains an HTTP registration that resolves later", async () => {
    vi.useFakeTimers();
    const response = deferred<{ id: string }>();
    native.register.mockReturnValue(response.promise);
    const notifications = await import("./native");
    const enabling = notifications.enableCustomerNotifications();
    const rejection = expect(enabling).rejects.toThrow("account changed");
    await flush();
    const cleanup = notifications.cleanupCustomerDevice();
    await vi.advanceTimersByTimeAsync(7000);
    await cleanup;
    native.snapshot = { status: "signed_out" };
    response.resolve({ id: "late-device" });
    await rejection;
    await flush();
    expect(savedState()).toEqual({ optedInUser: null, activeDeviceId: null, associations: [{ userId: "alice", deviceId: "late-device" }] });
    expect(native.deactivate).not.toHaveBeenCalled();
    native.snapshot = { status: "signed_in", userId: "bob" };
    await expect(notifications.enableCustomerNotifications()).rejects.toThrow("previous account");
    expect(native.register).toHaveBeenCalledOnce();
  });

  it("unregisters existing devices at logout even when the new build disables notifications", async () => {
    const notifications = await import("./native");
    await notifications.enableCustomerNotifications();
    native.enabled = false;
    await notifications.cleanupCustomerDevice();
    expect(savedState().associations).toEqual([]);
    expect(savedState().optedInUser).toBeNull();
    expect(native.unregister).toHaveBeenCalledOnce();
  });
});
