import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ refs: [] as { current: unknown }[], cursor: 0,
  state: { status: "ready", userId: "owner-a", membership: { restaurantId: "restaurant-a", role: "OWNER" } } as Record<string, unknown>,
  workspace: null as null | Record<string, unknown>,
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useRef(initial: unknown) {
  const i = h.cursor++; return h.refs[i] ?? (h.refs[i] = { current: initial });
} }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: h.state, workspace: h.workspace }) }));
import { createInvitationRecovery, InvitationRecoveryProvider } from "./InvitationRecoveryProvider";

function provider() {
  h.cursor = 0;
  return InvitationRecoveryProvider({ children: null }).props.value as ReturnType<typeof createInvitationRecovery>;
}
beforeEach(() => { vi.stubGlobal("React", React); h.refs = []; h.cursor = 0; h.workspace = null; h.state = { status: "ready", userId: "owner-a", membership: { restaurantId: "restaurant-a", role: "OWNER" } }; });

describe("invitation recovery session memory", () => {
  it("normalizes attempted emails and retains in-flight, uncertain and provider-confirmed attempts", () => {
    const recovery = createInvitationRecovery(); recovery.record(" Team@Example.test ", "sending");
    expect(recovery.get("TEAM@example.test")?.state).toBe("sending");
    recovery.record("team@example.test", "uncertain"); expect(recovery.list()).toEqual([{ email: "team@example.test", state: "uncertain" }]);
    recovery.record("team@example.test", "confirmed"); expect(recovery.get("team@example.test")?.state).toBe("confirmed");
    recovery.rejected("TEAM@example.test"); expect(recovery.list()).toEqual([]);
  });
  it("survives same-workspace route remount and transient membership checking", () => {
    const recovery = provider(); recovery.record("pending@example.test", "sending"); expect(provider()).toBe(recovery);
    h.workspace = h.state; h.state = { status: "checking" }; expect(provider()).toBe(recovery); expect(provider().get("pending@example.test")).toBeDefined();
  });
  it.each(["user", "tenant", "role"])("replaces memory on %s change and never restores A after A to B to A", dimension => {
    const original = h.state; const recovery = provider(); recovery.record("uncertain@example.test", "uncertain");
    const membership = { restaurantId: dimension === "tenant" ? "restaurant-b" : "restaurant-a", role: dimension === "role" ? "MANAGER" : "OWNER" };
    h.state = { status: "ready", userId: dimension === "user" ? "owner-b" : "owner-a", membership };
    expect(provider().list()).toEqual([]); h.state = original; expect(provider().list()).toEqual([]); expect(provider()).not.toBe(recovery);
  });
  it.each(["signed_out", "denied"])("clears invitations on %s before the same account returns", status => {
    const original = h.state; provider().record("uncertain@example.test", "uncertain"); h.state = { status }; h.workspace = null;
    expect(provider().list()).toEqual([]); h.state = original; expect(provider().list()).toEqual([]);
  });
});
