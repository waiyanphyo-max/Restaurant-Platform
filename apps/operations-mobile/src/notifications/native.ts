import { createDeviceApiClient } from "@restaurant-platform/api-client";
import { createNativeNotifications } from "@restaurant-platform/mobile-notifications";
import { getOperationsAuth } from "../auth/native";
import { readEmbeddedTenant } from "../tenant";

let membershipOwner: (() => string | null) | undefined;

function userId() {
  const snapshot = getOperationsAuth().getSnapshot();
  return snapshot.status === "signed_in" ? snapshot.userId : null;
}

function ownedApi(owner: string, needsMembership: boolean) {
  const { apiBaseUrl, allowPrivateLanHttp } = readEmbeddedTenant();
  function requireOwner() {
    if (userId() !== owner || needsMembership && membershipOwner?.() !== owner) {
      throw new Error("Device account changed");
    }
  }
  return createDeviceApiClient({ baseUrl: apiBaseUrl, allowPrivateLanHttp, async getAccessToken() {
    requireOwner();
    const token = await getOperationsAuth().getAccessToken();
    requireOwner();
    return token;
  } });
}

export const operationsNotifications = createNativeNotifications({
  storageKey() {
    const { environment, restaurantId } = readEmbeddedTenant();
    return `rp.operations.devices.${environment}.${restaurantId}`;
  },
  enabled: () => readEmbeddedTenant().notificationsEnabled,
  currentUser: userId,
  subscribeToIdentity: listener => getOperationsAuth().subscribe(listener),
  canRegister: owner => membershipOwner?.() === owner,
  register: (token, owner) => ownedApi(owner, true).registerDevice(token, { timeoutMs: 3000 }),
  deactivate: (id, owner) => ownedApi(owner, false).deactivateDevice(id, { timeoutMs: 3000 })
});

export function watchOperationsNotifications(owner: () => string | null) {
  membershipOwner = owner;
  const stop = operationsNotifications.watchConnectivity();
  return () => { membershipOwner = undefined; stop(); };
}
