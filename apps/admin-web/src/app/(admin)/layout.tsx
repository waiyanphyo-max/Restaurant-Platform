import type { ReactNode } from "react";
import { AdminShell } from "@/components/AdminShell";
import { requireAdmin } from "@/lib/admin-context";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await requireAdmin((await headers()).get("x-admin-return-path") ?? "/");
  return <AdminShell userId={userId} stage={process.env.APP_STAGE ?? "unconfigured"}>{children}</AdminShell>;
}
