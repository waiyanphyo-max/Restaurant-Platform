import * as Notifications from "expo-notifications";
import { useEffect } from "react";

interface NotificationInboxOptions {
  owner: string | null;
  navigationReady: boolean;
  discardResponse: boolean;
  ownsNotifications(owner: string): Promise<boolean>;
  openInbox(): void;
}

/** The response is a wake-up signal. Only the current authenticated inbox supplies details. */
export function useNotificationInbox({
  owner, navigationReady, discardResponse, ownsNotifications, openInbox
}: NotificationInboxOptions) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response) return;
    const { trigger } = response.notification.request;
    if (discardResponse || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
        !trigger || !("type" in trigger) || trigger.type !== "push") {
      Notifications.clearLastNotificationResponse();
      return;
    }
    if (!owner || !navigationReady) return;
    let current = true;
    void ownsNotifications(owner).catch(() => false).then(allowed => {
      if (!current || Notifications.getLastNotificationResponse()?.notification.request.identifier !== response.notification.request.identifier) return;
      Notifications.clearLastNotificationResponse();
      if (allowed) openInbox();
    });
    return () => { current = false; };
  }, [response, owner, navigationReady, discardResponse, ownsNotifications, openInbox]);
}
