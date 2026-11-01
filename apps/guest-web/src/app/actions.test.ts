import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setGuestLanguage } from "./actions";

const mocks = vi.hoisted(() => ({ tenant: vi.fn(), cookies: vi.fn(), setCookie: vi.fn() }));
vi.mock("@/lib/tenant-server", () => ({ resolveGuestTenant: mocks.tenant }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.mockResolvedValue({ restaurantId: "11111111-1111-4111-8111-111111111111" });
  mocks.cookies.mockResolvedValue({ set: mocks.setCookie });
});
afterEach(() => vi.unstubAllEnvs());

describe("guest language server action", () => {
  it.each(["en", "my"])("sets %s only after resolving the current tenant, with a secure host-only production cookie", async language => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("language", language);
    await setGuestLanguage(form);
    expect(mocks.tenant).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.cookies).toHaveBeenCalledOnce();
    expect(mocks.setCookie).toHaveBeenCalledExactlyOnceWith("guest-language", language, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 31_536_000,
    });
    const options = mocks.setCookie.mock.calls[0][2];
    expect(options).not.toHaveProperty("domain");
  });

  it("does not set a cookie for an unknown tenant even when a client supplies a restaurant ID", async () => {
    mocks.tenant.mockResolvedValue(null);
    const form = new FormData();
    form.set("language", "my");
    form.set("restaurantId", "22222222-2222-4222-8222-222222222222");
    await setGuestLanguage(form);
    expect(mocks.tenant).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it.each(["", "fr", "MY", "my-MM", "en-US", " my", "en; Domain=other.example.test"])("ignores invalid locale %s without mutating the current preference", async language => {
    const form = new FormData();
    form.set("language", language);
    await setGuestLanguage(form);
    expect(mocks.tenant).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("ignores missing or file-valued locale fields", async () => {
    await setGuestLanguage(new FormData());
    const form = new FormData();
    form.set("language", new Blob(["my"], { type: "text/plain" }), "locale.txt");
    await setGuestLanguage(form);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("allows the preference on local HTTP development without broadening the cookie domain or path", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const form = new FormData();
    form.set("language", "my");
    await setGuestLanguage(form);
    expect(mocks.setCookie).toHaveBeenCalledExactlyOnceWith("guest-language", "my", {
      httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 31_536_000,
    });
  });
});
