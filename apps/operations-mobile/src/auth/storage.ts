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

/**
 * A durable local logout barrier. The SDK may fail to revoke a refresh token
 * while offline; an encrypted tombstone still prevents restoration after restart.
 * Current-process reads remain available until SDK sign-out finishes so it may
 * revoke its session when online. Writes are blocked as soon as logout starts.
 */
export function createLogoutProtectedSessionStorage(prefix: string, store: SecureStoragePort, sessionKey: string) {
  const storage = createSecureSessionStorage(prefix, store);
  const tombstone = "operations-logout-barrier";
  if (!/^[A-Za-z0-9._-]+$/.test(sessionKey) || sessionKey === tombstone) throw new Error("Invalid session storage key");
  let readsBlocked = false;
  let writesBlocked = false;
  let pending: Promise<unknown> = Promise.resolve();
  const initialized = storage.getItem(tombstone).then(value => {
    if (value !== null) { readsBlocked = true; writesBlocked = true; }
  });

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(async () => { await initialized; return operation(); });
    pending = result.catch(() => undefined);
    return result;
  }

  async function clearSessionKeys() {
    // An explicit SDK storageKey keeps erasure independent of Supabase's default naming.
    await storage.removeItem(sessionKey);
    await storage.removeItem(`${sessionKey}-user`);
    await storage.removeItem(`${sessionKey}-code-verifier`);
  }

  return {
    getItem(key: string) {
      return serialize(async () => readsBlocked ? null : storage.getItem(key));
    },
    setItem(key: string, value: string) {
      return serialize(async () => { if (!writesBlocked) await storage.setItem(key, value); });
    },
    removeItem(key: string) { return serialize(() => storage.removeItem(key)); },
    async prepareSignIn() {
      await serialize(async () => {
        readsBlocked = true;
        writesBlocked = true;
        await clearSessionKeys();
        await storage.removeItem(tombstone);
        readsBlocked = false;
        writesBlocked = false;
      });
    },
    async signOut(signOutSdk: () => Promise<void>) {
      writesBlocked = true;
      let barrierError: unknown;
      try {
        await serialize(() => storage.setItem(tombstone, "signed-out"));
      } catch (error) {
        barrierError = error;
      }
      try {
        await signOutSdk();
      } catch {
        // Remote revocation is best effort; successful local erasure is authoritative for this device.
      } finally {
        readsBlocked = true;
        await serialize(clearSessionKeys);
      }
      if (barrierError) throw barrierError;
    }
  };
}
