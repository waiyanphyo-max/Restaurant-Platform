export type GuestConfigEnvironment = "staging" | "production";

export function parseGuestConfigEnvironment(
  value: string | undefined,
): GuestConfigEnvironment | null {
  return value === "staging" || value === "production" ? value : null;
}
