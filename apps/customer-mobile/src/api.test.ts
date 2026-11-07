import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissingAccessTokenError } from "@restaurant-platform/api-client";

const mocks = vi.hoisted(() => ({ owner: "customer-a", token: vi.fn(), fetch: vi.fn() }));
vi.mock("./auth/native", () => ({ getCustomerAuth: () => ({
  getSnapshot: () => ({ status: "signed_in", userId: mocks.owner }),
  getAccessToken: mocks.token
}) }));
vi.mock("./tenant", () => ({ readEmbeddedTenant: () => ({
  apiBaseUrl: "https://api.example.test",
  restaurantId: "d7695964-9b50-455a-9065-620e49a9b947"
}) }));

import { getCustomerApi } from "./api";

describe("customer API token ownership", () => {
  beforeEach(() => {
    mocks.owner = "customer-a";
    mocks.token.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("blocks a pending checkout from binding to a different signed-in customer", async () => {
    mocks.owner = "customer-b";
    await expect(getCustomerApi("customer-a").listAddresses()).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rechecks the bound owner after asynchronous access-token refresh", async () => {
    mocks.token.mockImplementation(async () => {
      mocks.owner = "customer-b";
      return "different-customer-token";
    });
    await expect(getCustomerApi().listAddresses()).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
