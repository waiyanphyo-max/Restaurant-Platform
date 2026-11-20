import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ query: vi.fn(), getMenu: vi.fn(), result: { state: { status: "loading" }, reload: vi.fn() },
  tenant: { restaurantId: "11111111-1111-4111-8111-111111111111", environment: "development", apiBaseUrl: "https://api-a.example.test" } }));
vi.mock("../../api", () => ({ getCustomerPublicApi: () => ({ getPublicMenu: harness.getMenu }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: harness.query }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => harness.tenant }));
import { CustomerMenuProvider, usePublicMenu } from "./MenuProvider";

describe("shared Customer menu query", () => {
  beforeEach(() => { vi.stubGlobal("React", React); harness.query.mockReset().mockReturnValue(harness.result); harness.getMenu.mockReset(); });
  it("shares one scoped query across consumers and forwards cancellation to the fixed public client", async () => {
    const seen: unknown[] = [];
    function Consumer() { seen.push(usePublicMenu()); return null; }
    renderToStaticMarkup(<CustomerMenuProvider><Consumer /><Consumer /></CustomerMenuProvider>);
    expect(harness.query).toHaveBeenCalledOnce();
    expect(seen).toEqual([harness.result, harness.result]);
    const [read, key, retainDuringRefresh] = harness.query.mock.calls[0];
    expect(key).toContain(harness.tenant.restaurantId); expect(key).toContain(harness.tenant.apiBaseUrl);
    expect(retainDuringRefresh).toBe(true);
    const controller = new AbortController();
    await read(controller.signal);
    expect(harness.getMenu).toHaveBeenCalledExactlyOnceWith({ signal: controller.signal });
  });

  it("requires the shared provider rather than silently creating extra requests", () => {
    function Outside() { usePublicMenu(); return null; }
    expect(() => renderToStaticMarkup(<Outside />)).toThrow("CustomerMenuProvider is required");
    expect(harness.query).not.toHaveBeenCalled();
  });
});
