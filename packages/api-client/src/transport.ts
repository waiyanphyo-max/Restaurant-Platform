import type { ApiErrorResponse, ApiFieldViolation } from "@restaurant-platform/shared-types";
import {
  ApiCancelledError,
  ApiConfigurationError,
  ApiHttpError,
  ApiNetworkError,
  ApiProtocolError,
  ApiTimeoutError,
  MissingAccessTokenError
} from "./errors.js";
import { requireHeaderValue } from "./tenant.js";

export type AccessTokenProvider = () => string | null | Promise<string | null>;

export interface ApiTransportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AuthenticatedApiTransportOptions extends ApiTransportOptions {
  getAccessToken: AccessTokenProvider;
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestSpec {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  options?: ApiRequestOptions;
  /** Only GETs or explicit idempotency-key writes may opt into a retry. */
  retryTransient?: boolean;
}

export interface ApiTransport {
  request<T>(spec: RequestSpec): Promise<T>;
}

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "10.0.2.2"]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function requireApiOrigin(baseUrl: string): URL {
  if (typeof baseUrl !== "string" || baseUrl.trim() !== baseUrl) {
    throw new ApiConfigurationError("API base URL must be a trimmed absolute origin");
  }
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new ApiConfigurationError("API base URL must be an absolute origin"); }
  const localHttp = url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || !url.hostname) {
    throw new ApiConfigurationError("API base URL must be an HTTPS origin or an approved local development origin");
  }
  return url;
}

function requireTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 120_000) {
    throw new ApiConfigurationError("timeoutMs must be an integer from 1 to 120000");
  }
  return value;
}

function targetUrl(origin: URL, spec: RequestSpec): URL {
  if (!spec.path.startsWith("/api/v1/") || /[?#]/.test(spec.path) ||
      spec.path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new ApiConfigurationError("API path must be a fixed /api/v1/ path without query or fragment");
  }
  const target = new URL(spec.path, origin);
  if (target.origin !== origin.origin) throw new ApiConfigurationError("API request changed origin");
  for (const [key, value] of Object.entries(spec.query ?? {})) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  return target;
}

function parsedRetryAfter(value: string | null): number | undefined {
  if (value === null || !value.trim()) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function isFieldViolation(value: unknown): value is ApiFieldViolation {
  return !!value && typeof value === "object" &&
    typeof (value as ApiFieldViolation).field === "string" &&
    typeof (value as ApiFieldViolation).message === "string";
}

async function httpError(response: Response): Promise<ApiHttpError> {
  let body: Partial<ApiErrorResponse> | null = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      const candidate: unknown = await response.json();
      if (candidate && typeof candidate === "object") body = candidate as Partial<ApiErrorResponse>;
    } catch { /* A malformed error body still preserves the HTTP status. */ }
  }
  const code = typeof body?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(body.code)
    ? body.code : `HTTP_${response.status}`;
  const errors = Array.isArray(body?.errors) ? body.errors.filter(isFieldViolation) : [];
  const message = typeof body?.message === "string" ? body.message : undefined;
  return new ApiHttpError(response.status, code, errors, message,
    parsedRetryAfter(response.headers.get("retry-after")));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new ApiCancelledError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new ApiCancelledError()); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Internal transport. Public and authenticated factories are distinct at the package boundary. */
export function createTransport(options: ApiTransportOptions, getAccessToken?: AccessTokenProvider): ApiTransport {
  const origin = requireApiOrigin(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultTimeout = requireTimeout(options.timeoutMs ?? 15_000);

  async function attempt<T>(spec: RequestSpec, target: URL): Promise<T> {
    if (spec.options?.signal?.aborted) throw new ApiCancelledError();
    const timeoutMs = requireTimeout(spec.options?.timeoutMs ?? defaultTimeout);
    let body: string | undefined;
    try { body = spec.body === undefined ? undefined : JSON.stringify(spec.body); } catch {
      throw new ApiConfigurationError("Request body must be serializable JSON");
    }
    const headers = new Headers(spec.headers);
    if (headers.has("Authorization")) {
      throw new ApiConfigurationError("Authorization is managed only by the authenticated transport");
    }
    if (getAccessToken) {
      const token = await getAccessToken();
      if (!token) throw new MissingAccessTokenError();
      headers.set("Authorization", `Bearer ${requireHeaderValue(token, "access token")}`);
    }
    if (spec.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("Accept", "application/json");

    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    if (spec.options?.signal?.aborted) throw new ApiCancelledError();
    spec.options?.signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); },
      timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(target, {
        method: spec.method,
        headers,
        body,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      if (response.redirected || (response.url && new URL(response.url).origin !== origin.origin)) {
        throw new ApiProtocolError();
      }
      if (!response.ok) throw await httpError(response);
      if (response.status === 204) return undefined as T;
      try { return await response.json() as T; } catch {
        if (timedOut || spec.options?.signal?.aborted) throw new Error("aborted");
        throw new ApiProtocolError();
      }
    } catch (error) {
      if (timedOut) throw new ApiTimeoutError();
      if (spec.options?.signal?.aborted) throw new ApiCancelledError();
      if (error instanceof ApiHttpError || error instanceof ApiProtocolError) throw error;
      throw new ApiNetworkError();
    } finally {
      clearTimeout(timeout);
      spec.options?.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    async request<T>(spec: RequestSpec): Promise<T> {
      const target = targetUrl(origin, spec);
      const canRetry = spec.retryTransient === true &&
        (spec.method === "GET" || (spec.method === "POST" &&
          Object.entries(spec.headers ?? {}).some(([key, value]) =>
            key.toLowerCase() === "idempotency-key" && !!value)));
      for (let index = 0; ; index++) {
        try {
          return await attempt<T>(spec, target);
        } catch (error) {
          if (!canRetry || index >= 1 || spec.options?.signal?.aborted ||
              (error instanceof ApiHttpError && (error.retryAfterMs ?? 0) > 2000) ||
              !(error instanceof ApiNetworkError || error instanceof ApiTimeoutError ||
                (error instanceof ApiHttpError && RETRYABLE_STATUS.has(error.status)))) {
            throw error;
          }
          await delay(error instanceof ApiHttpError ? error.retryAfterMs ?? 150 : 150, spec.options?.signal);
        }
      }
    }
  };
}

export function createAuthenticatedTransport(options: AuthenticatedApiTransportOptions): ApiTransport {
  if (typeof options.getAccessToken !== "function") {
    throw new ApiConfigurationError("An authenticated client requires an access-token provider");
  }
  return createTransport(options, options.getAccessToken);
}
