/** Public catalog photos follow the existing HTTPS, no-credentials/query/fragment contract. */
export function safeFoodImageUrl(value: string | null | undefined): string | undefined {
  if (!value || value.length > 2000 || value.includes("\\") || /\s/u.test(value) ||
    Array.from(value).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) || !/^https:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password && !url.search && !url.hash
      ? url.href : undefined;
  } catch { return undefined; }
}
