"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useEffect, useState } from "react";
import AccountMenu from "@/features/auth/AccountMenu";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api-request";
import {
  getPlatformOverview,
  getPlatformRestaurants,
  provisionPlatformRestaurant,
  type PlatformOverview,
  type PlatformPage,
  type PlatformProvisionResult,
  type PlatformRestaurant,
} from "@/features/platform-admin/api";
import {
  emptyProvisionForm,
  slugify,
  toProvisionRequest,
  validateProvisionForm,
  type ProvisionErrors,
  type ProvisionField,
  type ProvisionForm,
} from "@/features/platform-admin/provisioning";

type AccessState = "checking" | "granted" | "denied" | "signed-out" | "unavailable";
const PAGE_SIZE = 10;

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "The platform request could not be completed.";
}

function fieldError(errors: ProvisionErrors, field: ProvisionField) {
  return errors[field] ? <small className="admin-field-error">{errors[field]}</small> : null;
}

function Field({
  label, field, form, setForm, errors, required, children,
}: {
  label: string;
  field: ProvisionField;
  form: ProvisionForm;
  setForm: (value: (current: ProvisionForm) => ProvisionForm) => void;
  errors: ProvisionErrors;
  required?: boolean;
  children?: React.ReactNode;
}) {
  return <label className="admin-field">
    <span>{label}{required && <> <b>*</b></>}</span>
    {children || <input
      value={form[field]}
      onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
      aria-invalid={Boolean(errors[field])}
    />}
    {fieldError(errors, field)}
  </label>;
}

