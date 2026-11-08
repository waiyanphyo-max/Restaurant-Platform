import { resolveMobileSystemPath } from "@restaurant-platform/restaurant-config/mobile-runtime";
import { readEmbeddedTenant } from "../src/tenant";

export function redirectSystemPath({ path }: { path: string }) {
  try {
    return resolveMobileSystemPath(path, "customer", readEmbeddedTenant().routing);
  } catch {
    return null;
  }
}
