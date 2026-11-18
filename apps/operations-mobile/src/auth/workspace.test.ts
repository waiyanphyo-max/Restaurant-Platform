import { describe, expect, it, vi } from "vitest";
import { TenantAccessError } from "@restaurant-platform/api-client";
import { retainWorkspace, scopedOperationsToken, type VerifiedWorkspace } from "./workspace";
import type { NativeSessionController } from "./session";

const owner: VerifiedWorkspace = { status: "ready", userId: "owner-a", membership: {
  restaurantId: "restaurant-a", role: "OWNER", active: true, name: "Restaurant", slug: "restaurant",
} };

describe("temporary workspace retention", () => {
  it("retains the same product component scope during picker revalidation, without turning the real state ready", () => {
    const checking = { status: "checking_membership" as const, userId: owner.userId };
    expect(retainWorkspace(owner, checking)).toBe(owner);
    expect(checking.status).toBe("checking_membership");
    expect(retainWorkspace(null, checking)).toBeNull();
  });

  it("immediately clears retained state on logout, denial, offline or a changed identity", () => {
    for (const state of [{ status: "signed_out" as const }, { status: "denied" as const, message: "revoked" },
      { status: "offline" as const, message: "offline" }, { status: "error" as const, message: "failure" },
      { status: "checking_membership" as const, userId: "owner-b" }]) {
      expect(retainWorkspace(owner, state)).toBeNull();
    }
  });

  it("returns the fresh membership when its role changes, allowing the workspace key to discard old state", () => {
    const changed = { ...owner, membership: { ...owner.membership, role: "STAFF" as const } };
    expect(retainWorkspace(owner, changed)).toBe(changed);
  });
});

describe("picker request identity binding", () => {
  it("checks raw verified access both before and after reading the bearer", async () => {
    const assertCurrentAccess = vi.fn();
    const auth = { getSnapshot: vi.fn(() => ({ status: "signed_in", userId: "owner-a" })),
      getAccessToken: vi.fn(async () => "owner-token") } as unknown as NativeSessionController;
    await expect(scopedOperationsToken(auth, { userId: "owner-a", assertCurrentAccess })()).resolves.toBe("owner-token");
    expect(assertCurrentAccess).toHaveBeenCalledTimes(2);
  });

  it("never reads another account's token when the account changed while the picker was open", async () => {
    const getAccessToken = vi.fn(async () => "other-token");
    const auth = { getSnapshot: () => ({ status: "signed_in", userId: "owner-b" }), getAccessToken } as unknown as NativeSessionController;
    await expect(scopedOperationsToken(auth, { userId: "owner-a", assertCurrentAccess: vi.fn() })()).rejects.toBeInstanceOf(TenantAccessError);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("discards a token when identity or role changes during its asynchronous read", async () => {
    let finish!: (token: string) => void;
    let userId = "owner-a";
    let permitted = true;
    const auth = { getSnapshot: () => ({ status: "signed_in", userId }),
      getAccessToken: () => new Promise<string>(resolve => { finish = resolve; }) } as unknown as NativeSessionController;
    for (const change of [() => { userId = "owner-b"; }, () => { permitted = false; }]) {
      userId = "owner-a"; permitted = true;
      const result = scopedOperationsToken(auth, { userId: "owner-a", assertCurrentAccess: () => {
        if (!permitted) throw new TenantAccessError();
      } })();
      const rejection = expect(result).rejects.toBeInstanceOf(TenantAccessError);
      change(); finish("late-token");
      await rejection;
    }
  });
});
