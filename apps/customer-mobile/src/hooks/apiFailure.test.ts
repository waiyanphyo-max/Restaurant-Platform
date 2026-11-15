import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiConfigurationError, ApiHttpError, ApiNetworkError, ApiProtocolError, ApiTimeoutError, MissingAccessTokenError } from "@restaurant-platform/api-client";
import { accountFailureTitle, apiFailure, apiFailureMessage, logApiFailure } from "./apiFailure";

const t = (english: string) => english;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("safe customer API feedback", () => {
  it.each([
    [new MissingAccessTokenError(), "expired", "verified"],
    [new ApiHttpError(401, "EXPIRED"), "expired", "verified"],
    [new ApiHttpError(403, "FORBIDDEN"), "forbidden", "permission"],
    [new ApiHttpError(404, "CUSTOMER_PROFILE_NOT_FOUND"), "missing_profile", "not ready"],
    [new ApiHttpError(429, "RATE_LIMITED"), "rate_limited", "Wait"],
    [new ApiHttpError(500, "DATABASE_ERROR"), "server", "temporarily"],
    [new ApiHttpError(400, "VALIDATION_ERROR"), "validation", "entries"],
    [new ApiNetworkError(), "network", "connection"],
    [new ApiTimeoutError(), "network", "connection"],
    [new ApiProtocolError(), "protocol", "unexpected"],
    [new ApiConfigurationError("Private configuration"), "configuration", "settings"]
  ] as const)("distinguishes %s without displaying internal details", (error, kind, message) => {
    const failure = apiFailure(error, "profile");
    expect(failure.kind).toBe(kind);
    expect(apiFailureMessage(failure, t)).toContain(message);
    expect(apiFailureMessage(failure, t)).not.toContain("Private configuration");
  });

  it("logs operation and stable code only, excluding raw server messages, URLs and customer identifiers", () => {
    vi.stubGlobal("__DEV__", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = apiFailure(new ApiHttpError(500, "DATABASE_ERROR", [{ field: "email", message: "private@example.test" }], "private-token"), "order:private-order-id");
    logApiFailure(failure);
    expect(warn).toHaveBeenCalledWith("[customer-api]", { kind: "server", operation: "order", status: 500, code: "DATABASE_ERROR" });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private/);
    expect(apiFailure(new Error("password"), "private@example.test")).toEqual({ kind: "unknown", operation: "query" });
  });

  it("never emits diagnostics in production", () => {
    vi.stubGlobal("__DEV__", false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logApiFailure(apiFailure(new ApiNetworkError(), "account"));
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "AuthRetryableFetchError", status: 0, message: "private refresh token" }, "network"],
    [{ name: "NativeAuthError", code: "invalid_session", message: "private JWT" }, "expired"],
    [{ name: "AuthApiError", code: "refresh_token_not_found", status: 400 }, "expired"],
    [{ name: "AuthApiError", code: "user_banned", status: 403 }, "forbidden"]
  ] as const)("classifies token refresh errors before API fetch: %j", (error, kind) => {
    const failure = apiFailure(error, "profile");
    expect(failure.kind).toBe(kind);
    expect(JSON.stringify(failure)).not.toContain("private");
    expect(apiFailureMessage(failure, t)).not.toContain("private");
  });

  it("names the failed account request without exposing the backend error body", () => {
    expect(accountFailureTitle(apiFailure(new ApiNetworkError(), "profile"), t)).toBe("Could not load account details");
    expect(accountFailureTitle(apiFailure(new ApiNetworkError(), "addresses"), t)).toBe("Could not load saved addresses");
  });
});
