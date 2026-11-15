interface CookieEnvironment {
  APP_STAGE?: string;
  ADMIN_WEB_ORIGIN?: string;
}

/** Trust explicit deployment configuration or the browser's actual transport. */
export function authCookieOptions(environment: CookieEnvironment, browserProtocol?: string) {
  let configuredHttps = false;
  try { configuredHttps = new URL(environment.ADMIN_WEB_ORIGIN ?? "").protocol === "https:"; }
  catch { /* Missing local deployment configuration keeps plain HTTP development usable. */ }
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: browserProtocol === "https:" || configuredHttps || environment.APP_STAGE === "staging" || environment.APP_STAGE === "production",
  };
}
