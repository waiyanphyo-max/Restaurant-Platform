import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { Notice } from "@/components/ui";
import { getAdminContext } from "@/lib/admin-context";
import { safeReturnTo } from "@/lib/auth/route-policy";
import type { SearchParams } from "@/components/restaurant-query";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : "/");
  const context = await getAdminContext();
  if (context.state === "authorized" && params.reason !== "expired") redirect(returnTo);
  return <main className="login-page"><section className="login-story"><Brand light /><div className="login-story-content"><span className="story-label"><span className="status-dot" />THE PLATFORM WORKSPACE</span><h1>Good operations.<br />Great possibilities.</h1><p>A considered space to manage your restaurant network, from the first location to the next chapter.</p><div className="story-grid" aria-hidden="true"><div /><div /><div /><div /><div /><div /></div></div><p className="login-story-footer">Restaurant Platform <span>Built for the bigger picture.</span></p></section><section className="login-panel"><div className="mobile-brand"><Brand /></div><div className="login-form-wrap"><span className="login-icon" aria-hidden="true">↗</span><p className="overline">PLATFORM ADMIN</p><h2>Welcome back</h2><p className="login-description">Sign in to your administration workspace.</p>{params.reason === "expired" && <Notice title="Please sign in again" tone="info">Your session expired or is no longer accepted. Sign in to continue securely.</Notice>}{context.state === "configuration" && <Notice title="Sign-in needs configuration" tone="warning">This environment is not ready. <Link href="/access">View setup requirements</Link>.</Notice>}<LoginForm returnTo={returnTo} available={context.state !== "configuration"} /><div className="login-help"><span aria-hidden="true">◇</span><p>Need access? Contact your platform operator.</p></div></div><p className="login-footer">Secure access to your restaurant network</p></section></main>;
}
