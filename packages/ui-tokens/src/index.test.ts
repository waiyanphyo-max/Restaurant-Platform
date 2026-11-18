import { describe, expect, it } from "vitest";
import type { RestaurantBranding } from "@restaurant-platform/shared-types";
import { contrastRatio, foundationTokens, isHexColor, resolveAccessibleForeground, resolveBrandTokens, resolveThemeTokens, toWebThemeVariables } from "./index.js";

describe("resolveBrandTokens", () => {
  it("selects readable text for light and dark restaurant colors", () => {
    expect(resolveBrandTokens({ displayName: "Test", primaryColor: "#ffffff" }).onPrimaryColor).toBe("#000000");
    expect(resolveBrandTokens({ displayName: "Test", primaryColor: "#000000" }).onPrimaryColor).toBe("#ffffff");
  });

  it("rejects unsafe color values", () => {
    expect(() => resolveBrandTokens({ displayName: "Test", primaryColor: "red; background:url(example)" })).toThrow();
  });
});

const sanThawTar: RestaurantBranding = {
  displayName: "San Thaw Tar", primaryColor: "#A51D22", secondaryColor: "#FCEAE7", backgroundColor: "#FFF8F0"
};
const restaurantB: RestaurantBranding = {
  displayName: "Restaurant B", primaryColor: "#06b6d4", secondaryColor: "#164e63", backgroundColor: "#082f49"
};

describe("theme foundations", () => {
  it("keeps foundation rhythm, minimum touch sizes and scalable typography", () => {
    expect(foundationTokens.spacing).toMatchObject({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 });
    expect(foundationTokens.radius).toEqual({ sm: 6, md: 12, lg: 20 });
    expect(foundationTokens.density.touchTarget).toBeGreaterThanOrEqual(48);
    expect(foundationTokens.density.compactTouchTarget).toBeGreaterThanOrEqual(44);
    expect(foundationTokens.typography.body).toEqual({ fontSize: 16, lineHeight: 24, fontWeight: "400" });
    expect(foundationTokens.typography.myanmar).toMatchObject({ fontSize: 18, lineHeight: 30 });
  });

  it("checks valid colors without coercing unsafe or incomplete values", () => {
    for (const value of ["#A51D22", "#ffffff", "#06b6d4"]) expect(isHexColor(value)).toBe(true);
    for (const value of [null, undefined, 123456, "red", "#fff", "#12345678", " #123456", "#123456;", "#123456\n"]) {
      expect(isHexColor(value)).toBe(false);
    }
  });

  it("has known contrast endpoints and chooses the more readable foreground at the crossover", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.478, 3);
    expect(resolveAccessibleForeground("#777777")).toBe("#000000");
    expect(contrastRatio("#A51D22", "#ffffff")).toBe(contrastRatio("#ffffff", "#A51D22"));
    expect(() => contrastRatio("red", "#ffffff")).toThrow();
  });
});

