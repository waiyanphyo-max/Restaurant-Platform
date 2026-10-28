import { describe, expect, it, vi } from "vitest";
import { ApiError, performApiRequest } from "./api-request";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("performApiRequest", () => {
  it("does not make a protected request without an SDK session", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const authClient = {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      refreshSession: vi.fn(),
    };

    await expect(performApiRequest("/api/v1/my/restaurants", {}, {
      apiBaseUrl: "http://api.example",
      authClient,
      fetcher,
    })).rejects.toMatchObject({ message: "Sign in to continue.", status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(authClient.refreshSession).not.toHaveBeenCalled();
  });

  it("uses one SDK refresh and retries a protected 401 once", async () => {
    const authClient = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-old-token" } }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-new-token" } }, error: null }),
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(performApiRequest("/api/v1/my/restaurants", {}, {
      apiBaseUrl: "http://api.example",
      authClient,
      fetcher,
    })).resolves.toEqual({ ok: true });

    expect(authClient.refreshSession).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer fake-old-token");
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer fake-new-token");
  });

  it("expires the local session after a refreshed request still returns 401 and never loops", async () => {
    const authClient = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-token" } }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-refreshed-token" } }, error: null }),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: "still expired" }, 401));
    const onSessionExpired = vi.fn();

    await expect(performApiRequest("/api/v1/orders", {}, {
      apiBaseUrl: "http://api.example",
      authClient,
      fetcher,
      onSessionExpired,
    })).rejects.toMatchObject({ message: "Your session expired. Sign in again to continue.", status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(authClient.refreshSession).toHaveBeenCalledOnce();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("does not put a bearer token on a public endpoint or require a session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ menu: [] }));
    const authClient = {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    };

    await expect(performApiRequest("/api/v1/public/restaurants/id/menu", {
      headers: { Authorization: "Bearer caller-token" },
    }, {
      apiBaseUrl: "http://api.example",
      authClient,
      fetcher,
    })).resolves.toEqual({ menu: [] });
    expect(authClient.getSession).not.toHaveBeenCalled();
    expect(authClient.refreshSession).not.toHaveBeenCalled();
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has("authorization")).toBe(false);
  });

  it("does not send a session token to a host outside the configured backend origin", async () => {
    const authClient = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-token" } }, error: null }),
      refreshSession: vi.fn(),
    };
    const fetcher = vi.fn<typeof fetch>();

    await expect(performApiRequest("https://attacker.example/api/v1/private", {}, {
      apiBaseUrl: "https://api.example",
      authClient,
      fetcher,
    })).rejects.toThrow("configured backend API origin");
    expect(authClient.getSession).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose bearer values in backend error messages", async () => {
    const authClient = {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "fake-token" } }, error: null }),
      refreshSession: vi.fn(),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: "failed Bearer fake-token" }, 403));

    try {
      await performApiRequest("/api/v1/private", {}, { apiBaseUrl: "http://api.example", authClient, fetcher });
      throw new Error("Expected request to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(ApiError);
      expect((cause as Error).message).not.toContain("fake-token");
    }
  });
});
