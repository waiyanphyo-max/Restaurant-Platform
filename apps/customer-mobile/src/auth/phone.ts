/** Public Supabase Auth settings are checked afresh before each SMS action. */
export async function phoneProviderAvailable(
  requested: boolean,
  origin: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (!requested) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(`${origin}/auth/v1/settings`, {
      headers: { apikey: publishableKey }, signal: controller.signal, redirect: "error"
    });
    if (!response.ok) return false;
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== "object") return false;
    const value = settings as Record<string, unknown>;
    const external = value.external;
    return !!external && typeof external === "object" &&
      (external as Record<string, unknown>).phone === true && value.phone_autoconfirm === false &&
      typeof value.sms_provider === "string" && value.sms_provider.length > 0;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}
