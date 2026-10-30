export function readQrTokenFromHash(hash: string): string | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const values = new URLSearchParams(fragment).getAll("qrToken");
  if (values.length !== 1 || values[0].length === 0 || values[0].length > 4096) {
    return null;
  }
  return values[0];
}
