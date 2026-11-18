/** The email destination is server configuration, never derived from a request or form. */
export function invitationRedirect(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" && !local && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/auth/accept-invite" ? url.href : null;
  } catch { return null; }
}
