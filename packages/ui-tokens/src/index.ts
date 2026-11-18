import type { RestaurantBranding } from "@restaurant-platform/shared-types";

/** Shared visual values only. Apps own tenant identity, data and platform interactions. */
export const foundationTokens = Object.freeze({
  spacing: Object.freeze({ xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }),
  radius: Object.freeze({ sm: 6, md: 12, lg: 20 }),
  // System fonts remain the fallback until approved Inter/Padauk assets are supplied.
  typography: Object.freeze({
    caption: Object.freeze({ fontSize: 12, lineHeight: 18, fontWeight: "500" }),
    label: Object.freeze({ fontSize: 14, lineHeight: 22, fontWeight: "600" }),
    body: Object.freeze({ fontSize: 16, lineHeight: 24, fontWeight: "400" }),
    title: Object.freeze({ fontSize: 22, lineHeight: 30, fontWeight: "600" }),
    subtitle: Object.freeze({ fontSize: 18, lineHeight: 26, fontWeight: "600" }),
    heading: Object.freeze({ fontSize: 28, lineHeight: 36, fontWeight: "600" }),
    myanmar: Object.freeze({ fontSize: 18, lineHeight: 30, fontWeight: "400" })
  } as const),
  density: Object.freeze({ touchTarget: 48, compactTouchTarget: 44, pageMaxWidth: 1000, dialogMaxWidth: 440 })
});

export interface BrandTokens {
  primaryColor: string;
  onPrimaryColor: "#000000" | "#ffffff";
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && value.length === 7 && /^#[0-9a-fA-F]{6}$/.test(value);
}

function luminance(color: string): number {
  if (!isHexColor(color)) throw new Error("Color must be a six-digit hex color");
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const channels = [1, 3, 5].map(offset => linear(Number.parseInt(color.slice(offset, offset + 2), 16) / 255));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG sRGB contrast. Inputs are deliberately strict; the theme resolver handles fallback. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function resolveAccessibleForeground(background: string): BrandTokens["onPrimaryColor"] {
  return contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff") ? "#000000" : "#ffffff";
}

/** Existing strict API is retained for validated build configuration consumers. */
export function resolveBrandTokens(branding: RestaurantBranding): BrandTokens {
  if (!isHexColor(branding.primaryColor)) {
    throw new Error("Restaurant primaryColor must be a six-digit hex color");
  }
  return { primaryColor: branding.primaryColor, onPrimaryColor: resolveAccessibleForeground(branding.primaryColor) };
}

function blend(start: string, end: string, amount: number): string {
  return `#${[1, 3, 5].map(offset => {
    const a = Number.parseInt(start.slice(offset, offset + 2), 16);
    const b = Number.parseInt(end.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * amount).toString(16).padStart(2, "0");
  }).join("")}`;
}

function readableColor(preferred: string, fallback: string, backgrounds: readonly string[], minimum: number): string {
  const passes = (color: string): boolean => backgrounds.every(background => contrastRatio(color, background) >= minimum);
  if (passes(preferred)) return preferred;
  for (let step = 1; step < 100; step++) {
    const candidate = blend(preferred, fallback, step / 100);
    if (passes(candidate)) return candidate;
  }
  return fallback;
}

const fallbackColors = Object.freeze({ primaryColor: "#334155", secondaryColor: "#e8edf1", backgroundColor: "#f8fafc" });
type ThemeBranding = Partial<RestaurantBranding> | null | undefined;

/**
 * Pure and stateless: callers provide only branding already scoped to their fixed tenant.
 * Optional fallback must belong to that same tenant (normally its reviewed build branding).
 * No registry lookup, cache, persistence, name matching or tenant switching happens here.
 */
export function resolveThemeTokens(branding?: ThemeBranding, fallbackBranding?: ThemeBranding) {
  const color = (key: keyof typeof fallbackColors): string => {
    const candidate = branding?.[key];
    const fallback = fallbackBranding?.[key];
    return isHexColor(candidate) ? candidate : isHexColor(fallback) ? fallback : fallbackColors[key];
  };
  const primary = color("primaryColor");
  const secondary = color("secondaryColor");
  const background = color("backgroundColor");
  const foreground = resolveAccessibleForeground(background);
  const dark = foreground === "#ffffff";
  const surface = dark ? "#18222e" : "#ffffff";
  const surfaceMuted = blend(surface, foreground, 0.04);
  const backgrounds = [background, surface, surfaceMuted];
  const foregroundMuted = readableColor(dark ? "#b8c4d2" : "#526174", foreground, backgrounds, 4.5);
  const accent = "#8a4b08";
  const success = "#166534";
  const warning = "#854d0e";
  const danger = "#b91c1c";
  const disabledSurface = blend(surface, foreground, 0.08);

  return Object.freeze({
    ...foundationTokens,
    color: Object.freeze({
      primary, onPrimary: resolveAccessibleForeground(primary),
      secondary, onSecondary: resolveAccessibleForeground(secondary),
      background, surface, surfaceMuted, foreground, foregroundMuted,
      border: blend(surface, foreground, 0.16),
      borderStrong: readableColor("#94a3b8", foreground, backgrounds, 3),
      accent, onAccent: resolveAccessibleForeground(accent), accentSurface: "#fff3d6",
      accentForeground: readableColor(accent, foreground, backgrounds, 4.5),
      focus: readableColor(primary, foreground, backgrounds, 3),
      focusOnPrimary: resolveAccessibleForeground(primary),
      success, onSuccess: resolveAccessibleForeground(success), successSurface: "#e8f5ed",
      successForeground: readableColor(success, foreground, backgrounds, 4.5),
      warning, onWarning: resolveAccessibleForeground(warning), warningSurface: "#fff7db",
      warningForeground: readableColor(warning, foreground, backgrounds, 4.5),
      danger, onDanger: resolveAccessibleForeground(danger), dangerSurface: "#fef2f2",
      dangerForeground: readableColor(danger, foreground, backgrounds, 4.5),
      disabledSurface,
      disabledForeground: readableColor(foregroundMuted, foreground, [disabledSurface], 4.5)
    })
  });
}

export type ThemeTokens = ReturnType<typeof resolveThemeTokens>;

/** CSS custom properties scoped on a tenant shell; never writes document/global state. */
export function toWebThemeVariables(theme: ThemeTokens): Record<`--ui-${string}`, string> {
  const variables: Record<`--ui-${string}`, string> = {};
  const kebab = (name: string): string => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  const rem = (value: number): string => `${value / 16}rem`;
  for (const [name, value] of Object.entries(theme.color)) variables[`--ui-${kebab(name)}`] = value;
  for (const [name, value] of Object.entries(theme.spacing)) variables[`--ui-space-${name}`] = rem(value);
  for (const [name, value] of Object.entries(theme.radius)) variables[`--ui-radius-${name}`] = rem(value);
  for (const [name, value] of Object.entries(theme.typography)) {
    variables[`--ui-font-${name}-size`] = rem(value.fontSize);
    variables[`--ui-font-${name}-line-height`] = String(value.lineHeight / value.fontSize);
    variables[`--ui-font-${name}-weight`] = value.fontWeight;
  }
  for (const [name, value] of Object.entries(theme.density)) variables[`--ui-${kebab(name)}`] = rem(value);
  return variables;
}
