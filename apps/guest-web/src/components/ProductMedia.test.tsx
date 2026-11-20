import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.index++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (value: unknown) => { harness.values[index] = value; }];
  },
}));
import { ProductMedia } from "./ProductMedia";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
const defaults = { src: "https://media.example.test/a.webp", alt: "Tea", fallbackLabel: "Photo unavailable" };
function render(props: Partial<Parameters<typeof ProductMedia>[0]> = {}) {
  harness.index = 0;
  return ProductMedia({ ...defaults, ...props });
}
beforeEach(() => { harness.values = []; });

describe("safe public product media", () => {
  it("keeps media geometry, lazy loading, async decoding and no-referrer on verified HTTPS images", () => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain('src="https://media.example.test/a.webp"');
    expect(html).toContain('width="160" height="160"');
    expect(html).toContain('loading="lazy" decoding="async" referrerPolicy="no-referrer"');
    expect(html).toContain('alt="Tea"');
    expect(html).not.toContain("product-media-fallback");
  });

  it.each([null, undefined, "", "javascript:alert(1)", "http://media.example.test/a.webp",
    "https://user:password@media.example.test/a.webp", "https://media.example.test/a.webp?token=private",
    "https://media.example.test/a.webp#trackingToken=private"])("uses a named semantic fallback for absent or invalid media %s", src => {
    const html = renderToStaticMarkup(render({ src }));
    expect(html).toContain('class="product-media-fallback" role="img" aria-label="Photo unavailable"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("password");
    expect(html).not.toContain("private");
  });

  it("replaces a network-failed image with the semantic fallback and allows a fresh source to load", () => {
    const image = elements(render()).find(element => element.type === "img")!;
    (image.props.onError as () => void)();
    expect(renderToStaticMarkup(render())).toContain("product-media-fallback");
    const refreshed = renderToStaticMarkup(render({ src: "https://media.example.test/b.webp" }));
    expect(refreshed).toContain('src="https://media.example.test/b.webp"');
    expect(refreshed).not.toContain("product-media-fallback");
  });

  it("catches an image that failed before hydration attached its error handler", () => {
    const image = elements(render()).find(element => element.type === "img")!;
    (image.props.ref as (element: Pick<HTMLImageElement, "complete" | "naturalWidth"> | null) => void)({ complete: true, naturalWidth: 0 });
    const html = renderToStaticMarkup(render());
    expect(html).toContain('class="product-media-fallback" role="img" aria-label="Photo unavailable"');
    expect(html).not.toContain("<img");
    expect(renderToStaticMarkup(render({ src: "https://media.example.test/replacement.webp" }))).toContain('src="https://media.example.test/replacement.webp"');
  });

  it.each([
    { complete: true, naturalWidth: 640 },
    { complete: false, naturalWidth: 0 },
    null,
  ])("keeps successfully loaded or still-loading media and tolerates ref cleanup: %j", element => {
    const image = elements(render()).find(item => item.type === "img")!;
    (image.props.ref as (element: Pick<HTMLImageElement, "complete" | "naturalWidth"> | null) => void)(element);
    const html = renderToStaticMarkup(render());
    expect(html).toContain('src="https://media.example.test/a.webp"');
    expect(html).not.toContain("product-media-fallback");
  });

  it("uses each caller's product/variant source, hero dimensions and requested priority", () => {
    const html = renderToStaticMarkup(render({ src: "https://media.example.test/variant.webp", width: 640, height: 480,
      priority: true, className: "product-hero", alt: "Selected variant" }));
    expect(html).toContain('class="product-media product-hero"');
    expect(html).toContain('width="640" height="480"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('alt="Selected variant"');
  });

  it("renders Burmese fallback text and escapes labels supplied by catalog content", () => {
    expect(renderToStaticMarkup(render({ src: null, fallbackLabel: "ဓာတ်ပုံ မရရှိနိုင်ပါ" }))).toContain('aria-label="ဓာတ်ပုံ မရရှိနိုင်ပါ"');
    const html = renderToStaticMarkup(render({ src: null, fallbackLabel: 'Tea <script>"' }));
    expect(html).toContain("Tea &lt;script&gt;&quot;");
    expect(html).not.toContain("<script>");
  });
});
