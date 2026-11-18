import { describe, expect, it, vi } from "vitest";
import { ApiConfigurationError, createLocationApiClient } from "./index.js";

const id = "f44dd590-28fa-42bf-8880-ebc4405f38f3";
describe("read-only geographic client", () => {
  it("uses fixed nested paths, cancellation and credential-free reads", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json([]));
    const api = createLocationApiClient({ baseUrl: "https://api.example.test", fetchImpl });
    const controller = new AbortController();
    await api.getRegions({ signal: controller.signal });
    await api.getDistricts(id);
    await api.getTownships(id);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.example.test/api/v1/locations/regions",
      `https://api.example.test/api/v1/locations/regions/${id}/districts`,
      `https://api.example.test/api/v1/locations/districts/${id}/townships`
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    }
    expect(Object.keys(api).sort()).toEqual(["getDistricts", "getRegions", "getTownships"]);
  });
  it.each(["../other", "", "not-an-id", `${id}?tenant=other`])("rejects invalid parent %s before fetching", value => {
    const fetchImpl = vi.fn<typeof fetch>();
    const api = createLocationApiClient({ baseUrl: "https://api.example.test", fetchImpl });
    expect(() => api.getDistricts(value)).toThrow(ApiConfigurationError);
    expect(() => api.getTownships(value)).toThrow(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
