export const AUTH_SESSION_EXPIRED_EVENT = "restaurant-platform:auth-session-expired";

export function notifyAuthSessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
  }
}
