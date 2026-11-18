import { resolveMobileSystemPath } from "@restaurant-platform/restaurant-config/mobile-runtime";
import { readEmbeddedTenant } from "../src/tenant";
import { captureCustomerConfirmationLink } from "../src/auth/confirmation-link";

export function redirectSystemPath({ path }: { path: string }) {
  try {
    const routing = readEmbeddedTenant().routing;
    const confirmationAttempt = captureCustomerConfirmationLink(path, routing.scheme);
    if (confirmationAttempt) return `/email-confirmation?attempt=${confirmationAttempt}`;
    return resolveMobileSystemPath(path, "customer", routing);
  } catch {
    return null;
  }
}
