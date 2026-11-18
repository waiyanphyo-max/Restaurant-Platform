import {
  ApiHttpError, ApiNetworkError, ApiTimeoutError, MissingAccessTokenError, TenantAccessError
} from "@restaurant-platform/api-client";
import type { MyRestaurantResponse } from "@restaurant-platform/shared-types";
import type { AuthSnapshot, NativeSessionController } from "./session";

export const operationsRoles = ["OWNER", "MANAGER", "STAFF", "DELIVERY_DRIVER"] as const;
export type OperationsRole = typeof operationsRoles[number];
export type OperationsMembership = MyRestaurantResponse & { role: OperationsRole };

export type OperationsAccessState =
  | { status: "loading" | "signed_out" | "unconfigured" }
  | { status: "checking_membership"; userId: string }
  | { status: "ready"; userId: string; membership: OperationsMembership }
  | { status: "denied" | "offline" | "error"; message: string };

interface MembershipPort {
  getConfiguredMembership(options?: { signal?: AbortSignal }): Promise<MyRestaurantResponse>;
}

/**
 * Membership is never restored from disk. Only the configured tenant returned by
 * Spring may unlock the workspace; every business request is still authorized there.
 */
export function createOperationsAccessController(
  auth: NativeSessionController,
  api: MembershipPort,
  restaurantId: string,
  cleanupDevice?: () => Promise<void>
) {
  let state: OperationsAccessState = { status: "loading" };
  let userId: string | null = null;
  let generation = 0;
  let disposed = false;
  let started = false;
  let signingOut = false;
  let suspended = false;
  let online = true;
  let request: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<(value: OperationsAccessState) => void>();
  const pendingChecks = new Set<() => void>();

  function publish(value: OperationsAccessState) {
    if (disposed) return;
    state = value;
    for (const listener of listeners) listener(state);
  }

  function invalidate() {
    generation++;
    request?.abort();
    request = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  async function validate(identity: string) {
    if (disposed || suspended || !online) return;
    invalidate();
    const checkGeneration = generation;
    const activeRequest = new AbortController();
    request = activeRequest;
    publish({ status: "checking_membership", userId: identity });
    try {
      const membership = await api.getConfiguredMembership({ signal: activeRequest.signal });
      if (disposed || checkGeneration !== generation || userId !== identity) return;
      if (!membership?.active || typeof membership.restaurantId !== "string" ||
          membership.restaurantId.toLowerCase() !== restaurantId.toLowerCase() ||
          !operationsRoles.includes(membership.role as OperationsRole)) {
        publish({ status: "denied", message: "This account does not have an active Operations membership for this restaurant." });
        return;
      }
      publish({ status: "ready", userId: identity, membership: membership as OperationsMembership });
    } catch (error) {
      if (disposed || checkGeneration !== generation || userId !== identity) return;
      if (error instanceof MissingAccessTokenError || (error instanceof ApiHttpError && error.status === 401)) {
        userId = null;
        publish({ status: "signed_out" });
      } else if (error instanceof TenantAccessError || (error instanceof ApiHttpError && error.status === 403)) {
        publish({ status: "denied", message: "This account cannot access this restaurant. Ask the owner to check your membership." });
      } else if (error instanceof ApiNetworkError || error instanceof ApiTimeoutError) {
        publish({ status: "offline", message: "Connect to the internet to verify your restaurant membership." });
      } else {
        publish({ status: "error", message: "Restaurant access could not be verified. Please try again." });
      }
    } finally {
      if (request === activeRequest) request = null;
    }
  }

  function receive(snapshot: AuthSnapshot) {
    if (disposed || signingOut) return;
    if (snapshot.status === "signed_out") {
      userId = null;
      invalidate();
      publish({ status: "signed_out" });
      return;
    }
    if (userId === snapshot.userId) return;
    userId = snapshot.userId;
    invalidate();
    publish({ status: "checking_membership", userId });
    if (suspended || !online) {
      if (!online) publish({ status: "offline", message: "Connect to the internet to verify your restaurant membership." });
      return;
    }
    // Never call an SDK method from its synchronous onAuthStateChange callback.
    const identity = userId;
    timer = setTimeout(() => { timer = null; void validate(identity); }, 0);
  }

  function assertAccess(expectedUserId: string, expectedRole: OperationsRole) {
    if (disposed || signingOut || suspended || !online || state.status !== "ready" ||
      state.userId !== expectedUserId || state.membership.role !== expectedRole) throw new TenantAccessError();
  }

  async function verifyAccess(expectedUserId: string, expectedRole: OperationsRole) {
    if (disposed || signingOut || !online || userId !== expectedUserId) throw new TenantAccessError();
    if (suspended || state.status === "checking_membership") {
      // Android may return the picker result before its active/membership events finish.
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          listeners.delete(receiveCheck);
          pendingChecks.delete(cancel);
          if (error) reject(error); else resolve();
        };
        const cancel = () => finish(new TenantAccessError());
        const receiveCheck = (next: OperationsAccessState) => {
          if (next.status === "checking_membership" && next.userId === expectedUserId) return;
          try { assertAccess(expectedUserId, expectedRole); finish(); }
          catch { cancel(); }
        };
        const timeout = setTimeout(cancel, 30_000);
        listeners.add(receiveCheck);
        pendingChecks.add(cancel);
        receiveCheck(state);
      });
    } else {
      // Recheck even on platforms that do not emit a background event for their picker.
      assertAccess(expectedUserId, expectedRole);
      await validate(expectedUserId);
    }
    assertAccess(expectedUserId, expectedRole);
  }

  return {
    getState: () => state,
    assertAccess,
    verifyAccess,
    subscribe(listener: (value: OperationsAccessState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async start() {
      if (started || disposed) return;
      started = true;
      unsubscribe = auth.subscribe(receive);
      try {
        receive(await auth.restore());
      } catch {
        if (!disposed) {
          userId = null;
          invalidate();
          publish({ status: "error", message: "Your saved session could not be restored. Sign out and sign in again." });
        }
      }
    },
    async retryMembership() {
      if (disposed || signingOut) return;
      suspended = false;
      if (!online) return;
      if (userId) await validate(userId);
      else {
        try { receive(await auth.restore()); }
        catch { publish({ status: "error", message: "Your session could not be restored. Sign out and sign in again." }); }
      }
    },
    suspend() {
      suspended = true;
      invalidate();
      if (userId) publish({ status: "checking_membership", userId });
    },
    setOnline(next: boolean) {
      if (online === next) return;
      online = next;
      invalidate();
      if (userId) {
        if (!online) publish({ status: "offline", message: "Connect to the internet to verify your restaurant membership." });
        else if (!suspended) void validate(userId);
      }
    },
    async signOut() {
      if (signingOut) return;
      signingOut = true;
      userId = null;
      invalidate();
      publish({ status: "loading" });
      try {
        // Device deactivation needs the current bearer. Secure logout still runs offline.
        await cleanupDevice?.().catch(() => undefined);
        await auth.signOut();
        publish({ status: "signed_out" });
      } finally { signingOut = false; }
    },
    dispose() {
      disposed = true;
      invalidate();
      for (const cancel of pendingChecks) cancel();
      unsubscribe?.();
      listeners.clear();
    }
  };
}

export type OperationsAccessController = ReturnType<typeof createOperationsAccessController>;
