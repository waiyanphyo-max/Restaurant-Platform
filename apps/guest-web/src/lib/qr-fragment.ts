/** Strip credential fragments even when invalid, while preserving ordinary page anchors. */
export function hasQrCredentialFragment(hash: string): boolean {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).has("qrToken");
}

export function readQrTokenFromHash(hash: string): string | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const values = new URLSearchParams(fragment).getAll("qrToken");
  if (values.length !== 1 || values[0].length === 0 || values[0].length > 4096) {
    return null;
  }
  return values[0];
}
