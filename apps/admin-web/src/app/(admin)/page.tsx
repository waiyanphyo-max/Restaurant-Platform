import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/admin-context";
import { Icon, type IconName } from "@/components/ui";

export default async function OverviewPage() {
  const { overview } = await requireAdmin();
  const metrics = [
    { label: "Total restaurants", value: overview.totalRestaurants, description: "Across the platform", icon: "restaurants" },
    { label: "Active restaurants", value: overview.activeRestaurants, description: "Currently active", icon: "check" },
    { label: "Restaurant members", value: overview.totalRestaurantMembers, description: "Across all restaurants", icon: "user" },
    { label: "Total orders", value: overview.totalOrders, description: "All recorded orders", icon: "details" },
  ];
  return <>
    <PageHeader title="Platform overview" description="A clear view of your restaurant platform. One place to keep things moving." action={<Link className="button button-primary" href="/restaurants">View restaurants <span aria-hidden="true">↗</span></Link>} />
    <div className="verified-strip"><span className="status-dot" /><strong>Platform access verified</strong><span>Live totals from your platform</span></div>
    <section aria-label="Platform totals" className="metric-grid">{metrics.map(metric => <article className="metric-card" key={metric.label}><div className="metric-top"><h2>{metric.label}</h2><span className="metric-icon"><Icon name={metric.icon as IconName} /></span></div><p className="metric-value">{metric.value.toLocaleString("en-US")}</p><p className="metric-description">{metric.description}</p></article>)}</section>
    <div className="overview-columns"><section className="panel"><div className="panel-heading"><div><p className="overline">YOUR NETWORK</p><h2>Restaurant directory</h2></div><span className="subtle-icon" aria-hidden="true">▦</span></div><p className="muted">Find a restaurant, review its owner and check its platform status.</p><div className="distribution"><div><span className="status-dot" />Active restaurants<strong>{overview.activeRestaurants.toLocaleString("en-US")}</strong></div><div><span className="status-dot dot-neutral" />Inactive restaurants<strong>{overview.inactiveRestaurants.toLocaleString("en-US")}</strong></div></div><Link className="text-link" href="/restaurants">Explore restaurant directory <span aria-hidden="true">→</span></Link></section>
    <section className="panel getting-started"><div className="panel-heading"><div><p className="overline">ADMINISTRATION</p><h2>Your next steps</h2></div></div><Link className="action-row" href="/provisioning"><span className="action-number">01</span><span><strong>Prepare a restaurant</strong><small>Review the onboarding information needed.</small></span><span aria-hidden="true">→</span></Link><Link className="action-row" href="/restaurant-details"><span className="action-number">02</span><span><strong>Review restaurant details</strong><small>Select a restaurant from your directory.</small></span><span aria-hidden="true">→</span></Link><Link className="action-row" href="/settings"><span className="action-number">03</span><span><strong>Review your workspace</strong><small>Account, session and connection information.</small></span><span aria-hidden="true">→</span></Link></section></div>
    <div className="quiet-note"><span aria-hidden="true">◇</span><p>All totals reflect recorded platform data. Refresh the page to retrieve the latest figures.</p></div>
  </>;
}
