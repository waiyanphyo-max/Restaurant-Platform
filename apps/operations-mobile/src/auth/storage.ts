export interface SecureStoragePort {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Native storage failures propagate; refresh credentials never fall back to plaintext. */
export function createSecureSessionStorage(prefix: string, store: SecureStoragePort) {
  if (!/^[A-Za-z0-9._-]+$/.test(prefix)) throw new Error("Invalid auth storage scope");
  function name(key: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error("Unexpected auth storage key");
    return `${prefix}.${key}`;
  }
  return {
    getItem(key: string) { return store.getItemAsync(name(key)); },
    setItem(key: string, value: string) { return store.setItemAsync(name(key), value); },
    removeItem(key: string) { return store.deleteItemAsync(name(key)); }
  };
}
