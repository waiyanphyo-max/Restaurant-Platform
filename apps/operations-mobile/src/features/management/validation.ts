export const TEAM_ROLES = ["MANAGER", "STAFF", "DELIVERY_DRIVER"] as const;
export type TeamRole = typeof TEAM_ROLES[number];

export function isTeamRole(value: string): value is TeamRole {
  return TEAM_ROLES.some(role => role === value);
}

export function requiredText(value: string, maximum: number, label: string): string {
  const text = value.trim();
  if (!text || text.length > maximum) throw new Error(`${label} is required and must be at most ${maximum} characters.`);
  return text;
}

export function optionalText(value: string, maximum: number, label: string): string | null {
  const text = value.trim();
  if (text.length > maximum) throw new Error(`${label} must be at most ${maximum} characters.`);
  return text || null;
}

export function wholeAmount(value: string, label: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error(`${label} must be a non-negative whole amount.`);
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error(`${label} is too large.`);
  return amount;
}

export function coordinate(value: string, maximum: number, label: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > maximum) throw new Error(`${label} must be between -${maximum} and ${maximum}.`);
  return number;
}

export function invitationEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid invitation email address.");
  return email;
}

/** Match existing guest entry aliases. Credentials belong in fragments, never server-visible queries. */
export function createGuestQrUrl(guestBaseUrl: string, restaurantId: string, token: string, kind: "common" | "table"): string {
  const base = new URL(guestBaseUrl);
  const localHttp = base.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(base.hostname);
  if ((base.protocol !== "https:" && !localHttp) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("A reviewed HTTPS guest origin is required before generating a QR code.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId)) throw new Error("Invalid restaurant identity.");
  if (!token.trim() || token.length > 64) throw new Error("The server did not return a valid QR credential.");
  const url = new URL(kind === "common" ? "/" : "/workspace", base);
  url.searchParams.set("view", kind === "common" ? "customer-pickup" : "table-order");
  url.searchParams.set("restaurantId", restaurantId);
  url.hash = new URLSearchParams({ qrToken: token }).toString();
  return url.href;
}
