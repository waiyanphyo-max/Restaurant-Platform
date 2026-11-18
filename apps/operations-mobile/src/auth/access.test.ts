import { describe, expect, it, vi } from "vitest";
import { ApiHttpError, ApiNetworkError, TenantAccessError } from "@restaurant-platform/api-client";
import type { MyRestaurantResponse } from "@restaurant-platform/shared-types";
import { createOperationsAccessController } from "./access";
import type { AuthSnapshot, NativeSessionController } from "./session";

const restaurantId = "b99e736d-e6a2-4510-b1e1-7460e16f5421";
const userId = "8254982b-7f82-413b-8c98-d26f558f4968";
const membership: MyRestaurantResponse = { restaurantId, role: "OWNER", active: true, name: "Restaurant", slug: "restaurant" };

function setup(load = vi.fn(async (): Promise<MyRestaurantResponse> => membership), cleanupDevice?: () => Promise<void>) {
  let snapshot: AuthSnapshot = { status: "signed_in", userId };
  let listener: (snapshot: AuthSnapshot) => void = () => {};
  const auth = {
    restore: vi.fn(async () => snapshot),
    subscribe(next: typeof listener) { listener = next; return vi.fn(); },
    signOut: vi.fn(async () => { snapshot = { status: "signed_out" }; listener(snapshot); })
  } as unknown as NativeSessionController;
  return {
    load, auth,
    controller: createOperationsAccessController(auth, { getConfiguredMembership: load }, restaurantId, cleanupDevice),
    emit(next: AuthSnapshot) { snapshot = next; listener(next); }
  };
}

describe("server-validated Operations access", () => {
  it("waits for fresh membership after the picker, keeping real access locked until its response", async () => {
    const { controller, load } = setup();
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
    controller.suspend();
    let verified = false;
    const pending = controller.verifyAccess(userId, "OWNER").then(() => { verified = true; });
    expect(() => controller.assertAccess(userId, "OWNER")).toThrow(TenantAccessError);
    let finish!: (value: MyRestaurantResponse) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const resumed = controller.retryMembership();
    await Promise.resolve();
    expect(verified).toBe(false);
    expect(controller.getState().status).toBe("checking_membership");
    finish(membership);
    await resumed; await pending;
    expect(verified).toBe(true);
    expect(() => controller.assertAccess(userId, "OWNER")).not.toThrow();
    controller.dispose();
  });

  it("freshly checks membership even when the picker produces no background event", async () => {
    const { controller, load } = setup();
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
    await controller.verifyAccess(userId, "OWNER");
    expect(load).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("rejects a pending picker operation after revoked or changed-role membership", async () => {
    for (const next of [null, { ...membership, role: "STAFF" }]) {
      const { controller, load } = setup();
      await controller.start();
      await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
      controller.suspend();
      const rejection = expect(controller.verifyAccess(userId, "OWNER")).rejects.toBeInstanceOf(TenantAccessError);
      if (next) load.mockResolvedValueOnce(next); else load.mockRejectedValueOnce(new TenantAccessError());
      await controller.retryMembership();
      await rejection;
      controller.dispose();
    }
  });

  it("cancels pending picker access on logout, different identity, offline and disposal", async () => {
    for (const event of ["logout", "identity", "offline", "dispose"]) {
      const { controller, emit } = setup();
      await controller.start();
      await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
      controller.suspend();
      const rejection = expect(controller.verifyAccess(userId, "OWNER")).rejects.toBeInstanceOf(TenantAccessError);
      if (event === "logout") await controller.signOut();
      else if (event === "identity") emit({ status: "signed_in", userId: "different-user" });
      else if (event === "offline") controller.setOnline(false);
      else controller.dispose();
      await rejection;
      controller.dispose();
    }
  });

  it("keeps workspace locked until Spring returns configured active membership", async () => {
    let finish!: (value: MyRestaurantResponse) => void;
    const { controller } = setup(vi.fn(() => new Promise(resolve => { finish = resolve; })));
    await controller.start();
    expect(controller.getState().status).toBe("checking_membership");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish(membership);
    await vi.waitFor(() => expect(controller.getState()).toEqual({ status: "ready", userId, membership }));
    controller.dispose();
  });

  it.each([
    { ...membership, restaurantId: userId }, { ...membership, active: false },
    { ...membership, role: "CUSTOMER" }, { ...membership, role: "PLATFORM_ADMIN" }
  ])("fails closed for invalid membership $role/$active/$restaurantId", async candidate => {
    const { controller } = setup(vi.fn(async () => candidate));
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("denied"));
    controller.dispose();
  });

  it("does not repeat membership lookups for repeated same-identity SDK events", async () => {
    const { controller, load, emit } = setup();
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
    emit({ status: "signed_in", userId });
    emit({ status: "signed_in", userId });
    expect(load).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("ready");
    controller.dispose();
  });

  it("drops a late successful membership request after logout", async () => {
    let finish!: (value: MyRestaurantResponse) => void;
    const { controller } = setup(vi.fn(() => new Promise(resolve => { finish = resolve; })));
    await controller.start();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await controller.signOut();
    finish(membership);
    await Promise.resolve();
    expect(controller.getState().status).toBe("signed_out");
    controller.dispose();
  });

  it("locks the workspace and attempts device cleanup before clearing the bearer session", async () => {
    let failCleanup!: (error: Error) => void;
    const cleanup = vi.fn(() => new Promise<void>((_resolve, reject) => { failCleanup = reject; }));
    const { controller, auth } = setup(undefined, cleanup);
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));

    const logout = controller.signOut();
    expect(controller.getState().status).toBe("loading");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(auth.signOut).not.toHaveBeenCalled();

    failCleanup(new Error("offline"));
    await logout;
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe("signed_out");
    controller.dispose();
  });

  it("discards a membership response that arrives after connectivity was lost", async () => {
    let finish!: (value: MyRestaurantResponse) => void;
    const { controller } = setup(vi.fn(() => new Promise(resolve => { finish = resolve; })));
    await controller.start();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    controller.setOnline(false);
    finish(membership);
    await Promise.resolve();
    expect(controller.getState().status).toBe("offline");
    controller.dispose();
  });

  it("clears access while backgrounded and detects revoked membership on foreground recheck", async () => {
    const { controller, load } = setup();
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
    controller.suspend();
    expect(controller.getState().status).toBe("checking_membership");
    load.mockRejectedValueOnce(new TenantAccessError());
    await controller.retryMembership();
    expect(controller.getState().status).toBe("denied");
    controller.dispose();
  });

  it("revokes access on known offline and checks membership afresh on reconnect", async () => {
    const { controller, load } = setup();
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe("ready"));
    controller.setOnline(false);
    expect(controller.getState().status).toBe("offline");
    await controller.retryMembership();
    expect(load).toHaveBeenCalledTimes(1);
    load.mockRejectedValueOnce(new TenantAccessError());
    controller.setOnline(true);
    expect(controller.getState().status).toBe("checking_membership");
    await vi.waitFor(() => expect(controller.getState().status).toBe("denied"));
    controller.dispose();
  });

  it.each([
    [new ApiNetworkError(), "offline"], [new ApiHttpError(403, "FORBIDDEN"), "denied"],
    [new ApiHttpError(401, "UNAUTHORIZED"), "signed_out"], [new Error("unexpected"), "error"]
  ])("does not grant access when membership checking fails", async (error, status) => {
    const { controller } = setup(vi.fn(async () => { throw error; }));
    await controller.start();
    await vi.waitFor(() => expect(controller.getState().status).toBe(status));
    controller.dispose();
  });
});
