"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

type ProvisionForm = {
  ownerEmail: string;
  ownerFullName: string;
  name: string;
  slug: string;
  phone: string;
  description: string;
  address: string;
  houseNo: string;
  street: string;
  ward: string;
  township: string;
  city: string;
  currency: string;
  timezone: string;
};

type ProvisionResponse = {
  ownerUserId?: string;
  ownerEmail?: string;
  invitationSent?: boolean;
  ownerRole?: string;
  restaurant?: { id?: string; name?: string; slug?: string; currency?: string };
  ownerWorkspaceUrl?: string;
  commonQrUrl?: string;
  commonQrToken?: string;
};

type RecentProvision = {
  id: string;
  name: string;
  email: string;
  role: string;
  invitationSent: boolean;
};

const emptyForm: ProvisionForm = {
  ownerEmail: "",
  ownerFullName: "",
  name: "",
  slug: "",
  phone: "",
  description: "",
  address: "",
  houseNo: "",
  street: "",
  ward: "",
  township: "",
  city: "",
  currency: "MMK",
  timezone: "Asia/Yangon",
};

function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-").slice(0, 100);
}

function messageFrom(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const row = payload as Record<string, unknown>;
  if (typeof row.message === "string" && row.message.trim()) return row.message;
  if (typeof row.detail === "string" && row.detail.trim()) return row.detail;
  if (typeof row.error === "string" && row.error.trim()) return row.error;
  return fallback;
}

