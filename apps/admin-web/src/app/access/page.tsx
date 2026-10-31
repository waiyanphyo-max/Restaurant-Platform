import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminContext } from "@/lib/admin-context";
import { publicSupabaseConfig } from "@/lib/auth/public-config";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const context = await getAdminContext();
  if (context.state === "authorized") redirect("/");
  if (context.state === "signed-out") redirect("/login");
  const configuration = context.state === "configuration";
  const forbidden = context.state === "forbidden";
  return <main className="standalone-page"><Brand /><section className="standalone-card"><span className={`state-symbol${forbidden ? " state-warning" : ""}`} aria-hidden="true">{forbidden ? "◇" : "!"}</span><p className="overline">{forbidden ? "ACCESS RESTRICTED · 403" : configuration ? "ENVIRONMENT SETUP" : "SERVICE UNAVAILABLE"}</p><h1>{forbidden ? "This workspace needs admin access" : configuration ? "A little setup is needed" : "We couldn’t verify your access"}</h1><p>{forbidden ? "You are signed in, but this account does not have platform administrator permission. Contact your platform operator with your Supabase Auth user ID." : configuration ? "Configure this environment before opening the administration workspace." : "The platform service could not be reached or is not ready. Your access has not been granted. Try again in a moment."}</p>{configuration && <ul className="setup-list">{context.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}<div className="standalone-actions">{!forbidden && <Link className="button button-primary" href="/">Try again</Link>}{publicSupabaseConfig() && <SignOutButton />}{!forbidden && <Link className="button button-secondary" href="/login">Go to sign in</Link>}</div></section><p className="standalone-footer">Restaurant Platform · Secure administration</p></main>;
}