describe("resolveThemeTokens", () => {
  it("uses the approved San Thaw Tar red only when supplied for that restaurant", () => {
    const { color } = resolveThemeTokens(sanThawTar);
    expect(color.primary).toBe("#A51D22");
    expect(color.onPrimary).toBe("#ffffff");
    expect(color.secondary).toBe("#FCEAE7");
    expect(color.background).toBe("#FFF8F0");
    expect(resolveThemeTokens().color.primary).not.toBe("#A51D22");
    expect(new Set([color.success, color.warning, color.danger, color.accent]).size).toBe(4);
    expect(color.danger).not.toBe(color.primary);
  });

  it("supports a contrasting non-red restaurant and dark surfaces", () => {
    const { color } = resolveThemeTokens(restaurantB);
    expect(color.primary).toBe("#06b6d4");
    expect(color.onPrimary).toBe("#000000");
    expect(color.onSecondary).toBe("#ffffff");
    expect(color.foreground).toBe("#ffffff");
    expect(contrastRatio(color.foregroundMuted, color.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color.dangerForeground, color.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back per field to supplied same-tenant build branding, then neutral defaults", () => {
    expect(resolveThemeTokens(null, sanThawTar).color).toEqual(resolveThemeTokens(sanThawTar).color);
    const malformed = { primaryColor: "red; background:url(example)", secondaryColor: "#fff", backgroundColor: "" };
    expect(resolveThemeTokens(malformed, restaurantB).color).toEqual(resolveThemeTokens(restaurantB).color);
    expect(resolveThemeTokens(malformed).color).toEqual(resolveThemeTokens().color);
    expect(resolveThemeTokens(undefined).color).toEqual(resolveThemeTokens(null).color);
    const partial = resolveThemeTokens({ primaryColor: "#ffffff" }, restaurantB).color;
    expect(partial.primary).toBe("#ffffff");
    expect(partial.secondary).toBe(restaurantB.secondaryColor);
    expect(partial.background).toBe(restaurantB.backgroundColor);
    expect(resolveThemeTokens(malformed, malformed).color).toEqual(resolveThemeTokens().color);
  });

  it("resolves accessible text, control boundaries and focus across the sRGB range", () => {
    const channels = [0, 51, 102, 119, 153, 204, 255];
    for (const red of channels) for (const green of channels) for (const blue of channels) {
      const background = `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
      const { color } = resolveThemeTokens({ primaryColor: background, secondaryColor: background, backgroundColor: background });
      for (const surface of [color.background, color.surface, color.surfaceMuted]) {
        for (const foreground of [color.foreground, color.foregroundMuted, color.dangerForeground, color.warningForeground, color.successForeground, color.accentForeground]) {
          expect(contrastRatio(foreground, surface), `${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(color.focus, surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(color.borderStrong, surface)).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio(color.onPrimary, color.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color.onSecondary, color.secondary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color.focusOnPrimary, color.primary)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(color.disabledForeground, color.disabledSurface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("preserves readable semantic badge text on paired fills and soft surfaces", () => {
    const { color } = resolveThemeTokens(restaurantB);
    for (const kind of ["success", "warning", "danger", "accent"] as const) {
      const onKey = `on${kind[0].toUpperCase()}${kind.slice(1)}` as "onSuccess" | "onWarning" | "onDanger" | "onAccent";
      expect(contrastRatio(color[kind], color[`${kind}Surface`])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color[onKey], color[kind])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never retains a previous restaurant or mutates a supplied branding object", () => {
    const input = Object.freeze({ ...sanThawTar });
    const first = resolveThemeTokens(input);
    const other = resolveThemeTokens(restaurantB);
    expect(other.color.primary).toBe(restaurantB.primaryColor);
    expect(resolveThemeTokens().color.primary).not.toBe(first.color.primary);
    expect(resolveThemeTokens(input)).toEqual(first);
    expect(first.color).not.toBe(resolveThemeTokens(input).color);
    expect(Reflect.set(first.color, "primary", restaurantB.primaryColor)).toBe(false);
    expect(Reflect.set(first.spacing, "md", 999)).toBe(false);
    expect(resolveThemeTokens(input).color.primary).toBe(sanThawTar.primaryColor);
    expect(input).toEqual(sanThawTar);
  });
});

describe("toWebThemeVariables", () => {
  it("exports only safe per-shell CSS tokens, with relative dimensions for text scaling", () => {
    const variables = toWebThemeVariables(resolveThemeTokens(sanThawTar));
    expect(variables["--ui-primary"]).toBe("#A51D22");
    expect(variables["--ui-on-primary"]).toBe("#ffffff");
    expect(variables["--ui-foreground-muted"]).toBeTruthy();
    expect(variables["--ui-font-body-size"]).toBe("1rem");
    expect(variables["--ui-font-body-line-height"]).toBe("1.5");
    expect(variables["--ui-font-myanmar-size"]).toBe("1.125rem");
    expect(variables["--ui-touch-target"]).toBe("3rem");
    expect(variables["--ui-space-md"]).toBe("1rem");
    expect(variables["--ui-radius-md"]).toBe("0.75rem");
    expect(Object.keys(variables).every(key => key.startsWith("--ui-"))).toBe(true);
    expect(Object.values(variables)).not.toContain(sanThawTar.displayName);
    variables["--ui-primary"] = "#000000";
    expect(toWebThemeVariables(resolveThemeTokens(sanThawTar))["--ui-primary"]).toBe("#A51D22");
    expect(toWebThemeVariables(resolveThemeTokens(restaurantB))["--ui-primary"]).toBe("#06b6d4");
  });
});
