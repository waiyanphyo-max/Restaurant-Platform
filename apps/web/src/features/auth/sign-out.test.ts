import { describe, expect, it, vi } from "vitest";
import { signOutAndRedirect } from "./sign-out";

describe("signOutAndRedirect", () => {
  it("clears the SDK session before sending the user to login", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const redirect = vi.fn();
    const clearAppState = vi.fn();
    await signOutAndRedirect(signOut, redirect, "/workspace?view=orders", clearAppState);
    expect(signOut).toHaveBeenCalledOnce();
    expect(clearAppState).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/login?reason=signed-out&next=%2Fworkspace%3Fview%3Dorders");
  });

  it("does not redirect when SDK sign-out fails", async () => {
    const redirect = vi.fn();
    await expect(signOutAndRedirect(async () => ({ error: new Error("failed") }), redirect, "/workspace"))
      .rejects.toThrow("failed");
    expect(redirect).not.toHaveBeenCalled();
  });
});
