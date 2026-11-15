import * as Device from "expo-device";
import * as Network from "expo-network";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { createDeviceLifecycle, type DevicePort, type DeviceState } from "./lifecycle";

interface NativeNotificationOptions {
  storageKey(): string;
  enabled(): boolean;
  currentUser(): string | null;
  subscribeToIdentity(listener: () => void): () => void;
  canRegister?(owner: string): boolean;
  register: DevicePort["register"];
  deactivate: DevicePort["deactivate"];
}

async function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<undefined>(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

function clearLocalNotifications() {
  return bounded(Promise.allSettled([
    Notifications.dismissAllNotificationsAsync(),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Promise.resolve().then(() => Notifications.clearLastNotificationResponse())
  ]), 1500);
}

export function createNativeNotifications(options: NativeNotificationOptions) {
  let tokenSubscription: { remove(): void } | undefined;
  let authSubscription: (() => void) | undefined;
  let account: string | null = null;
  let generation = 0;
  let notificationsSuspended = false;
  let resuming: { owner: string | null; started: number; promise: Promise<void> } | undefined;
  let tokenRevocation: Promise<true> | undefined;
  let registration: { token: string; promise: Promise<void>; status: "pending" | "registered" | "failed" } | undefined;
  let ignoredFetchEvent: string | undefined;

  async function readState(): Promise<DeviceState> {
    const raw = await SecureStore.getItemAsync(options.storageKey());
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

  function canRegister(owner: string) {
    return options.currentUser() === owner && (options.canRegister?.(owner) ?? true);
  }

  const lifecycle = createDeviceLifecycle({
    currentUser: options.currentUser,
    load: readState,
    save: state => SecureStore.setItemAsync(options.storageKey(), JSON.stringify(state)),
    register(token, owner) {
      if (!canRegister(owner)) throw new Error("Device account changed");
      return options.register(token, owner);
    },
    deactivate: options.deactivate,
    unregister: revokeNativeToken
  });

  function stopListeners() {
    tokenSubscription?.remove(); tokenSubscription = undefined;
    authSubscription?.(); authSubscription = undefined;
    account = null;
    registration = undefined;
    ignoredFetchEvent = undefined;
  }

  function isCurrent(owner: string, started: number) {
    return generation === started && canRegister(owner);
  }

  function requireCurrent(owner: string, started: number) {
    if (!isCurrent(owner, started)) throw new Error("Device account changed");
  }

  function registerToken(token: string, owner: string, recheck = false) {
    if (registration?.token === token && (registration.status === "pending" ||
        registration.status === "registered" && !recheck)) return registration.promise;
    const next: NonNullable<typeof registration> = { token, promise: lifecycle.register(token, owner), status: "pending" };
    registration = next;
    void next.promise.then(() => { next.status = "registered"; }, () => { next.status = "failed"; });
    return next.promise;
  }

  function listen(owner: string, started: number) {
    requireCurrent(owner, started);
    if (account === owner) return;
    stopListeners(); account = owner;
    tokenSubscription = Notifications.addPushTokenListener(token => {
      if (!tokenRevocation && isCurrent(owner, started) && account === owner && token.type === "android" &&
          typeof token.data === "string" && token.data.trim() && token.data !== ignoredFetchEvent) {
        void registerToken(token.data, owner).catch(() => undefined);
      }
    });
    authSubscription = options.subscribeToIdentity(() => {
      if (options.currentUser() !== owner) void cleanup();
    });
  }

  async function registerCurrentToken(owner: string, started: number) {
    if (tokenRevocation) await revokeNativeToken();
    requireCurrent(owner, started);
    listen(owner, started);
    const previous = registration;
    ignoredFetchEvent = undefined;
    const token = await Notifications.getDevicePushTokenAsync();
    requireCurrent(owner, started);
    if (token.type !== "android" || typeof token.data !== "string" || !token.data.trim()) throw new Error("Native Android push token unavailable");
    if (registration && registration !== previous) {
      // A refresh during retrieval is newer. Expo may also emit the fetched token as a listener event.
      if (registration.token !== token.data) ignoredFetchEvent = token.data;
      await registration.promise;
    } else {
      await registerToken(token.data, owner, true);
    }
    requireCurrent(owner, started);
  }

  async function enable(channelName: string) {
    if (!options.enabled()) return "unconfigured";
    const owner = options.currentUser();
    if (!owner || !canRegister(owner)) return "signed_out";
    if (!Device.isDevice) return "non_physical";
    const started = generation;
    await lifecycle.retryCleanup();
    requireCurrent(owner, started);
    await Notifications.setNotificationChannelAsync("default", {
      name: channelName, importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE
    });
    requireCurrent(owner, started);
    const permission = await Notifications.requestPermissionsAsync();
    requireCurrent(owner, started);
    if (!permission.granted) return "denied";
    await lifecycle.optIn(owner);
    requireCurrent(owner, started);
    notificationsSuspended = false;
    await registerCurrentToken(owner, started);
    return "registered";
  }

  /** Restoration and foreground checks use existing consent and never prompt for permission. */
  async function resume() {
    const owner = options.currentUser();
    const started = generation;
    if (resuming?.owner === owner && resuming.started === started) return resuming.promise;
    const operation = async () => {
      const optedInUser = await lifecycle.retryCleanup();
      if (!owner || !options.enabled() || !Device.isDevice || !isCurrent(owner, started) || optedInUser !== owner) return;
      const permission = await Notifications.getPermissionsAsync();
      requireCurrent(owner, started);
      if (!permission.granted) { await cleanup(); return; }
      await registerCurrentToken(owner, started);
    };
    const promise = operation().finally(() => { if (resuming?.promise === promise) resuming = undefined; });
    resuming = { owner, started, promise };
    return promise;
  }

  async function ownsNotifications(owner: string) {
    const started = generation;
    if (notificationsSuspended || !options.enabled() || !isCurrent(owner, started)) return false;
    const state = await readState();
    return !notificationsSuspended && state.activeDeviceId !== null &&
      !state.tokenCleanupPending && state.optedInUser === owner && isCurrent(owner, started);
  }

  /** Retry persisted token cleanup after reconnect even with no signed-in user. */
  function watchConnectivity() {
    const retry = () => { void resume().catch(() => undefined); };
    const foreground = AppState.addEventListener("change", next => { if (next === "active") retry(); });
    const network = Network.addNetworkStateListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) retry();
    });
    Notifications.setNotificationHandler({
      async handleNotification() {
        const owner = options.currentUser();
        const visible = !!owner && await ownsNotifications(owner).catch(() => false);
        return { shouldShowBanner: visible, shouldShowList: visible, shouldPlaySound: visible, shouldSetBadge: false };
      }
    });
    retry();
    return () => {
      generation++;
      foreground.remove();
      network.remove();
      stopListeners();
      Notifications.setNotificationHandler(null);
    };
  }

  async function cleanup(): Promise<void> {
    notificationsSuspended = true;
    generation++;
    stopListeners();
    void clearLocalNotifications();
    // Also clear a previous opt-in after the build feature is disabled.
    try { await bounded(lifecycle.cleanup(), 7000); }
    catch { /* Pending association metadata is retained for the same account to retry. */ }
    // Keep this singleton queue: an HTTP result may arrive after bounded logout returns.
  }

  return { enable, resume, watchConnectivity, cleanup, ownsNotifications, retryCleanup: lifecycle.retryCleanup };
}
