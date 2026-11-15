import { TenantAccessError } from "@restaurant-platform/api-client";
import type { OperationsAccessState } from "./access";
import type { NativeSessionController } from "./session";

export type VerifiedWorkspace = Extract<OperationsAccessState, { status: "ready" }>;

/** Keep component memory through a same-account check, but never grant access from it. */
export function retainWorkspace(previous: VerifiedWorkspace | null, next: OperationsAccessState): VerifiedWorkspace | null {
  if (next.status === "ready") return next;
  return next.status === "checking_membership" && previous?.userId === next.userId ? previous : null;
}

export interface OperationsRequestAccess {
  userId: string;
  assertCurrentAccess(): void;
}

/** Bind a pending image operation to its original verified account and current role. */
export function scopedOperationsToken(auth: Pick<NativeSessionController, "getSnapshot" | "getAccessToken">,
  expected: OperationsRequestAccess) {
  function check() {
    expected.assertCurrentAccess();
    const snapshot = auth.getSnapshot();
    if (snapshot.status !== "signed_in" || snapshot.userId !== expected.userId) throw new TenantAccessError();
  }
  return async () => {
    check();
    const token = await auth.getAccessToken();
    check();
    return token;
  };
}
