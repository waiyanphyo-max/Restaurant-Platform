import type { CSSProperties } from "react";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { resolveBrandTokens } from "@restaurant-platform/ui-tokens";
import type { LegacyIntent } from "@/lib/legacy-route";
import { LegacyQrCredential } from "./LegacyQrCredential";

export function GuestStarter({
  restaurant,
  intent,
}: {
  restaurant: RestaurantConfig;
  intent: Exclude<LegacyIntent, { kind: "invalid" }>;
}) {
  const brand = resolveBrandTokens(restaurant.branding);
  const style = {
    "--brand-primary": brand.primaryColor,
    "--brand-on-primary": brand.onPrimaryColor,
  } as CSSProperties;

  const heading =
    intent.kind === "common-qr"
      ? "Guest pickup link"
      : intent.kind === "table-qr"
        ? "Table ordering link"
        : intent.kind === "owner"
          ? "Restaurant owner link"
          : "Guest website";

  return (
    <main className="site" style={style}>
      <header className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>{restaurant.branding.displayName}</span>
      </header>
      <section className="card">
        <div className="eyebrow">Restaurant Platform · M1 foundation</div>
        <h1>{heading}</h1>
        {intent.kind === "common-qr" || intent.kind === "table-qr" ? (
          <LegacyQrCredential />
        ) : intent.kind === "owner" ? (
          <p>
            This owner link is recognized for this restaurant. Operations move to the separate
            Operations Android application; the handoff is not active in this starter.
          </p>
        ) : (
          <p>
            This branded website foundation is ready for public ordering features. No menu or
            business data is loaded by the starter.
          </p>
        )}
      </section>
    </main>
  );
}
