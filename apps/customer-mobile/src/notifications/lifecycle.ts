export interface DeviceAssociation { userId: string; deviceId: string; }
export interface DeviceState {
  optedInUser: string | null;
  /** Other rows are retained only for owner-authorized cleanup. */
  activeDeviceId: string | null;
  associations: DeviceAssociation[];
  tokenCleanupPending: boolean;
}
export interface DevicePort {
  currentUser(): string | null;
  load(): Promise<DeviceState>;
  save(state: DeviceState): Promise<void>;
  register(token: string, userId: string): Promise<{ id: string }>;
  deactivate(id: string, userId: string): Promise<void>;
  unregister(): Promise<void>;
}

/** One persistent queue orders rotations, late registration and logout. No push token is stored. */
export function createDeviceLifecycle(port: DevicePort) {
  let tail: Promise<unknown> = Promise.resolve();
  let epoch = 0;
  let stopped = false;
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const next = tail.then(action, action);
    tail = next.catch(() => undefined);
    return next;
  };
  function requireOwner(userId: string, requestedEpoch: number) {
    if (requestedEpoch !== epoch || port.currentUser() !== userId) throw new Error("Device account changed");
  }
  async function cleanupOwned(state: DeviceState, owner: string | null, preserveId: string | null) {
    for (const row of [...state.associations]) {
      if (row.userId !== owner || row.deviceId === preserveId || port.currentUser() !== owner) continue;
      try {
        await port.deactivate(row.deviceId, row.userId);
        state.associations = state.associations.filter(item => item.userId !== row.userId || item.deviceId !== row.deviceId);
        // Keep the active row durable while retiring or retrying an earlier token.
        await port.save(state);
      } catch { /* Failed owned rows remain retry metadata. */ }
    }
  }
  async function clearOptIn(state: DeviceState) {
    state.tokenCleanupPending ||= state.optedInUser !== null || state.activeDeviceId !== null;
    state.optedInUser = null;
    state.activeDeviceId = null;
    await port.save(state);
  }
  async function cleanupToken(state: DeviceState) {
    if (!state.tokenCleanupPending) return;
    await port.unregister();
    state.tokenCleanupPending = false;
    await port.save(state);
  }
  return {
    register(token: string, userId: string, optIn = false) {
      const requestedEpoch = epoch;
      return enqueue(async () => {
        requireOwner(userId, requestedEpoch);
        if (!token.trim() || stopped && !optIn) throw new Error("Device registration is stopped");
        const state = await port.load();
        requireOwner(userId, requestedEpoch);
        if (!optIn && state.optedInUser !== userId) throw new Error("Notification opt-in is required");
        if (state.tokenCleanupPending || state.optedInUser && state.optedInUser !== userId) {
          throw new Error("Previous device token cleanup is pending");
        }
        if (optIn) {
          stopped = false;
          // Persist consent before a request that can commit even if its response is lost.
          if (!state.optedInUser) {
            state.optedInUser = userId;
            await port.save(state);
            requireOwner(userId, requestedEpoch);
          }
        }
        const device = await port.register(token, userId);
        state.associations = [...state.associations.filter(row => row.deviceId !== device.id), { userId, deviceId: device.id }];
        const stillCurrent = !stopped && requestedEpoch === epoch && port.currentUser() === userId;
        state.optedInUser = stillCurrent ? userId : null;
        state.activeDeviceId = stillCurrent ? device.id : null;
        state.tokenCleanupPending = !stillCurrent;
        try { await port.save(state); }
        catch (error) {
          if (port.currentUser() === userId) await port.deactivate(device.id, userId).catch(() => undefined);
          await port.unregister().catch(() => undefined);
          throw error;
        }
        await cleanupOwned(state, userId, stillCurrent ? device.id : null);
        requireOwner(userId, requestedEpoch);
        if (stopped) throw new Error("Device registration is stopped");
      });
    },
    cleanup() {
      // Cancel queued/resolving registration before awaiting storage or HTTP.
      stopped = true;
      epoch++;
      const owner = port.currentUser();
      return enqueue(async () => {
        let state: DeviceState | undefined;
        try {
          state = await port.load();
          await clearOptIn(state);
          await cleanupOwned(state, owner, null);
        } finally {
          if (state) await cleanupToken(state);
          else await port.unregister();
        }
      });
    },
    retryCleanup() {
      return enqueue(async () => {
        const owner = port.currentUser();
        const state = await port.load();
        if (owner && state.optedInUser && state.optedInUser !== owner) await clearOptIn(state);
        const active = state.optedInUser === owner ? state.activeDeviceId : null;
        await cleanupOwned(state, owner, active);
        await cleanupToken(state);
        return state.optedInUser;
      });
    }
  };
}
