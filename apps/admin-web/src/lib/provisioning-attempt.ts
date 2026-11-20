/** This is an unresolved mutation marker, not a saved form or a source of authorization. */
export interface ProvisioningAttemptScope { apiOrigin: string; userId: string; }
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Use sessionStorage: tab reloads retain uncertainty without storing Owner details or tokens. */
export function createProvisioningAttemptStore(storage: AttemptStorage, scope: ProvisioningAttemptScope) {
  if (!scope.apiOrigin || !uuidPattern.test(scope.userId)) throw new Error("Creation recovery scope is unavailable.");
  const key = `restaurant-provisioning:v1:${encodeURIComponent(scope.apiOrigin)}:${scope.userId.toLowerCase()}`;
  function read(): string | null {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    let marker: { version?: unknown; slug?: unknown };
    try { marker = JSON.parse(raw) as typeof marker; }
    catch { throw new Error("Creation recovery must be reconciled before another invitation."); }
    if (marker?.version !== 1 || typeof marker.slug !== "string" || marker.slug.length > 100 || !slugPattern.test(marker.slug)) {
      throw new Error("Creation recovery must be reconciled before another invitation.");
    }
    return marker.slug;
  }
  return {
    read,
    begin(slug: string) {
      if (!slug || slug.length > 100 || !slugPattern.test(slug)) throw new Error("A reviewed public slug is required.");
      if (read() !== null) throw new Error("Reconcile the previous creation attempt first.");
      storage.setItem(key, JSON.stringify({ version: 1, slug }));
      // Failure to durably retain the marker must prevent an external invitation dispatch.
      if (read() !== slug) throw new Error("Creation recovery storage is unavailable.");
    },
    clear() { storage.removeItem(key); },
  };
}
