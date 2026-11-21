import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QueryResult } from "./QueryResult";

vi.mock("./ui", () => ({
  Body: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  StateView: ({ title, message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) =>
    <div><h2>{title}</h2><p>{message}</p>{onRetry ? <button onClick={onRetry}>Try again</button> : null}</div>,
}));

describe("query refresh feedback", () => {
  it("shows the selected product and progress together during refresh", () => {
    const html = renderToStaticMarkup(<QueryResult state={{ status: "ready", data: "selected-product" }} reload={vi.fn()} refreshing>
      {data => <section><h1>{data}</h1><p>Image uploaded successfully.</p></section>}
    </QueryResult>);
    expect(html).toContain("selected-product");
    expect(html).toContain("Image uploaded successfully.");
    expect(html).toContain("Refreshing current restaurant data");
  });

  it("keeps action feedback readable with retry guidance after a refresh failure", () => {
    const html = renderToStaticMarkup(<QueryResult state={{ status: "ready", data: "selected-variant" }} reload={vi.fn()} refreshError="offline">
      {data => <section><h1>{data}</h1><p>Image uploaded successfully.</p></section>}
    </QueryResult>);
    expect(html).toContain("selected-variant");
    expect(html).toContain("Image uploaded successfully.");
    expect(html).toContain("Refresh could not be completed");
    expect(html).toContain("last loaded data is shown");
    expect(html).toContain("Try again");
  });

  it("renders no cached private product when access is denied", () => {
    const children = vi.fn(() => <p>private product</p>);
    const html = renderToStaticMarkup(<QueryResult state={{ status: "denied" }} reload={vi.fn()}>{children}</QueryResult>);
    expect(children).not.toHaveBeenCalled();
    expect(html).not.toContain("Try again");
  });
});
