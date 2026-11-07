import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { createCustomerDeviceApiClient } from "@restaurant-platform/api-client";
import { getCustomerAuth } from "../auth/native";
import { readEmbeddedTenant } from "../tenant";
import { createDeviceLifecycle, type DeviceState } from "./lifecycle";

let lifecycle: ReturnType<typeof createDeviceLifecycle> | undefined;
let tokenSubscription: { remove(): void } | undefined;
let authSubscription: (() => void) | undefined;
let account: string | null = null;
let generation = 0;
let resuming: { owner: string | null; started: number; promise: Promise<void> } | undefined;
let tokenRevocation: Promise<true> | undefined;

function userId() { const snapshot = getCustomerAuth().getSnapshot(); return snapshot.status === "signed_in" ? snapshot.userId : null; }
function key() { const tenant = readEmbeddedTenant(); return `rp.customer.devices.${tenant.environment}.${tenant.restaurantId}`; }
async function readState(): Promise<DeviceState> {
  const raw = await SecureStore.getItemAsync(key());
  if (!raw) return { optedInUser: null, activeDeviceId: null, associations: [], tokenCleanupPending: false };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !Array.isArray((value as DeviceState).associations)) throw new Error("Invalid device state");
  const state = value as DeviceState;
  if (state.optedInUser !== null && typeof state.optedInUser !== "string" ||
      state.activeDeviceId != null && typeof state.activeDeviceId !== "string" ||
      state.tokenCleanupPending !== undefined && typeof state.tokenCleanupPending !== "boolean" ||
      state.associations.some(row => !row || typeof row.userId !== "string" || typeof row.deviceId !== "string")) throw new Error("Invalid device state");
  return {
    optedInUser: state.optedInUser,
    activeDeviceId: state.activeDeviceId ?? null,
    associations: state.associations,
    tokenCleanupPending: state.tokenCleanupPending ?? (state.optedInUser === null && state.associations.length > 0)
  };
}
/** Bind the bearer lookup to its original owner, including an asynchronous refresh. */
function ownedApi(owner: string) {
  const { apiBaseUrl, restaurantId } = readEmbeddedTenant();
  return createCustomerDeviceApiClient({ baseUrl: apiBaseUrl, restaurantId, async getAccessToken() {
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
function clearLocalNotifications() {
  return bounded(Promise.allSettled([Notifications.dismissAllNotificationsAsync(), Notifications.cancelAllScheduledNotificationsAsync()]), 1500);
}
async function revokeNativeToken() {
  tokenRevocation ??= Notifications.unregisterForNotificationsAsync().then(() => true as const, error => {
    tokenRevocation = undefined;
    throw error;
  });
  // A timed-out native operation can still finish. Keep it in flight and block registration until it settles.
  if (!await bounded(tokenRevocation, 1500)) throw new Error("Previous device token cleanup is pending");
  tokenRevocation = undefined;
  void clearLocalNotifications();
}
function controller() {
  lifecycle ??= createDeviceLifecycle({ currentUser: userId, load: readState,
    save: state => SecureStore.setItemAsync(key(), JSON.stringify(state)),
    register: (token, owner) => ownedApi(owner).registerDevice(token, { timeoutMs: 3000 }),
    deactivate: (id, owner) => ownedApi(owner).deactivateDevice(id, { timeoutMs: 3000 }),
    unregister: revokeNativeToken
  });
  return lifecycle;
}
function stopListeners() {
  tokenSubscription?.remove(); tokenSubscription = undefined;
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
    if (!tokenRevocation && generation === started && userId() === owner && account === owner && token.type === "android" && typeof token.data === "string") void controller().register(token.data, owner).catch(() => undefined);
  });
  authSubscription = getCustomerAuth().subscribe(snapshot => {
    if (snapshot.status !== "signed_in" || snapshot.userId !== owner) void cleanupCustomerDevice();
  });
}
async function registerCurrentToken(owner: string, started: number, optIn: boolean) {
  if (tokenRevocation) await revokeNativeToken();
  requireCurrent(owner, started);
  const token = await Notifications.getDevicePushTokenAsync();
  requireCurrent(owner, started);
  if (token.type !== "android" || typeof token.data !== "string" || !token.data.trim()) throw new Error("Native Android push token unavailable");
  await controller().register(token.data, owner, optIn);
  listen(owner, started);
}
export async function enableCustomerNotifications(t: (english: string, burmese: string) => string = english => english): Promise<string> {
  if (!readEmbeddedTenant().notificationsEnabled) return t("Notifications are not configured in this build.", "ဤအက်ပ်တွင် အသိပေးချက်ပို့ခြင်းကို မသတ်မှတ်ရသေးပါ။");
  const owner = userId();
  if (!owner) return t("Sign in before enabling notifications.", "အသိပေးချက်များ မဖွင့်မီ အကောင့်ဝင်ပါ။");
  if (!Device.isDevice) return t("Use a physical Android device to register for notifications.", "အသိပေးချက်များအတွက် Android စက်အစစ်ကို အသုံးပြုပါ။");
  const started = generation;
  await controller().retryCleanup();
  requireCurrent(owner, started);
  await Notifications.setNotificationChannelAsync("default", { name: t("Order updates", "အမှာစာ အခြေအနေများ"), importance: Notifications.AndroidImportance.DEFAULT, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE });
  requireCurrent(owner, started);
  const permission = await Notifications.requestPermissionsAsync();
  requireCurrent(owner, started);
  if (!permission.granted) return t("Notification permission was not granted. You can enable it later in Android settings.",
    "အသိပေးချက်များအတွက် ခွင့်ပြုချက် မရပါ။ Android ဆက်တင်တွင် နောက်မှ ဖွင့်နိုင်ပါသည်။");
  await registerCurrentToken(owner, started, true);
  return t("This device is registered for updates. Delivery depends on the notification provider.",
    "ဤစက်ကို အသိပေးချက်များအတွက် မှတ်ပုံတင်ထားပါသည်။ အသိပေးချက် ရောက်ရှိမှုသည် ဝန်ဆောင်မှုပေးသူအပေါ် မူတည်ပါသည်။");
}
/** Restoration and foreground checks use existing consent and never prompt for permission. */
export async function resumeCustomerNotifications() {
  const owner = userId();
  const started = generation;
  if (resuming?.owner === owner && resuming.started === started) return resuming.promise;
  const operation = async () => {
    const optedInUser = await controller().retryCleanup();
    if (!owner || !readEmbeddedTenant().notificationsEnabled || !Device.isDevice) return;
    requireCurrent(owner, started);
    if (optedInUser !== owner) return;
    const permission = await Notifications.getPermissionsAsync();
    requireCurrent(owner, started);
    if (!permission.granted) { await cleanupCustomerDevice(); return; }
    await registerCurrentToken(owner, started, false);
  };
  const promise = operation().finally(() => { if (resuming?.promise === promise) resuming = undefined; });
  resuming = { owner, started, promise };
  return promise;
}
/** Retry persisted token cleanup after reconnect even with no signed-in customer. */
export function watchCustomerNotificationConnectivity() {
  const resume = () => { void resumeCustomerNotifications().catch(() => undefined); };
  const foreground = AppState.addEventListener("change", next => { if (next === "active") resume(); });
  const network = Network.addNetworkStateListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) resume();
  });
  resume();
  return () => { foreground.remove(); network.remove(); };
}
export async function cleanupCustomerDevice(): Promise<void> {
  generation++;
  stopListeners();
  void clearLocalNotifications();
  // Also clear a previous opt-in after the build feature is disabled.
  try { await bounded(controller().cleanup(), 7000); }
  catch { /* Pending association metadata is retained for the same account to retry. */ }
  // Keep this singleton queue: an HTTP result may arrive after bounded logout returns.
}
export async function retryCustomerDeviceCleanup() { await controller().retryCleanup(); }
