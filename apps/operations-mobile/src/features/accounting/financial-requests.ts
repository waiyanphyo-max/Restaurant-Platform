/** A workspace retains request identities while a write outcome may be uncertain. */
export class FinancialRequestKeys {
  private keys = new Map<string, string>();
  private uncertain = new Map<string, string>();
  private pending = new Set<string>();
  constructor(private createKey = () => `finance:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`) { }
  key(operation: string, payload: unknown): string {
    const fingerprint = JSON.stringify([operation, payload]);
    const previous = this.keys.get(fingerprint);
    if (previous) return previous;
    const next = this.createKey();
    this.keys.set(fingerprint, next);
    return next;
  }

  complete(operation: string, payload: unknown) {
    this.keys.delete(JSON.stringify([operation, payload]));
    if (this.uncertain.get(operation) === JSON.stringify(payload)) this.uncertain.delete(operation);
  }

  /** Session-only review hold; durable purchase recovery continues to use SecureStore. */
  markUncertain(operation: string, payload: unknown) {
    if (!this.uncertain.has(operation)) this.uncertain.set(operation, JSON.stringify(payload));
  }

  /** A shared workspace lock survives a form unmount while the request is still running. */
  begin(operation: string, payload: unknown): boolean {
    if (this.uncertain.has(operation) || this.pending.has(operation)) return false;
    this.pending.add(operation); this.markUncertain(operation, payload); return true;
  }
  settle(operation: string) { this.pending.delete(operation); }
  isPending(operation: string): boolean { return this.pending.has(operation); }

  isUncertain(operation: string): boolean { return this.uncertain.has(operation); }
  uncertainOperations(): string[] { return [...this.uncertain.keys()]; }

  uncertainPayload<T>(operation: string): T | null {
    const payload = this.uncertain.get(operation);
    return payload === undefined ? null : JSON.parse(payload) as T;
  }

  /** Call only after an authoritative successful read and explicit fresh review. Retain retry keys. */
  reconcile(operation: string) { if (!this.pending.has(operation)) this.uncertain.delete(operation); }
}
