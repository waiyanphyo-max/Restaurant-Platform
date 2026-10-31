import { PageHeader } from "@/components/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { Icon } from "@/components/ui";
import { requireAdmin } from "@/lib/admin-context";

export default async function SettingsPage() {
  const { userId } = await requireAdmin("/settings");
  const stage = process.env.APP_STAGE ?? "unconfigured";
  return <>
    <PageHeader title="Workspace settings" description="Your account, access and workspace connection information." />
    <div className="settings-layout">
      <section className="panel"><div className="panel-heading"><div><p className="overline">YOUR ACCOUNT</p><h2>Identity &amp; access</h2></div><Icon name="shield" /></div><p className="muted">Your authenticated identity is used to verify access to this workspace.</p><dl className="detail-list"><div><dt>User ID</dt><dd className="mono">{userId}</dd></div><div><dt>Authentication</dt><dd>Email and password · Supabase Auth</dd></div><div><dt>Permission</dt><dd><span className="badge badge-success">Platform Admin verified</span></dd></div><div><dt>Access verification</dt><dd>Verified by the platform API for this request</dd></div></dl></section>
      <section className="panel"><div className="panel-heading"><div><p className="overline">WORKSPACE</p><h2>Connection</h2></div><span className="connection-status"><span className="status-dot" />Connected</span></div><p className="muted">Connection details verified when this page was loaded.</p><dl className="detail-list"><div><dt>Environment</dt><dd className="capitalize">{stage}</dd></div><div><dt>Platform API</dt><dd>Connected for this request</dd></div><div><dt>Session</dt><dd>Verified and active</dd></div><div><dt>Access control</dt><dd>Managed by your platform administrator</dd></div></dl></section>
    </div>
    <section className="panel settings-signout"><div><h2>End your session</h2><p className="muted">Sign out of Platform Admin on this browser.</p></div><SignOutButton /></section>
  </>;
}