export default function PlatformAdminDashboard() {
  const [apiUrl, setApiUrl] = useState(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState<ProvisionForm>(emptyForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [result, setResult] = useState<ProvisionResponse | null>(null);
  const [recent, setRecent] = useState<RecentProvision[]>([]);
  const [activeSection, setActiveSection] = useState("overview");

  async function provisionRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);

    const base = apiUrl.trim().replace(/\/+$/, "");
    if (!base) {
      setError("Enter the backend API URL.");
      setBusy(false);
      return;
    }
    if (!accessToken.trim()) {
      setError("Paste a platform admin Supabase access token.");
      setBusy(false);
      return;
    }

    const payload = {
      ownerEmail: form.ownerEmail.trim(),
      ownerFullName: form.ownerFullName.trim() || null,
      restaurant: {
        name: form.name.trim(),
        slug: form.slug.trim(),
        phone: form.phone.trim() || null,
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        houseNo: form.houseNo.trim() || null,
        street: form.street.trim() || null,
        ward: form.ward.trim() || null,
        township: form.township.trim(),
        city: form.city.trim(),
        latitude: null,
        longitude: null,
        logoUrl: null,
        currency: form.currency,
        timezone: form.timezone,
      },
    };

    try {
      const response = await fetch(`${base}/api/v1/platform/restaurants`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const responseBody: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setAuthorized(false);
        const statusMessage = response.status === 401
          ? "Authentication failed. Check the Supabase access token."
          : response.status === 403
            ? "This account is not enabled as a platform admin."
            : response.status === 503
              ? "Owner invitations are not configured on the backend."
              : `The backend returned HTTP ${response.status}.`;
        throw new Error(messageFrom(responseBody, statusMessage));
      }

      if (!responseBody || typeof responseBody !== "object") {
        throw new Error("The backend returned an invalid provisioning response.");
      }
      const created = responseBody as ProvisionResponse;
      if (!created.restaurant) throw new Error("The backend did not return the created restaurant details.");
      setResult(created);
      setAuthorized(true);
      setNotice(`Restaurant provisioned for ${created.ownerEmail || payload.ownerEmail}.`);
      setRecent((items) => [{
        id: String(created.restaurant?.id || crypto.randomUUID()),
        name: String(created.restaurant?.name || payload.restaurant.name),
        email: String(created.ownerEmail || payload.ownerEmail),
        role: String(created.ownerRole || "OWNER"),
        invitationSent: Boolean(created.invitationSent),
      }, ...items]);
    } catch (cause) {
      setError(cause instanceof TypeError
        ? "Could not reach the backend. Check the API URL and CORS configuration."
        : cause instanceof Error ? cause.message : "Could not complete restaurant provisioning.");
    } finally {
      setBusy(false);
    }
  }

  function copy(value: string, label: string) {
    if (!navigator.clipboard) {
      setNotice("Clipboard access is unavailable in this browser.");
      return;
    }
    void navigator.clipboard.writeText(value).then(() => setNotice(`${label} copied.`))
      .catch(() => setNotice("Clipboard access is unavailable in this browser."));
  }

  const invitesSent = recent.filter((item) => item.invitationSent).length;
  const latestRestaurant = recent[0]?.name || "No restaurants created this session";

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/">
        <span className="admin-brand-mark">R</span>
        <span>Restaurant<span>Platform</span></span>
      </Link>
      <div className="admin-side-label">PLATFORM</div>
      <nav className="admin-nav" aria-label="Admin dashboard navigation">
        {[["overview", "Overview", "◫"], ["provision", "New restaurant", "+"], ["recent", "This session", "◷"]].map(([id, label, icon]) =>
          <a key={id} href={`#${id}`} className={activeSection === id ? "is-active" : ""} onClick={() => setActiveSection(id)}>
            <span aria-hidden="true">{icon}</span>{label}
          </a>)}
      </nav>
      <div className="admin-sidebar-footer">
        <span className={`admin-health-dot ${authorized ? "is-ready" : ""}`} />
        {authorized ? "API access verified" : "API not connected"}
        <p>Platform access is checked by the backend for every request.</p>
        <Link href="/workspace">Open owner workspace ↗</Link>
      </div>
    </aside>

    <div className="admin-main">
      <header className="admin-topbar" id="overview">
        <div>
          <div className="admin-eyebrow">PLATFORM OPERATIONS / ADMIN</div>
          <h1>Admin dashboard</h1>
          <p>Set up restaurants and hand off access to their owners.</p>
        </div>
        <span className={`admin-connection-pill ${authorized ? "is-connected" : ""}`}>
          <i />{authorized ? "Access verified" : "Secure operator access"}
        </span>
      </header>

      <section className="admin-metrics" aria-label="This session summary">
        <article className="admin-metric-card"><span>Created this session</span><strong>{recent.length}</strong><small>Restaurant setups from this browser session</small></article>
        <article className="admin-metric-card"><span>Invitations sent</span><strong>{invitesSent}</strong><small>New owner invitations confirmed by the API</small></article>
        <article className="admin-metric-card admin-metric-wide"><span>Latest restaurant</span><strong>{latestRestaurant}</strong><small>Recent activity is held in memory and clears when you leave.</small></article>
      </section>

      <section className="admin-connection-card" aria-label="Backend connection">
        <div className="admin-connection-heading">
          <div><span className="admin-card-kicker">01 / CONNECTION</span><h2>Connect platform access</h2>
            <p>Use a Supabase access token from an account enabled in <code>PLATFORM_ADMIN_USER_IDS</code>.</p></div>
          <span className={`admin-status-badge ${authorized ? "is-authorized" : ""}`}>{authorized ? "Access verified" : "Token required"}</span>
        </div>
        <div className="admin-connection-fields">
          <label className="admin-field"><span>Backend API URL</span><input value={apiUrl} onChange={(event) => { setApiUrl(event.target.value); setAuthorized(false); }} placeholder="http://localhost:8080" required /></label>
          <label className="admin-field"><span>Platform admin access token</span>
            <span className="admin-token-field"><input type={showToken ? "text" : "password"} value={accessToken} onChange={(event) => { setAccessToken(event.target.value); setAuthorized(false); }} placeholder="Paste Supabase access token" autoComplete="off" required />
              <button type="button" onClick={() => setShowToken((value) => !value)}>{showToken ? "Hide" : "Show"}</button></span>
          </label>
        </div>
        <p className="admin-privacy-note">The token stays in page memory only. This dashboard does not save it in browser storage.</p>
      </section>

      {(error || notice) && <div className={`admin-alert ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>
        <span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message">×</button>
      </div>}

      <div className="admin-content-grid">
        <section className="admin-provision-card" id="provision">
          <div className="admin-card-heading">
            <div><span className="admin-card-kicker">02 / ONBOARDING</span><h2>Provision a restaurant</h2>
              <p>Invite the owner, create the restaurant, and assign the first OWNER membership.</p></div>
            <span className="admin-step-number">01</span>
          </div>
          <form className="admin-form" onSubmit={provisionRestaurant}>
            <fieldset>
              <legend>Owner account</legend>
              <div className="admin-form-grid">
                <label className="admin-field"><span>Owner email <b>*</b></span><input type="email" value={form.ownerEmail} onChange={(event) => setForm({ ...form, ownerEmail: event.target.value })} placeholder="owner@example.com" maxLength={320} required /></label>
                <label className="admin-field"><span>Owner full name</span><input value={form.ownerFullName} onChange={(event) => setForm({ ...form, ownerFullName: event.target.value })} placeholder="Owner name" maxLength={150} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Restaurant profile</legend>
              <div className="admin-form-grid">
                <label className="admin-field"><span>Restaurant name <b>*</b></span><input value={form.name} onChange={(event) => {
                  const name = event.target.value;
                  setForm((current) => ({ ...current, name, ...(!slugEdited ? { slug: slugify(name) } : {}) }));
                }} placeholder="e.g. Green Garden Kitchen" maxLength={150} required /></label>
                <label className="admin-field"><span>Public slug <b>*</b></span><input value={form.slug} onChange={(event) => { setSlugEdited(true); setForm({ ...form, slug: event.target.value.toLowerCase().trim() }); }} placeholder="green-garden-kitchen" maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><small>Lowercase letters, numbers and hyphens.</small></label>
                <label className="admin-field"><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+95 …" maxLength={30} /></label>
                <label className="admin-field"><span>Currency</span><select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="MMK">MMK — Myanmar kyat</option><option value="THB">THB — Thai baht</option><option value="USD">USD — US dollar</option></select></label>
                <label className="admin-field"><span>City <b>*</b></span><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="City" maxLength={100} required /></label>
                <label className="admin-field"><span>Township <b>*</b></span><input value={form.township} onChange={(event) => setForm({ ...form, township: event.target.value })} placeholder="Township" maxLength={100} required /></label>
                <label className="admin-field"><span>House / building</span><input value={form.houseNo} onChange={(event) => setForm({ ...form, houseNo: event.target.value })} maxLength={50} /></label>
                <label className="admin-field"><span>Street</span><input value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} maxLength={100} /></label>
                <label className="admin-field"><span>Ward</span><input value={form.ward} onChange={(event) => setForm({ ...form, ward: event.target.value })} maxLength={100} /></label>
                <label className="admin-field"><span>Timezone</span><select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Asia/Yangon</option><option>Asia/Bangkok</option><option>Asia/Singapore</option><option>Asia/Kolkata</option><option>UTC</option></select></label>
                <label className="admin-field admin-field-wide"><span>Address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Full address, landmark or directions" maxLength={2000} /></label>
                <label className="admin-field admin-field-wide"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="A short description of the restaurant" maxLength={4000} rows={3} /></label>
              </div>
            </fieldset>
            <div className="admin-submit-row"><p>Backend validation and platform admin authorization are applied when you submit.</p><button className="admin-submit-button" type="submit" disabled={busy}>{busy ? "Creating restaurant…" : "Create restaurant and invite owner"}<span aria-hidden="true">↗</span></button></div>
          </form>
        </section>

        <aside className="admin-right-rail">
          <section className="admin-guide-card">
            <span className="admin-card-kicker">HANDOFF</span><h2>What happens next</h2>
            <ol><li><span>1</span><div><b>Owner is invited</b><p>The invitation is sent through the configured Supabase Auth project.</p></div></li><li><span>2</span><div><b>Restaurant is created</b><p>The new owner receives the initial OWNER membership and default settings.</p></div></li><li><span>3</span><div><b>Share the workspace</b><p>Send the owner workspace link. They still need to accept the invite and sign in.</p></div></li></ol>
          </section>
          <section className="admin-guidance-card"><div className="admin-guidance-icon">↗</div><div><b>One restaurant, one workspace</b><p>Owners manage their restaurant in a responsive workspace on laptop, tablet or phone. Per-restaurant app packaging is outside this dashboard setup.</p></div></section>
          <section className="admin-recent-card" id="recent"><div className="admin-recent-heading"><div><span className="admin-card-kicker">03 / RECENT</span><h2>Created this session</h2></div><span>{recent.length}</span></div>
            {recent.length ? <div className="admin-recent-list">{recent.slice(0, 5).map((item) => <article key={item.id}><div className="admin-restaurant-avatar">{item.name.slice(0, 1).toUpperCase()}</div><div className="admin-recent-copy"><b>{item.name}</b><span>{item.email}</span></div><span className="admin-mini-badge">{item.role}</span></article>)}</div>
              : <div className="admin-empty-recent"><span>↗</span><b>Ready for your first setup</b><p>New restaurant handoffs from this session will appear here.</p></div>}
          </section>
        </aside>
      </div>

      {result && <div className="admin-result-backdrop" role="presentation" onClick={() => setResult(null)}>
        <section className="admin-result-modal" role="dialog" aria-modal="true" aria-labelledby="provision-result-title" onClick={(event) => event.stopPropagation()}>
          <div className="admin-result-header"><span className="admin-result-check">✓</span><button className="admin-close-button" onClick={() => setResult(null)} aria-label="Close result">×</button><span className="admin-card-kicker">SETUP COMPLETE</span><h2 id="provision-result-title">{result.restaurant?.name || "Restaurant created"}</h2><p>{result.invitationSent ? `Owner invitation sent to ${result.ownerEmail || form.ownerEmail}.` : "Owner account attached and OWNER access assigned."}</p></div>
          <div className="admin-handoff-links"><div><span>OWNER WORKSPACE</span><a href={result.ownerWorkspaceUrl} target="_blank" rel="noreferrer">{result.ownerWorkspaceUrl || "No workspace link returned"}</a>{result.ownerWorkspaceUrl && <button onClick={() => copy(result.ownerWorkspaceUrl!, "Owner workspace link")}>Copy link</button>}</div></div>
          {result.commonQrUrl && <div className="admin-qr-handoff"><div className="admin-qr-code"><QRCodeSVG value={result.commonQrUrl} size={152} marginSize={2} level="M" /></div><div><span className="admin-card-kicker">COMMON QR</span><h3>Guest ordering link</h3><p>The link contains a one-time QR credential. Share it only with the restaurant owner.</p><code>{result.commonQrUrl}</code><div className="admin-qr-actions"><button onClick={() => copy(result.commonQrUrl!, "Common QR link")}>Copy QR link</button><button onClick={() => window.print()}>Print QR</button></div></div></div>}
          {result.commonQrToken && <div className="admin-token-result"><span>ONE-TIME QR TOKEN</span><code>{result.commonQrToken}</code><button onClick={() => copy(result.commonQrToken!, "Common QR token")}>Copy token</button></div>}
          <p className="admin-secret-note">This response is held in memory only. Close it after handing off the link; the raw QR credential is not stored in the dashboard history.</p>
          <div className="admin-result-footer"><button className="admin-secondary-button" onClick={() => setResult(null)}>Close and clear secret</button><button className="admin-submit-button" onClick={() => { setResult(null); setForm(emptyForm); setSlugEdited(false); }}>Provision another restaurant <span aria-hidden="true">↗</span></button></div>
        </section>
      </div>}

      <footer className="admin-footer"><span>Restaurant Platform · Admin</span><span>Responsive operator workspace</span><Link href="/workspace">Owner dashboard ↗</Link></footer>
    </div>
  </main>;
}
