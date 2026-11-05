import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import { AppState } from "react-native";
import { createDeviceApiClient } from "@restaurant-platform/api-client";
import { getCustomerAuth } from "../auth/native";
import { readEmbeddedTenant } from "../tenant";
import { createDeviceLifecycle, type DeviceState } from "./lifecycle";

let lifecycle: ReturnType<typeof createDeviceLifecycle> | undefined;
let tokenSubscription: { remove(): void } | undefined;
let lifecycleSubscription: { remove(): void } | undefined;
let authSubscription: (() => void) | undefined;
let account: string | null = null;
let generation = 0;
let resuming: Promise<void> | undefined;

function userId() { const snapshot = getCustomerAuth().getSnapshot(); return snapshot.status === "signed_in" ? snapshot.userId : null; }
function key() { const tenant = readEmbeddedTenant(); return `rp.customer.devices.${tenant.environment}.${tenant.restaurantId}`; }
async function readState(): Promise<DeviceState> {
  const raw = await SecureStore.getItemAsync(key());
  if (!raw) return { optedInUser: null, activeDeviceId: null, associations: [] };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !Array.isArray((value as DeviceState).associations)) throw new Error("Invalid device state");
  const state = value as DeviceState;
  if (state.optedInUser !== null && typeof state.optedInUser !== "string" ||
      state.activeDeviceId != null && typeof state.activeDeviceId !== "string" ||
      state.associations.some(row => !row || typeof row.userId !== "string" || typeof row.deviceId !== "string")) throw new Error("Invalid device state");
  return { optedInUser: state.optedInUser, activeDeviceId: state.activeDeviceId ?? null, associations: state.associations };
}
/** Bind the bearer lookup to its original owner, including an asynchronous refresh. */
function ownedApi(owner: string) {
  return createDeviceApiClient({ baseUrl: readEmbeddedTenant().apiBaseUrl, async getAccessToken() {
    if (userId() !== owner) throw new Error("Device account changed");
    const token = await getCustomerAuth().getAccessToken();
    if (userId() !== owner) throw new Error("Device account changed");
    return token;
  } });
}
async function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<undefined>(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}
function controller() {
  lifecycle ??= createDeviceLifecycle({ currentUser: userId, load: readState,
    save: state => SecureStore.setItemAsync(key(), JSON.stringify(state)),
    register: (token, owner) => ownedApi(owner).registerDevice(token, { timeoutMs: 3000 }),
    deactivate: (id, owner) => ownedApi(owner).deactivateDevice(id, { timeoutMs: 3000 }),
    async unregister() {
      await bounded(Promise.allSettled([Notifications.unregisterForNotificationsAsync(), Notifications.dismissAllNotificationsAsync(), Notifications.cancelAllScheduledNotificationsAsync()]), 1500);
    }
  });
  return lifecycle;
}
function stopListeners() {
  tokenSubscription?.remove(); tokenSubscription = undefined;
  lifecycleSubscription?.remove(); lifecycleSubscription = undefined;
  authSubscription?.(); authSubscription = undefined;
  account = null;
}
function requireCurrent(owner: string, started: number) {
  if (generation !== started || userId() !== owner) throw new Error("Device account changed");
}
function listen(owner: string, started: number) {
  requireCurrent(owner, started);
  if (account === owner) return;
  stopListeners(); account = owner;
  tokenSubscription = Notifications.addPushTokenListener(token => {
    if (generation === started && userId() === owner && account === owner && token.type === "android" && typeof token.data === "string") void controller().register(token.data, owner).catch(() => undefined);
  });
  lifecycleSubscription = AppState.addEventListener("change", next => {
    if (next === "active") void resumeCustomerNotifications().catch(() => undefined);
  });
  authSubscription = getCustomerAuth().subscribe(snapshot => {
    if (snapshot.status !== "signed_in" || snapshot.userId !== owner) void cleanupCustomerDevice();
  });
}
async function registerCurrentToken(owner: string, started: number, optIn: boolean) {
  const token = await Notifications.getDevicePushTokenAsync();
  requireCurrent(owner, started);
  if (token.type !== "android" || typeof token.data !== "string" || !token.data.trim()) throw new Error("Native Android push token unavailable");
  await controller().register(token.data, owner, optIn);
  listen(owner, started);
}
export async function enableCustomerNotifications(): Promise<string> {
  if (!readEmbeddedTenant().notificationsEnabled) return "Notifications are not configured in this build.";
  const owner = userId();
  if (!owner) return "Sign in before enabling notifications.";
  if (!Device.isDevice) return "Use a physical Android device to register for notifications.";
  const started = generation;
  await Notifications.setNotificationChannelAsync("default", { name: "Order updates", importance: Notifications.AndroidImportance.DEFAULT, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE });
  requireCurrent(owner, started);
  const permission = await Notifications.requestPermissionsAsync();
  requireCurrent(owner, started);
  if (!permission.granted) return "Notification permission was not granted. You can enable it later in Android settings.";
  await registerCurrentToken(owner, started, true);
  return "This device is registered for updates. Delivery depends on the notification provider.";
}
/** Restoration and foreground checks use existing consent and never prompt for permission. */
export async function resumeCustomerNotifications() {
  if (resuming) return resuming;
  const started = generation;
  const operation = async () => {
    if (!readEmbeddedTenant().notificationsEnabled || !Device.isDevice) return;
    const owner = userId();
    if (!owner) return;
    const state = await readState();
    requireCurrent(owner, started);
    if (state.optedInUser !== owner) return;
    const permission = await Notifications.getPermissionsAsync();
    requireCurrent(owner, started);
    if (!permission.granted) { await cleanupCustomerDevice(); return; }
    await registerCurrentToken(owner, started, false);
  };
  resuming = operation().finally(() => { resuming = undefined; });
  return resuming;
}
export async function cleanupCustomerDevice(): Promise<void> {
  generation++;
  stopListeners();
  // Also clear a previous opt-in after the build feature is disabled.
  try { await bounded(controller().cleanup(), 7000); }
  catch { /* Pending association metadata is retained for the same account to retry. */ }
  // Keep this singleton queue: an HTTP result may arrive after bounded logout returns.
}
export async function retryCustomerDeviceCleanup() { await controller().retryCleanup(); }
