import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { GuestLogo } from "./GuestLogo";

const state = vi.hoisted(() => ({ failed: false }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [state.failed, (value: boolean) => { state.failed = value; }],
}));
beforeEach(() => { state.failed = false; });

describe("Guest public logo", () => {
  it("keeps stable dimensions and no-referrer behavior for a validated upload cachebuster", () => {
    const src = "https://media.example.test/logo.webp?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const logo = GuestLogo({ src, name: "Kitchen" }) as ReactElement<Record<string, unknown>>;
    expect(logo.type).toBe("img");
    expect(logo.props).toMatchObject({ src, width: 44, height: 44, alt: "", referrerPolicy: "no-referrer" });
  });

  it("replaces failed or missing logos with the identity monogram", () => {
    const props = { src: "https://media.example.test/missing.webp", name: "Kitchen" };
    const image = GuestLogo(props) as ReactElement<{ onError: () => void }>;
    image.props.onError();
    const failed = GuestLogo(props) as ReactElement<{ children: string }>;
    expect(failed.type).toBe("span");
    expect(failed.props.children).toBe("K");
    state.failed = false;
    expect((GuestLogo({ name: "Kitchen" }) as ReactElement).type).toBe("span");
  });

  it("recovers a cached or pre-hydration failure even when no error event reaches React", () => {
    const props = { src: "https://media.example.test/cached-missing.webp", name: "Kitchen" };
    const image = GuestLogo(props) as ReactElement<{ ref: (node: Pick<HTMLImageElement, "complete" | "naturalWidth"> | null) => void }>;
    image.props.ref({ complete: true, naturalWidth: 0 });
    const fallback = GuestLogo(props) as ReactElement<{ children: string }>;
    expect(fallback.type).toBe("span");
    expect(fallback.props.children).toBe("K");
  });

  it("keeps a loading or successfully loaded image when its ref attaches", () => {
    const props = { src: "https://media.example.test/logo.webp", name: "Kitchen" };
    const image = GuestLogo(props) as ReactElement<{ ref: (node: Pick<HTMLImageElement, "complete" | "naturalWidth"> | null) => void }>;
    image.props.ref(null);
    image.props.ref({ complete: false, naturalWidth: 0 });
    image.props.ref({ complete: true, naturalWidth: 44 });
    expect((GuestLogo(props) as ReactElement).type).toBe("img");
  });
});
