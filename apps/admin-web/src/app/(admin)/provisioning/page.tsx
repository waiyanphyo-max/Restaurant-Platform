import { PageHeader } from "@/components/PageHeader";
import { ProvisioningForm } from "@/components/ProvisioningForm";
import { Icon, Notice } from "@/components/ui";
import { requireAdmin } from "@/lib/admin-context";

export default async function ProvisioningPage() {
  await requireAdmin("/provisioning");
  return <>
    <PageHeader title="Restaurant provisioning" description="Prepare the information for your next restaurant workspace." />
    <Notice title="Onboarding preview" tone="info"><p>You can prepare and review restaurant information here. Creating restaurants and sending owner invitations are not available yet.</p></Notice>
    <div className="provisioning-layout">
      <section className="panel"><div className="panel-heading"><div><p className="overline">NEW WORKSPACE</p><h2>Prepare a restaurant</h2></div><span className="badge">Preview</span></div><ProvisioningForm /></section>
      <aside className="provision-aside"><section className="panel"><div className="panel-heading"><Icon name="provisioning" /><h2>Before you begin</h2></div><p className="muted">Have these details ready for a smooth onboarding process.</p><ol className="onboarding-list"><li><strong>Restaurant identity</strong><p>A restaurant name and a unique, readable slug.</p></li><li><strong>Restaurant location</strong><p>The city and township where the restaurant operates.</p></li><li><strong>Owner contact</strong><p>The email address of the person who will own the workspace.</p></li></ol></section><p className="muted">This preview is temporary. Leaving or refreshing this page clears the information.</p></aside>
    </div>
  </>;
}
