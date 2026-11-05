import { describe, expect, it, vi } from "vitest";
import { phoneProviderAvailable } from "./phone";

const origin = "https://project.supabase.co";
const publishable = "sb_publishable_fixture_only";
function fetcher(settings: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(settings))) as unknown as typeof fetch;
}
describe("customer SMS provider gate", () => {
  it("requires the explicit build flag before reading provider settings", async () => {
    const fetch = fetcher({ external: { phone: true }, phone_autoconfirm: false, sms_provider: "twilio" });
    expect(await phoneProviderAvailable(false, origin, publishable, fetch)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads public project settings with a publishable key and accepts confirmed-phone configuration", async () => {
    const fetch = fetcher({ external: { phone: true }, phone_autoconfirm: false, sms_provider: "twilio" });
    expect(await phoneProviderAvailable(true, origin, publishable, fetch)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${origin}/auth/v1/settings`, expect.objectContaining({ headers: { apikey: publishable }, redirect: "error" }));
  });
  it("fails closed for missing, disabled, auto-confirming and absent provider settings", async () => {
    for (const settings of [null, {}, { external: { phone: false } }, { external: { phone: true }, phone_autoconfirm: true, sms_provider: "twilio" },
      { external: { phone: true }, phone_autoconfirm: false, sms_provider: "" }]) {
      expect(await phoneProviderAvailable(true, origin, publishable, fetcher(settings))).toBe(false);
    }
  });
  it("fails closed for unavailable provider, malformed response and network failure", async () => {
    const offline = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const unavailable = vi.fn(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
    const invalid = vi.fn(async () => new Response("not json")) as unknown as typeof fetch;
    for (const fetch of [offline, unavailable, invalid]) expect(await phoneProviderAvailable(true, origin, publishable, fetch)).toBe(false);
  });
});
