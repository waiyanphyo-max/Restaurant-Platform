import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { RestaurantBranding, RestaurantConfig } from "@restaurant-platform/shared-types";
import { resolveThemeTokens, toWebThemeVariables } from "@restaurant-platform/ui-tokens";
import { GuestShell } from "./GuestShell";
import { GuestState } from "./GuestState";
import { messages } from "@/lib/i18n";

function restaurant(slug: string, branding: RestaurantBranding): RestaurantConfig {
  return {
    schemaVersion: 1, slug, restaurantId: slug === "red" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222",
    branding, guestDomains: { staging: [], production: [] },
    android: {
      operations: { displayName: slug, stagingApplicationId: `test.${slug}.ops.staging`, productionApplicationId: `test.${slug}.ops` },
      customer: { displayName: slug, stagingApplicationId: `test.${slug}.customer.staging`, productionApplicationId: `test.${slug}.customer` },
    },
  };
}

const red = restaurant("red", { displayName: "San Thaw Tar fixture", primaryColor: "#A51D22", secondaryColor: "#FCEAE7", backgroundColor: "#FFF8F0" });
const blue = restaurant("blue", { displayName: "Blue kitchen fixture", primaryColor: "#FFD700", secondaryColor: "#163B80", backgroundColor: "#101C36" });

describe("Guest semantic foundations", () => {
  it("keeps unbranded error and loading routes on the complete neutral fallback contract", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const root = /(?:^|\n):root\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    const declarations = Object.fromEntries([...root.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]));
    expect(declarations).toMatchObject(toWebThemeVariables(resolveThemeTokens()));
    expect(root).not.toContain(red.branding.primaryColor);
  });

  it("resolves complete styles separately for red and contrasting dark tenants, including repeated SSR requests", () => {
    const render = (config: RestaurantConfig) => renderToStaticMarkup(<GuestShell restaurant={config} locale="en"><p>Menu</p></GuestShell>);
    const first = render(red);
    const second = render(blue);
    const again = render(red);
    expect(first).toBe(again);
    for (const config of [red, blue]) {
      const html = render(config);
      const theme = resolveThemeTokens(config.branding);
      for (const [key, value] of Object.entries(toWebThemeVariables(theme))) expect(html).toContain(`${key}:${value}`);
      expect(html).toContain(`--brand-primary:${config.branding.primaryColor}`);
      expect(html).toContain(`--brand-on-primary:${theme.color.onPrimary}`);
      expect(html).toContain('href="#main-content"');
      expect(html).toContain('tabindex="-1"');
    }
    expect(first).not.toContain(blue.branding.primaryColor);
    expect(second).not.toContain(red.branding.primaryColor);
    expect(second).not.toContain(red.branding.displayName);
    expect(red.branding.primaryColor).toBe("#A51D22");
  });

  it("renders invalid or missing palette values with neutral safe colors rather than throwing or injecting CSS", () => {
    const invalid = restaurant("invalid", { displayName: "Invalid fixture", primaryColor: "red;--ui-primary:hotpink", secondaryColor: "#fff", backgroundColor: "url(unsafe)" });
    const unavailable = restaurant("unavailable", { displayName: "Unavailable fixture" } as RestaurantBranding);
    const fallback = resolveThemeTokens();
    for (const config of [invalid, unavailable]) {
      const html = renderToStaticMarkup(<GuestShell restaurant={config} locale="en"><GuestState kind="error" locale="en" /></GuestShell>);
      expect(html).toContain(`--brand-primary:${fallback.color.primary}`);
      expect(html).not.toContain("hotpink");
      expect(html).not.toContain("url(unsafe)");
      expect(html).not.toContain(red.branding.primaryColor);
    }
  });

  it("rejects foreign runtime presentation and preserves a validated current logo cachebuster", () => {
    const foreign = { restaurantId: blue.restaurantId, branding: blue.branding, revision: 1, source: "runtime" as const };
    const rejected = renderToStaticMarkup(<GuestShell restaurant={red} presentation={foreign} locale="en"><p>Menu</p></GuestShell>);
    expect(rejected).toContain(red.branding.displayName);
    expect(rejected).not.toContain(blue.branding.displayName);
    const logoUrl = "https://media.example.test/logo.webp?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const current = { restaurantId: red.restaurantId, branding: { ...red.branding, displayName: "Current server name", logoUrl }, revision: 2, source: "runtime" as const };
    const accepted = renderToStaticMarkup(<GuestShell restaurant={red} presentation={current} locale="en"><p>Menu</p></GuestShell>);
    expect(accepted).toContain(logoUrl);
    expect(accepted).toContain("Current server name");
    expect(accepted).not.toContain(red.branding.displayName);
  });

  it.each(["en", "my"] as const)("announces loading, empty, error, offline and forbidden in %s without inventing permission recovery", locale => {
    const render = (kind: "loading" | "empty" | "error" | "offline" | "forbidden") =>
      renderToStaticMarkup(<GuestState kind={kind} locale={locale} basePath="/r/blue" />);
    expect(render("loading")).toContain('role="status"');
    expect(render("loading")).toContain('aria-busy="true"');
    expect(render("loading")).toContain('aria-hidden="true"');
    expect(render("empty")).toContain(messages[locale].emptyTitle);
    expect(render("empty")).not.toContain('aria-busy="true"');
    expect(render("error")).toContain('role="alert"');
    expect(render("error")).toContain('href="/r/blue/menu"');
    expect(render("offline")).toContain(messages[locale].offlineNote);
    expect(render("offline")).toContain('href="/r/blue/menu"');
    expect(render("forbidden")).toContain(messages[locale].forbiddenTitle);
    expect(render("forbidden")).toContain('role="alert"');
    expect(render("forbidden")).not.toContain("href=");
    expect(render("forbidden")).not.toContain("sign in");
  });
});
