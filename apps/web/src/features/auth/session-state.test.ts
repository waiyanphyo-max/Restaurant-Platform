import { describe, expect, it } from "vitest";
import { authSessionReducer, initialAuthSessionState } from "./session-state";

describe("auth session state", () => {
  it("restores a signed-in user without copying the SDK token into app state", () => {
    const user = { id: "user-id", email: "owner@example.test" } as never;
    const state = authSessionReducer(initialAuthSessionState, { type: "session", user });
    expect(state).toEqual({ user, loading: false, configurationError: "" });
    expect(state).not.toHaveProperty("access_token");
    expect(state).not.toHaveProperty("refresh_token");
  });

  it("restores a signed-out session and clears user-specific state on sign-out", () => {
    const signedIn = authSessionReducer(initialAuthSessionState, {
      type: "session",
      user: { id: "user-id" } as never,
    });
    expect(authSessionReducer(signedIn, { type: "session", user: null })).toEqual({
      user: null,
      loading: false,
      configurationError: "",
    });
    expect(authSessionReducer(signedIn, { type: "signed-out" })).toEqual({
      user: null,
      loading: false,
      configurationError: "",
    });
  });

  it("exposes missing configuration without entering a permanent loading state", () => {
    expect(authSessionReducer(initialAuthSessionState, {
      type: "configuration-error",
      message: "Supabase is not configured.",
    })).toEqual({ user: null, loading: false, configurationError: "Supabase is not configured." });
  });
});
