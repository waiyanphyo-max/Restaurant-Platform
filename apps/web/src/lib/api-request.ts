import { getSupabaseBrowserClient } from "./supabase/client";
import { notifyAuthSessionExpired } from "./supabase/session-events";

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

type SessionToken = { access_token: string } | null;
type AuthClient = {
  getSession: () => Promise<{ data: { session: SessionToken }; error: unknown }>;
  refreshSession: () => Promise<{ data: { session: SessionToken }; error: unknown }>;
};

export type ApiRequestOptions = {
  apiBaseUrl?: string;
  auth?: "required" | "public";
};

type ApiRequestRuntime = ApiRequestOptions & {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  onSessionExpired?: () => void;
};

function apiUrl(path: string, baseUrl?: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = (baseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080")
    .trim().replace(/\/+$/, "");
  if (!base) throw new ApiError("Enter the backend API URL.");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function validateApiUrl(url: string, configuredBaseUrl?: string) {
  try {
    const requestUrl = new URL(url);
    const configured = new URL(configuredBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080");
    if (!/^https?:$/.test(requestUrl.protocol) || requestUrl.username || requestUrl.password
      || requestUrl.origin !== configured.origin) {
      throw new ApiError("Requests must use the configured backend API origin.");
    }
    if ([...requestUrl.searchParams.keys()].some((key) => ["access_token", "refresh_token", "token", "token_hash"].includes(key.toLowerCase()))) {
      throw new ApiError("Authentication credentials cannot be sent in a URL.");
    }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError("The configured backend API URL is invalid.");
  }
}

function isPublicPath(url: string) {
  try {
    return new URL(url, "http://localhost").pathname.startsWith("/api/v1/public/");
  } catch {
    return false;
  }
}

function sanitizeMessage(message: string) {
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .slice(0, 500);
}

async function responseError(response: Response): Promise<ApiError> {
  if (response.status === 401) return new ApiError("Your session is no longer valid. Sign in again.", 401);

  let message = "";
  try {
    const raw = await response.text();
    const payload: unknown = raw ? JSON.parse(raw) : null;
    if (payload && typeof payload === "object") {
      const dto = payload as Record<string, unknown>;
      if (typeof dto.message === "string") message = dto.message;
      else if (typeof dto.detail === "string") message = dto.detail;
      else if (typeof dto.title === "string") message = dto.title;
    }
  } catch {
    // Keep gateway and non-JSON errors generic.
  }

  const safeMessage = message ? sanitizeMessage(message) : `The backend returned HTTP ${response.status}.`;
  return new ApiError(safeMessage, response.status);
}

function expired(runtime: ApiRequestRuntime) {
  (runtime.onSessionExpired || notifyAuthSessionExpired)();
}

export async function performApiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
  runtime: ApiRequestRuntime = {},
): Promise<T> {
  const url = apiUrl(path, runtime.apiBaseUrl);
  const publicRequest = runtime.auth === "public" || isPublicPath(url);
  validateApiUrl(url, runtime.apiBaseUrl);
  const fetcher = runtime.fetcher || fetch;
  const baseHeaders = new Headers(init.headers);
  // Callers can never supply an arbitrary bearer token. Protected calls use only the SDK session.
  baseHeaders.delete("authorization");
  if (!baseHeaders.has("Accept")) baseHeaders.set("Accept", "application/json");

  const send = async (accessToken?: string) => {
    const headers = new Headers(baseHeaders);
    headers.delete("authorization");
    if (accessToken && !publicRequest) headers.set("Authorization", `Bearer ${accessToken}`);
    return fetcher(url, { ...init, headers, cache: "no-store" });
  };

  let response: Response;
  try {
    if (publicRequest) {
      response = await send();
    } else {
      const authClient = runtime.authClient || getSupabaseBrowserClient().auth;
      const current = await authClient.getSession();
      const currentToken = current.data.session?.access_token;
      if (!currentToken) throw new ApiError("Sign in to continue.", 401);

      response = await send(currentToken);
      if (response.status === 401) {
        let refreshed: Awaited<ReturnType<AuthClient["refreshSession"]>>;
        try {
          refreshed = await authClient.refreshSession();
        } catch {
          throw new ApiError("Your session could not be refreshed. Check your connection and try again.", 401);
        }

        const refreshedToken = refreshed.data.session?.access_token;
        if (refreshed.error || !refreshedToken) {
          expired(runtime);
          throw new ApiError("Your session expired. Sign in again to continue.", 401);
        }

        // One legitimate SDK refresh and exactly one retry; never recurse on repeated 401s.
        response = await send(refreshedToken);
        if (response.status === 401) {
          expired(runtime);
          throw new ApiError("Your session expired. Sign in again to continue.", 401);
        }
      }
    }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError("Cannot reach the backend. Check the API URL, server state, and CORS configuration.");
  }

  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  if (!raw) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export function apiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  return performApiRequest<T>(path, init, options);
}
