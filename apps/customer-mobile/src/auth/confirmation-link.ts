import { parseCustomerConfirmationInput, type CustomerConfirmationInput } from "@restaurant-platform/restaurant-config/customer-confirmation";

let pending: CustomerConfirmationInput | null = null;
let attempt = 0;

/** Only this installed tenant/environment's custom scheme can reach confirmation. */
export function captureCustomerConfirmationLink(path: string, scheme: string): string | null {
  try {
    const url = new URL(path);
    if (url.protocol !== `${scheme}:` || url.username || url.password || url.port ||
        url.hostname !== "email-confirmation" || url.pathname !== "") return null;
    pending = parseCustomerConfirmationInput(path);
    return String(++attempt);
  } catch { return null; }
}

/** Credentials live only in this short-lived handoff; never navigation params or storage. */
export function takeCustomerConfirmationInput(): CustomerConfirmationInput {
  const value = pending ?? { kind: "invalid" as const };
  pending = null;
  return value;
}
