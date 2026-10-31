import type { ApiFieldViolation } from "@restaurant-platform/shared-types";

/** The server's stable error code is preserved without exposing request credentials. */
export class ApiHttpError extends Error {
  readonly name = "ApiHttpError";

  constructor(
    readonly status: number,
    readonly code: string,
    readonly fieldErrors: ApiFieldViolation[] = [],
    readonly serverMessage?: string,
    readonly retryAfterMs?: number
  ) {
    super(`API request failed with HTTP ${status} (${code})`);
  }
}

export class ApiNetworkError extends Error {
  readonly name = "ApiNetworkError";
  constructor() { super("Network request failed"); }
}

export class ApiTimeoutError extends Error {
  readonly name = "ApiTimeoutError";
  constructor() { super("API request timed out"); }
}

export class ApiCancelledError extends Error {
  readonly name = "ApiCancelledError";
  constructor() { super("API request was cancelled"); }
}

export class ApiProtocolError extends Error {
  readonly name = "ApiProtocolError";
  constructor() { super("API response did not match the expected protocol"); }
}

export class ApiConfigurationError extends Error {
  readonly name = "ApiConfigurationError";
  constructor(message: string) { super(message); }
}

export class MissingAccessTokenError extends Error {
  readonly name = "MissingAccessTokenError";
  constructor() { super("An authenticated API request requires a current Supabase access token"); }
}

export class TenantAccessError extends Error {
  readonly name = "TenantAccessError";
  constructor() { super("The current account has no active membership in this restaurant"); }
}
