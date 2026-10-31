export interface PublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

/** Only project URL and publishable key may enter a browser or SSR auth client. */
export function parsePublicSupabaseConfig(
  urlValue: string | undefined,
  keyValue: string | undefined,
): PublicSupabaseConfig | null {
  if (!urlValue || !keyValue || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(keyValue)) return null;
  try {
    const url = new URL(urlValue);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return { url: url.origin, publishableKey: keyValue };
  } catch {
    return null;
  }
}

export function publicSupabaseConfig(): PublicSupabaseConfig | null {
  return parsePublicSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
