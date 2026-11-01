import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import "./globals.css";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const context = await resolveGuestTenantContext();
  return {
    title: context ? `${context.restaurant.branding.displayName} · Menu` : "Restaurant site unavailable",
    description: "Explore the restaurant menu, available dishes and contact information.",
    robots: { index: false, follow: false }, referrer: "no-referrer",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return <html lang={await getGuestLocale()}><body>{children}</body></html>;
}