export default function PlatformAdminDashboard() {
  const { user, loading: authLoading, configurationError } = useAuth();
  const [access, setAccess] = useState<AccessState>("checking");
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewReload, setOverviewReload] = useState(0);
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<PlatformPage<PlatformRestaurant> | null>(null);
  const [registryState, setRegistryState] = useState<"loading" | "ready" | "error">("loading");
  const [registryError, setRegistryError] = useState("");
  const [registryReload, setRegistryReload] = useState(0);
  const [form, setForm] = useState<ProvisionForm>(emptyProvisionForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ProvisionErrors>({});
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<PlatformProvisionResult | null>(null);
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    if (authLoading) return;
    if (configurationError) {
      setAccess("unavailable");
      setOverviewError(configurationError);
      return;
    }
    if (!user) {
      setAccess("signed-out");
      setOverview(null);
      setPage(null);
      return;
    }

    let active = true;
    setAccess("checking");
    setOverviewError("");
    void getPlatformOverview().then((data) => {
      if (!active) return;
      setOverview(data);
      setAccess("granted");
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 403) setAccess("denied");
      else if (error instanceof ApiError && error.status === 401) setAccess("signed-out");
      else {
        setAccess("unavailable");
        setOverviewError(messageFor(error));
      }
    });
    return () => { active = false; };
  }, [authLoading, configurationError, overviewReload, user]);

  useEffect(() => {
    if (access !== "granted") return;
    const controller = new AbortController();
    setRegistryState("loading");
    setRegistryError("");
    void getPlatformRestaurants(search, pageIndex, PAGE_SIZE, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setPage(data);
      setRegistryState("ready");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 403) setAccess("denied");
      else if (error instanceof ApiError && error.status === 401) setAccess("signed-out");
      else {
        setRegistryError(messageFor(error));
        setRegistryState("error");
      }
    });
    return () => controller.abort();
  }, [access, pageIndex, registryReload, search]);

  function changeForm(field: ProvisionField, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !slugEdited ? { slug: slugify(value) } : {}),
    }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submitProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateProvisionForm(form);
    setFieldErrors(validation);
    setProvisionError("");
    setNotice("");
    if (Object.keys(validation).length) {
      setProvisionError("Review the highlighted fields and correct the form.");
      return;
    }

    setProvisionBusy(true);
    try {
      const provisioned = await provisionPlatformRestaurant(toProvisionRequest(form));
      setResult(provisioned);
      setNotice(`Restaurant created for ${provisioned.ownerEmail}.`);
      setOverviewReload((value) => value + 1);
      setRegistryReload((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setAccess("denied");
      if (error instanceof ApiError && error.status === 401) setAccess("signed-out");
      const detail = messageFor(error);
      setProvisionError(error instanceof ApiError && !error.status
        ? `${detail} Check the registry before retrying in case the restaurant was created.`
        : detail);
    } finally {
      setProvisionBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Clipboard access is unavailable. Select the link and copy it manually.");
    }
  }

  const totalPages = page?.totalPages ?? 0;
  const displayedPage = page ? page.number + 1 : pageIndex + 1;

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/">
        <span className="admin-brand-mark">R</span>
        <span>Restaurant<span>Platform</span></span>
      </Link>
      <div className="admin-side-label">PLATFORM</div>
      <nav className="admin-nav" aria-label="Admin dashboard navigation">
        {[["overview", "Overview", "◫"], ["registry", "Restaurants", "▤"], ["provision", "New restaurant", "+"]].map(([id, label, icon]) =>
          <a key={id} href={`#${id}`} className={activeSection === id ? "is-active" : ""} onClick={() => setActiveSection(id)}>
            <span aria-hidden="true">{icon}</span>{label}
          </a>)}
      </nav>
      <div className="admin-sidebar-footer">
        <span className={`admin-health-dot ${access === "granted" ? "is-ready" : ""}`} />
        {access === "granted" ? "Platform access verified" : "Platform access required"}
        <p>Every platform request is checked against the API administrator allowlist.</p>
        <Link href="/workspace">Open restaurant workspace ↗</Link>
      </div>
    </aside>

    <div className="admin-main">
      <header className="admin-topbar" id="overview">
        <div>
          <div className="admin-eyebrow">PLATFORM OPERATIONS / ADMIN</div>
          <h1>Admin dashboard</h1>
          <p>Monitor the platform and manage restaurant onboarding.</p>
        </div>
        <div className="admin-topbar-actions">
          <span className={`admin-connection-pill ${access === "granted" ? "is-connected" : ""}`}>
            <i />{access === "granted" ? "Access verified" : access === "checking" ? "Checking access" : "Secure operator access"}
          </span>
          <AccountMenu returnTo="/admin" />
        </div>
      </header>

      {configurationError && <div className="admin-alert is-error" role="alert">{configurationError}</div>}
      {notice && <div className="admin-alert is-success" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
      {provisionError && <div className="admin-alert is-error" role="alert"><span>{provisionError}</span><button onClick={() => setProvisionError("")} aria-label="Dismiss message">×</button></div>}

      {authLoading || access === "checking" ? <section className="admin-state-card" aria-live="polite">
        <span className="admin-spinner" /><h2>Checking platform access</h2><p>Restoring your session and asking the API to verify this account.</p>
      </section> : null}

      {!authLoading && access === "signed-out" && <section className="admin-state-card">
        <span className="admin-state-icon">↗</span><h2>Sign in to continue</h2>
        <p>Use your platform administrator account. The API checks the configured administrator allowlist.</p>
        <Link className="admin-submit-button" href="/login?next=%2Fadmin">Sign in</Link>
      </section>}

      {!authLoading && access === "denied" && <section className="admin-state-card is-denied" role="alert">
        <span className="admin-state-icon">!</span><h2>Platform administrator access required</h2>
        <p>This signed-in account is not enabled in the backend <code>PLATFORM_ADMIN_USER_IDS</code> allowlist. Restaurant owner or staff access does not grant platform access.</p>
        <AccountMenu returnTo="/admin" />
      </section>}

      {!authLoading && access === "unavailable" && <section className="admin-state-card" role="alert">
        <span className="admin-state-icon">!</span><h2>Platform data is unavailable</h2>
        <p>{overviewError || "The platform API could not verify this session."}</p>
        <button className="admin-secondary-button" onClick={() => setOverviewReload((value) => value + 1)}>Retry</button>
      </section>}

      {access === "granted" && <>
        <section className="admin-metrics" aria-label="Platform overview" aria-live="polite">
          {overview ? <>
            <article className="admin-metric-card"><span>Total restaurants</span><strong>{overview.totalRestaurants}</strong><small>All registered restaurants</small></article>
            <article className="admin-metric-card"><span>Active restaurants</span><strong>{overview.activeRestaurants}</strong><small>Available to operate</small></article>
            <article className="admin-metric-card"><span>Inactive restaurants</span><strong>{overview.inactiveRestaurants}</strong><small>Not currently active</small></article>
            <article className="admin-metric-card"><span>Orders</span><strong>{overview.totalOrders}</strong><small>Platform total</small></article>
            <article className="admin-metric-card"><span>Restaurant members</span><strong>{overview.totalRestaurantMembers}</strong><small>Across all restaurants</small></article>
          </> : <div className="admin-loading-inline"><span className="admin-spinner" /> Loading platform overview…</div>}
        </section>

        <section className="admin-registry-card" id="registry">
          <div className="admin-card-heading admin-registry-heading">
            <div><span className="admin-card-kicker">01 / DIRECTORY</span><h2>Restaurant registry</h2>
              <p>Search the backend registry by restaurant, location or owner.</p></div>
            <button className="admin-secondary-button" onClick={() => { setOverviewReload((value) => value + 1); setRegistryReload((value) => value + 1); }}>Refresh data</button>
          </div>
          <label className="admin-search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPageIndex(0); }} placeholder="Search name, slug, city, township or owner" aria-label="Search restaurants" /></label>
          {registryState === "loading" && <div className="admin-table-state" aria-live="polite"><span className="admin-spinner" /> Loading restaurants…</div>}
          {registryState === "error" && <div className="admin-table-state is-error" role="alert"><p>{registryError}</p><button className="admin-secondary-button" onClick={() => setRegistryReload((value) => value + 1)}>Retry registry</button></div>}
          {registryState === "ready" && page?.empty && <div className="admin-empty-state"><span>⌕</span><b>{search ? "No matching restaurants" : "No restaurants yet"}</b><p>{search ? "Try another name, owner or location." : "New restaurants will appear here after provisioning."}</p></div>}
          {registryState === "ready" && page && !page.empty && <>
            <div className="admin-table-wrap"><table className="admin-registry-table">
              <thead><tr><th>Restaurant</th><th>Owner</th><th>Location</th><th>Status</th><th>Members</th><th>Orders</th><th>Created</th></tr></thead>
              <tbody>{page.content.map((restaurant) => <tr key={restaurant.id}>
                <td><b>{restaurant.name}</b><small>/{restaurant.slug}</small></td>
                <td><b>{restaurant.ownerFullName || "Owner profile pending"}</b><small>{restaurant.ownerEmail || "No owner email"}</small></td>
                <td>{[restaurant.township, restaurant.city].filter(Boolean).join(", ") || "—"}</td>
                <td><span className={`admin-status-tag ${restaurant.active ? "is-active" : "is-inactive"}`}>{restaurant.active ? "Active" : "Inactive"}</span></td>
                <td>{restaurant.memberCount}</td><td>{restaurant.orderCount}</td>
                <td>{restaurant.createdAt ? new Date(restaurant.createdAt).toLocaleDateString() : "—"}</td>
              </tr>)}</tbody>
            </table></div>
            <div className="admin-pagination"><span>{page.totalElements} restaurant{page.totalElements === 1 ? "" : "s"} · Page {displayedPage} of {Math.max(1, totalPages)}</span><div>
              <button className="admin-secondary-button" disabled={page.first} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Previous</button>
              <button className="admin-secondary-button" disabled={page.last} onClick={() => setPageIndex((value) => value + 1)}>Next</button>
            </div></div>
          </>}
        </section>

        <div className="admin-content-grid admin-provision-grid">
          <section className="admin-provision-card" id="provision">
            <div className="admin-card-heading"><div><span className="admin-card-kicker">02 / ONBOARDING</span><h2>Provision a restaurant</h2>
              <p>Invite the owner, create the restaurant, and assign the first OWNER membership.</p></div><span className="admin-step-number">01</span></div>
            <form className="admin-form" onSubmit={(event) => void submitProvision(event)} noValidate>
              <fieldset><legend>Owner account</legend><div className="admin-form-grid">
                <Field label="Owner email" field="ownerEmail" form={form} setForm={(update) => changeForm("ownerEmail", update(form).ownerEmail)} errors={fieldErrors} required>
                  <input type="email" autoComplete="email" value={form.ownerEmail} maxLength={320} required onChange={(event) => changeForm("ownerEmail", event.target.value)} aria-invalid={Boolean(fieldErrors.ownerEmail)} placeholder="owner@example.com" />
                </Field>
                <Field label="Owner full name" field="ownerFullName" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}>
                  <input value={form.ownerFullName} maxLength={150} onChange={(event) => changeForm("ownerFullName", event.target.value)} placeholder="Owner name" />
                </Field>
              </div></fieldset>
              <fieldset><legend>Restaurant profile</legend><div className="admin-form-grid">
                <Field label="Restaurant name" field="name" form={form} setForm={(update) => setForm(update)} errors={fieldErrors} required>
                  <input value={form.name} maxLength={150} required onChange={(event) => changeForm("name", event.target.value)} placeholder="Green Garden Kitchen" aria-invalid={Boolean(fieldErrors.name)} />
                </Field>
                <Field label="Public slug" field="slug" form={form} setForm={(update) => setForm(update)} errors={fieldErrors} required>
                  <input value={form.slug} maxLength={100} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => { setSlugEdited(true); changeForm("slug", event.target.value.toLowerCase().trim()); }} placeholder="green-garden-kitchen" aria-invalid={Boolean(fieldErrors.slug)} />
                </Field>
                <Field label="Phone" field="phone" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}>
                  <input value={form.phone} maxLength={30} onChange={(event) => changeForm("phone", event.target.value)} placeholder="+95 …" />
                </Field>
                <Field label="Currency" field="currency" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}>
                  <select value={form.currency} onChange={(event) => changeForm("currency", event.target.value)}><option value="MMK">MMK — Myanmar kyat</option><option value="THB">THB — Thai baht</option><option value="USD">USD — US dollar</option></select>
                </Field>
                <Field label="City" field="city" form={form} setForm={(update) => setForm(update)} errors={fieldErrors} required><input value={form.city} maxLength={100} required onChange={(event) => changeForm("city", event.target.value)} aria-invalid={Boolean(fieldErrors.city)} /></Field>
                <Field label="Township" field="township" form={form} setForm={(update) => setForm(update)} errors={fieldErrors} required><input value={form.township} maxLength={100} required onChange={(event) => changeForm("township", event.target.value)} aria-invalid={Boolean(fieldErrors.township)} /></Field>
                <Field label="House / building" field="houseNo" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}><input value={form.houseNo} maxLength={50} onChange={(event) => changeForm("houseNo", event.target.value)} /></Field>
                <Field label="Street" field="street" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}><input value={form.street} maxLength={100} onChange={(event) => changeForm("street", event.target.value)} /></Field>
                <Field label="Ward" field="ward" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}><input value={form.ward} maxLength={100} onChange={(event) => changeForm("ward", event.target.value)} /></Field>
                <Field label="Timezone" field="timezone" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}>
                  <select value={form.timezone} onChange={(event) => changeForm("timezone", event.target.value)}><option>Asia/Yangon</option><option>Asia/Bangkok</option><option>Asia/Singapore</option><option>Asia/Kolkata</option><option>UTC</option></select>
                </Field>
                <Field label="Address" field="address" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}><input value={form.address} maxLength={2000} onChange={(event) => changeForm("address", event.target.value)} placeholder="Full address, landmark or directions" /></Field>
                <Field label="Description" field="description" form={form} setForm={(update) => setForm(update)} errors={fieldErrors}><textarea value={form.description} maxLength={4000} rows={3} onChange={(event) => changeForm("description", event.target.value)} placeholder="A short restaurant description" /></Field>
              </div></fieldset>
              <div className="admin-submit-row"><p>The backend checks your administrator access and validates the restaurant before provisioning.</p><button className="admin-submit-button" type="submit" disabled={provisionBusy}>{provisionBusy ? "Creating restaurant…" : "Create restaurant and invite owner"}<span aria-hidden="true">↗</span></button></div>
            </form>
          </section>
          <aside className="admin-right-rail">
            <section className="admin-guide-card"><span className="admin-card-kicker">HANDOFF</span><h2>What happens next</h2>
              <ol><li><span>1</span><div><b>Owner is invited</b><p>The invitation is sent through the configured Supabase Auth project.</p></div></li>
                <li><span>2</span><div><b>Restaurant is created</b><p>The owner receives the initial OWNER membership and default settings.</p></div></li>
                <li><span>3</span><div><b>Share the workspace</b><p>The owner accepts the invite and signs in to manage this restaurant.</p></div></li></ol>
            </section>
            <section className="admin-guidance-card"><div className="admin-guidance-icon">↗</div><div><b>One restaurant, one workspace</b><p>Owners manage their restaurant in the responsive workspace on laptop, tablet and phone.</p></div></section>
          </aside>
        </div>
      </>}

      {result && <div className="admin-result-backdrop" role="presentation" onClick={() => setResult(null)}>
        <section className="admin-result-modal" role="dialog" aria-modal="true" aria-labelledby="provision-result-title" onClick={(event) => event.stopPropagation()}>
          <div className="admin-result-header"><span className="admin-result-check">✓</span><button className="admin-close-button" onClick={() => setResult(null)} aria-label="Close result">×</button><span className="admin-card-kicker">SETUP COMPLETE</span><h2 id="provision-result-title">{result.restaurant.name}</h2><p>{result.invitationSent ? `Owner invitation sent to ${result.ownerEmail}.` : "Owner account attached and OWNER access assigned."}</p></div>
          <div className="admin-handoff-links"><div><span>OWNER WORKSPACE</span><a href={result.ownerWorkspaceUrl} target="_blank" rel="noreferrer">{result.ownerWorkspaceUrl}</a><button onClick={() => void copy(result.ownerWorkspaceUrl, "Owner workspace link")}>Copy workspace link</button></div></div>
          {result.commonQrUrl && <div className="admin-qr-handoff"><div className="admin-qr-code"><QRCodeSVG value={result.commonQrUrl} size={152} marginSize={2} level="M" /></div><div><span className="admin-card-kicker">COMMON QR</span><h3>Guest ordering link</h3><p>Share this QR with the restaurant owner for their public pickup ordering flow.</p><div className="admin-qr-actions"><button onClick={() => void copy(result.commonQrUrl, "Common QR link")}>Copy QR link</button><button onClick={() => window.print()}>Print QR</button></div></div></div>}
          <p className="admin-secret-note">The one-time QR credential is available only in this handoff. Close this window after sharing it.</p>
          <div className="admin-result-footer"><button className="admin-secondary-button" onClick={() => setResult(null)}>Close handoff</button><button className="admin-submit-button" onClick={() => { setResult(null); setForm(emptyProvisionForm); setFieldErrors({}); setSlugEdited(false); }}>Provision another restaurant <span aria-hidden="true">↗</span></button></div>
        </section>
      </div>}

      <footer className="admin-footer"><span>Restaurant Platform · Admin</span><span>Platform data is protected by the backend allowlist</span><Link href="/workspace">Restaurant workspace ↗</Link></footer>
    </div>
  </main>;
}
