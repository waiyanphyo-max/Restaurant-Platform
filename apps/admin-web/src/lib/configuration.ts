import type { PlatformRestaurantConfigurationRequest } from "@restaurant-platform/shared-types";

/** Early form feedback mirrors Spring; Spring still validates every submitted mutation. */
export function validateRestaurantConfiguration(request: PlatformRestaurantConfigurationRequest): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!request.name.trim() || request.name.length > 150) errors.name = "Enter a restaurant name using 150 characters or fewer.";
  if (request.slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(request.slug)) errors.slug = "Use lowercase letters, numbers and single hyphens, up to 100 characters.";
  const logo = request.logoUrl?.trim();
  if (logo) {
    try {
      const url = new URL(logo);
      if (logo.length > 2000 || /[\s?#]/.test(logo) || url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) throw new Error();
    } catch { errors.logoUrl = "Use a public HTTPS logo URL without credentials, a query or a fragment."; }
  }
  const configuration = request.configuration;
  if (!configuration) return errors;
  for (const key of ["primaryColor", "secondaryColor"] as const) {
    const color = configuration[key]?.trim();
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) errors[key] = "Use a six-digit hex color, such as #234D3C.";
  }
  const domains = new Map<string, string>();
  for (const environment of ["staging", "production"] as const) {
    const key = `guestDomains.${environment}`;
    const values = configuration.guestDomains?.[environment] ?? [];
    if (values.length > 20) errors[key] = "Use at most 20 domains per environment.";
    for (const domain of values) {
      try {
        const input = domain.trim();
        if (!input || /[\s:/\\?#@%]/.test(input)) throw new Error();
        const hostname = new URL(`https://${input}`).hostname.toLowerCase();
        if (hostname.length > 253 || /^[0-9.]+$/.test(hostname) ||
          !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname)) throw new Error();
        const previous = domains.get(hostname);
        if (previous) {
          errors[key] = "Use each domain once across staging and production.";
          errors[previous] = "Use each domain once across staging and production.";
        } else domains.set(hostname, key);
      } catch { errors[key] = "Enter valid hostnames without schemes, paths or IP addresses."; }
    }
  }
  const applicationIds = new Map<string, string>();
  for (const kind of ["operations", "customer"] as const) {
    const app = configuration.android?.[kind];
    if (!app) continue;
    const prefix = `android.${kind}`;
    const displayName = app.displayName?.trim();
    if (displayName && displayName.length > 100) errors[`${prefix}.displayName`] = "Use 100 characters or fewer.";
    const icon = app.iconPath?.trim();
    if (icon && (icon.length > 500 || !/^assets\/[A-Za-z0-9_/-]+\.png$/.test(icon) || icon.includes(".."))) errors[`${prefix}.iconPath`] = "Use a relative PNG asset path, such as assets/restaurant-icon.png.";
    for (const field of ["stagingApplicationId", "productionApplicationId"] as const) {
      const id = app[field]?.trim();
      if (!id) continue;
      const key = `${prefix}.${field}`;
      if (id.length > 200 || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(id)) {
        errors[key] = "Use a lowercase Android application ID, such as com.example.restaurant.";
        continue;
      }
      const previous = applicationIds.get(id);
      if (previous) {
        errors[key] = "Use a different application ID for each app and environment.";
        errors[previous] = "Use a different application ID for each app and environment.";
      } else applicationIds.set(id, key);
    }
  }
  return errors;
}
