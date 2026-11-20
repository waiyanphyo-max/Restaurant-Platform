import { PageHeader } from "@/components/PageHeader";
import { ProvisioningForm } from "@/components/ProvisioningForm";
import { Icon } from "@/components/ui";
import { requireAdmin } from "@/lib/admin-context";

export default async function ProvisioningPage() {
  const { userId } = await requireAdmin("/provisioning");
  return <>
    <PageHeader title="Restaurant provisioning" description="Create a restaurant workspace and securely onboard its Owner." />
    <div className="provisioning-layout">
      <section className="panel"><div className="panel-heading"><div><p className="overline">NEW WORKSPACE</p><h2>Create a restaurant</h2></div><span className="badge">Email onboarding</span></div><ProvisioningForm recoveryScope={{ userId, apiOrigin: process.env.NEXT_PUBLIC_API_BASE_URL ?? "" }} /></section>
      <aside className="provision-aside"><section className="panel"><div className="panel-heading"><Icon name="provisioning" /><h2>Before you begin</h2></div><p className="muted">Have these details ready for onboarding.</p><ol className="onboarding-list"><li><strong>Restaurant identity</strong><p>A restaurant name, unique public slug and initial branding.</p></li><li><strong>Restaurant location</strong><p>Address, city, township, timezone and currency.</p></li><li><strong>Verified Owner identity</strong><p>Invite by email, or supply an existing Supabase Auth user UUID with its confirmed email.</p></li><li><strong>Finish setup</strong><p>Prepare the initial runtime palette, catalog and media manifest, then review Owner Operations handoff. Native builds and publication remain separate.</p></li></ol></section><p className="muted">Unsaved information is cleared when you leave this page. Creation and email delivery require the configured backend and Auth provider.</p></aside>
    </div>
  </>;
}
