import { createCustomerDeviceApiClient } from "@restaurant-platform/api-client";
import { createNativeNotifications } from "@restaurant-platform/mobile-notifications";
import { getCustomerAuth } from "../auth/native";
import { readEmbeddedTenant } from "../tenant";

function userId() {
  const snapshot = getCustomerAuth().getSnapshot();
  return snapshot.status === "signed_in" ? snapshot.userId : null;
}

/** Bind the bearer lookup to its original owner, including an asynchronous refresh. */
function ownedApi(owner: string) {
  const { apiBaseUrl, restaurantId, allowPrivateLanHttp } = readEmbeddedTenant();
  return createCustomerDeviceApiClient({ baseUrl: apiBaseUrl, restaurantId, allowPrivateLanHttp, async getAccessToken() {
    if (userId() !== owner) throw new Error("Device account changed");
    const token = await getCustomerAuth().getAccessToken();
    if (userId() !== owner) throw new Error("Device account changed");
    return token;
  } });
}

export const customerNotifications = createNativeNotifications({
  storageKey() {
    const { environment, restaurantId } = readEmbeddedTenant();
    return `rp.customer.devices.${environment}.${restaurantId}`;
  },
  enabled: () => readEmbeddedTenant().notificationsEnabled,
  currentUser: userId,
  subscribeToIdentity: listener => getCustomerAuth().subscribe(listener),
  register: (token, owner) => ownedApi(owner).registerDevice(token, { timeoutMs: 3000 }),
  deactivate: (id, owner) => ownedApi(owner).deactivateDevice(id, { timeoutMs: 3000 })
});

export async function enableCustomerNotifications(t: (english: string, burmese: string) => string = english => english): Promise<string> {
  switch (await customerNotifications.enable(t("Order updates", "အမှာစာ အခြေအနေများ"))) {
    case "unconfigured": return t("Notifications are not configured in this build.", "ဤအက်ပ်တွင် အသိပေးချက်ပို့ခြင်းကို မသတ်မှတ်ရသေးပါ။");
    case "signed_out": return t("Sign in before enabling notifications.", "အသိပေးချက်များ မဖွင့်မီ အကောင့်ဝင်ပါ။");
    case "non_physical": return t("Use a physical Android device to register for notifications.", "အသိပေးချက်များအတွက် Android စက်အစစ်ကို အသုံးပြုပါ။");
    case "denied": return t("Notification permission was not granted. You can enable it later in Android settings.",
      "အသိပေးချက်များအတွက် ခွင့်ပြုချက် မရပါ။ Android ဆက်တင်တွင် နောက်မှ ဖွင့်နိုင်ပါသည်။");
    case "registered": return t("This device is registered for updates. Delivery depends on the notification provider.",
      "ဤစက်ကို အသိပေးချက်များအတွက် မှတ်ပုံတင်ထားပါသည်။ အသိပေးချက် ရောက်ရှိမှုသည် ဝန်ဆောင်မှုပေးသူအပေါ် မူတည်ပါသည်။");
  }
}

export const resumeCustomerNotifications = customerNotifications.resume;
export const watchCustomerNotificationConnectivity = customerNotifications.watchConnectivity;
export const cleanupCustomerDevice = customerNotifications.cleanup;
export async function retryCustomerDeviceCleanup() { await customerNotifications.retryCleanup(); }
