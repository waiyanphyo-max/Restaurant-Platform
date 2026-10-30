export type AppStage = "local" | "staging" | "production";

export function parseAppStage(value: string | undefined): AppStage | null {
  return value === "local" || value === "staging" || value === "production" ? value : null;
}

export function isValidAdminOrigin(value: string | undefined, stage: AppStage | null): boolean {
  if (!value || !stage) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return false;
    if (stage === "local") return url.protocol === "http:" && url.hostname === "localhost";
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
