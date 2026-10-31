import { describe, expect, it, vi } from "vitest";
import {
  createNativeSessionController,
  NativeAuthError,
  type AppLifecyclePort,
  type NativeAuthPort,
  type NativeSession
} from "./session";

const firstUser = "b99e736d-e6a2-4510-b1e1-7460e16f5421";
const secondUser = "8254982b-7f82-413b-8c98-d26f558f4968";

function session(userId = firstUser, token = "access-token", expiresAt = 2_000): NativeSession {
  return { user: { id: userId }, access_token: token, expires_at: expiresAt };
}

function setup(initial: NativeSession | null, clock = () => 1_000_000) {
  let current = initial;
  let authListener: (value: NativeSession | null) => void = () => {};
  let appListener: (state: string) => void = () => {};
  const removeAppListener = vi.fn();
  const auth: NativeAuthPort = {
    getSession: vi.fn(async () => current),
    signInWithPassword: vi.fn(async () => {
      current = session();
      authListener(current);
      return current;
    }),
    signOut: vi.fn(async () => {
      current = null;
      authListener(null);
    }),
    refreshSession: vi.fn(async () => {
      current = session(firstUser, "refreshed-token", 4_000);
      authListener(current);
      return current;
    }),
    onSessionChange(listener) {
      authListener = listener;
      return vi.fn();
    },
    startAutoRefresh: vi.fn(),
    stopAutoRefresh: vi.fn()
  };
  const lifecycle: AppLifecyclePort = {
    currentState: "active",
    addEventListener(_event, listener) {
      appListener = listener;
      return { remove: removeAppListener };
    }
  };
  return {
    auth,
    controller: createNativeSessionController(auth, lifecycle, clock),
    appState: (state: string) => appListener(state),
    removeAppListener,
    setSession: (value: NativeSession | null) => { current = value; authListener(value); }
  };
}

describe("native session lifecycle", () => {
  it("restores, signs in, and signs out without exposing credentials in UI state", async () => {
    const { controller, auth } = setup(null);
    expect(await controller.restore()).toEqual({ status: "signed_out" });
    expect(await controller.signInWithPassword(" user@example.test ", "password"))
      .toEqual({ status: "signed_in", userId: firstUser });
    expect(auth.signInWithPassword).toHaveBeenCalledWith("user@example.test", "password");
    expect(await controller.getAccessToken()).toBe("access-token");
    await controller.signOut();
    expect(await controller.getAccessToken()).toBeNull();
    controller.dispose();
  });

  it("refreshes a near-expiry token once for concurrent protected requests", async () => {
    const { controller, auth } = setup(session(firstUser, "old-token", 1_050));
    const tokens = await Promise.all([controller.getAccessToken(), controller.getAccessToken()]);
    expect(tokens).toEqual(["refreshed-token", "refreshed-token"]);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("rejects a refresh that changes the Auth UUID", async () => {
    const { controller, auth, setSession } = setup(session(firstUser, "old-token", 1_050));
    auth.refreshSession = vi.fn(async () => session(secondUser, "wrong-user-token", 4_000));
    await expect(controller.getAccessToken()).rejects.toEqual(new NativeAuthError("identity_changed"));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    setSession(null);
    expect(await controller.getAccessToken()).toBeNull();
    controller.dispose();
  });

  it("pauses refresh in the background and discards an in-flight refresh after sign-out", async () => {
    const { controller, auth, appState, removeAppListener } = setup(session(firstUser, "old-token", 1_050));
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    appState("background");
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    appState("active");
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);

    let finishRefresh!: (value: NativeSession | null) => void;
    auth.refreshSession = vi.fn(() => new Promise<NativeSession | null>((resolve) => { finishRefresh = resolve; }));
    const token = controller.getAccessToken();
    await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
    await controller.signOut();
    finishRefresh(session(firstUser, "stale-token", 4_000));
    expect(await token).toBeNull();
    controller.dispose();
    expect(removeAppListener).toHaveBeenCalledTimes(1);
  });

  it("discards late SDK session events after local sign-out", async () => {
    const { controller, setSession } = setup(session());
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.restore();
    await controller.signOut();
    setSession(session(firstUser, "late-token", 4_000));
    expect(await controller.restore()).toEqual({ status: "signed_out" });
    expect(await controller.getAccessToken()).toBeNull();
    expect(listener.mock.lastCall?.[0]).toEqual({ status: "signed_out" });
    controller.dispose();
  });

  it("blocks an automatic SDK refresh event that changes identity", async () => {
    const { controller, setSession } = setup(session());
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.restore();
    setSession(session(secondUser, "wrong-user-token", 4_000));
    expect(listener.mock.lastCall?.[0]).toEqual({ status: "signed_out" });
    await expect(controller.getAccessToken()).rejects.toEqual(new NativeAuthError("identity_changed"));
    await controller.signOut();
    expect(await controller.signInWithPassword("user@example.test", "password"))
      .toEqual({ status: "signed_in", userId: firstUser });
    controller.dispose();
  });
});
