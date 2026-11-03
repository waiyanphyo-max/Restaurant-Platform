/** A workspace retains request identities while a write outcome may be uncertain. */
export class FinancialRequestKeys {
  private keys = new Map<string, string>();
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
  }
}
