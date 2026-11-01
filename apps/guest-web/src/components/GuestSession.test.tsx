import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestSession, useGuestSession } from "./GuestSession";

function SessionOutput() {
  return <output>{JSON.stringify(useGuestSession())}</output>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("guest QR session server rendering", () => {
  it("renders only language and a checking state without reading or serializing a fragment credential", () => {
    const credential = "private-qr-credential-never-serialize";
    const readHash = vi.fn(() => `#qrToken=${credential}`);
    const location = { get hash() { return readHash(); } };
    const replaceState = vi.fn();
    const setItem = vi.fn();
    const fetchImpl = vi.fn();
    vi.stubGlobal("window", { location, history: { replaceState }, localStorage: { setItem }, sessionStorage: { setItem } });
    vi.stubGlobal("fetch", fetchImpl);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const html = renderToStaticMarkup(<GuestSession locale="my"><SessionOutput /></GuestSession>);
    expect(html).toContain("my");
    expect(html).toContain("checking");
    expect(html).not.toContain(credential);
    expect(html).not.toContain("qrToken");
    expect(readHash).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
