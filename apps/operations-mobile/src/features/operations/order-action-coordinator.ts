/** Page-owned locks survive local search/channel filtering and card remounts. */
export class OrderActionCoordinator {
  private readonly entries = new Map<string, { pending: boolean }>();
  private notify: () => void = () => undefined;
  private reload: () => void = () => undefined;

  connect(notify: () => void, reload: () => void) {
    this.notify = notify; this.reload = reload;
    return () => { this.notify = () => undefined; this.reload = () => undefined; };
  }
  isBlocked(orderId: string) { return this.entries.has(orderId); }
  begin(orderId: string) {
    if (this.isBlocked(orderId)) return false;
    this.entries.set(orderId, { pending: true }); this.notify();
    return true;
  }
  settle(orderId: string) {
    const entry = this.entries.get(orderId);
    if (!entry) return;
    entry.pending = false;
    this.notify();
    // Read only. A successful or uncertain write is never automatically replayed.
    this.reload();
  }
  reconcile() {
    let changed = false;
    for (const [id, entry] of this.entries) {
      if (!entry.pending) { this.entries.delete(id); changed = true; }
    }
    if (changed) this.notify();
  }
}
