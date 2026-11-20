"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PlatformBootstrapSnapshot, PlatformBootstrapStepRequest, RuntimeBrandingPalette } from "@restaurant-platform/shared-types";
import { applyBootstrapStep, initializeRestaurantBranding, refreshBootstrap } from "@/app/(admin)/actions";
import { BootstrapDraftError, bootstrapKinds, buildBootstrapStep, latestMediaOperationKey, readInitialPalette, reconciledStep, setupChecklist, stepLabels, type BootstrapKind } from "@/lib/bootstrap";
import { OwnerInvitation } from "./OwnerInvitation";
import { Button, Field, Notice } from "./ui";

type Review = { type: "palette"; palette: RuntimeBrandingPalette } | { type: "step"; request: PlatformBootstrapStepRequest };

function reviewRows(value: unknown, prefix = ""): [string, string][] {
  if (value === null || typeof value !== "object") return [[prefix, value === null ? "Pending / not set" : String(value)]];
  return Object.entries(value).flatMap(([key, item]) => reviewRows(item, prefix ? `${prefix} / ${key}` : key));
}

export function RestaurantBootstrap({ initial }: { initial: PlatformBootstrapSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [kind, setKind] = useState<BootstrapKind>("CATEGORY");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [reviewStale, setReviewStale] = useState(false);
  const gate = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const frozen = snapshot.handedOff || snapshot.blockers.includes("RESTAURANT_IN_USE");
  const writingDisabled = busy || frozen || needsReconciliation || reviewStale;

  useEffect(() => {
    if (review) {
      reviewHeading.current?.scrollIntoView({ block: "start" });
      reviewHeading.current?.focus({ preventScroll: true });
    } else reviewTrigger.current?.focus();
  }, [review]);

  async function reload() {
    const result = await refreshBootstrap(snapshot.restaurantId);
    if (!result.ok) { setError("Setup could not be refreshed. Writes remain blocked until the current state is confirmed."); setNeedsReconciliation(true); return false; }
    setSnapshot(result.data);
    setError(null);
    const receipt = review?.type === "step" ? reconciledStep(result.data, review.request) : undefined;
    if (review?.type === "step" && review.request.kind === "MEDIA_MANIFEST" && (reviewStale || (!receipt && latestMediaOperationKey(result.data) !== review.request.expectedMediaOperationKey))) {
      setMessage("The current media manifest is refreshed. Cancel this old review and rebuild the mapping from the current manifest before saving; its reviewed values have not been changed.");
      setReviewStale(true); setNeedsReconciliation(false); setRetryAllowed(false);
    } else if (review?.type === "step" && receipt) {
      setMessage(`An existing receipt for key ${receipt.operationKey} was found${receipt.resourceId ? ` with record ${receipt.resourceId}` : ""}. Confirm an exact replay to verify that this reviewed payload matches; a receipt alone may belong to an earlier proposal.`);
      setNeedsReconciliation(false); setRetryAllowed(true);
    } else if (review?.type === "palette" && result.data.branding.revision > 0) {
      setMessage("A runtime palette is now persisted. Review the current palette below; initial setup cannot overwrite it.");
      setReview(null); setNeedsReconciliation(false); setRetryAllowed(false);
    } else if (review && needsReconciliation) {
      setMessage("Current state was refreshed. This operation is not recorded. You may explicitly retry the same reviewed request and key.");
      setNeedsReconciliation(false); setRetryAllowed(true);
    } else { setNeedsReconciliation(false); }
    return true;
  }

  async function refresh() {
    if (gate.current) return;
    gate.current = true; setBusy(true);
    try { await reload(); } catch { setError("Setup could not be refreshed. Reconcile before another write."); setNeedsReconciliation(true); }
    finally { gate.current = false; setBusy(false); }
  }

  function prepare(event: FormEvent<HTMLFormElement>, type: "step" | "palette") {
    event.preventDefault();
    if (writingDisabled || review) return;
    setFieldError({}); setError(null); setMessage(null); setRetryAllowed(false);
    setReviewStale(false);
    try {
      const form = new FormData(event.currentTarget);
      reviewTrigger.current = event.currentTarget.querySelector<HTMLElement>('button[type="submit"]');
      setReview(type === "palette" ? { type, palette: readInitialPalette(form) } : { type, request: buildBootstrapStep(kind, form, snapshot) });
    } catch (failure) {
      if (failure instanceof BootstrapDraftError) {
        setFieldError({ [failure.field]: failure.message });
        const invalid = event.currentTarget.elements.namedItem(failure.field);
        if (invalid instanceof HTMLElement) invalid.focus();
      }
      setError(failure instanceof Error ? failure.message : "Check the setup values.");
    }
  }

  async function confirm() {
    if (!review || gate.current || writingDisabled) return;
    gate.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const result = review.type === "palette"
        ? await initializeRestaurantBranding(snapshot.restaurantId, review.palette)
        : await applyBootstrapStep(snapshot.restaurantId, review.request);
      if (result.ok) {
        setMessage(review.type === "palette" ? "Runtime palette initialization confirmed." : `Operation ${review.request.operationKey} confirmed.`);
        // Keep the reviewed payload until a trusted read confirms the resulting state.
        setNeedsReconciliation(true); setRetryAllowed(false);
        const fresh = await refreshBootstrap(snapshot.restaurantId);
        if (fresh.ok) { setSnapshot(fresh.data); setReview(null); setNeedsReconciliation(false); }
        else setError("The write was confirmed, but setup refresh failed. Refresh before another write.");
      } else {
        setError(result.message); setFieldError(result.fields);
        setNeedsReconciliation(Boolean(result.uncertain)); setRetryAllowed(false);
        if ("rebuildRequired" in result && result.rebuildRequired) setReviewStale(true);
      }
    } catch { setError("The result could not be confirmed. Refresh setup before any retry; keep the same operation key."); setNeedsReconciliation(true); setRetryAllowed(false); }
    finally { gate.current = false; setBusy(false); }
  }

  const field = (name: string, label: string, defaultValue = "", required = true, hint?: string) => <Field id={`setup-${name}`} label={label} required={required} error={fieldError[name]} hint={hint}><input name={name} defaultValue={defaultValue} maxLength={name === "operationKey" ? 100 : name === "description" ? 2000 : 255} /></Field>;
  const check = (name: string, label: string, defaultChecked = true) => <label className="bootstrap-check"><input type="checkbox" name={name} defaultChecked={defaultChecked} /> {label}</label>;
  const select = (name: string, label: string, options: { id: string; name: string }[], optional = false) => <Field id={`setup-${name}`} label={label} required={!optional} error={fieldError[name]}><select name={name} defaultValue=""><option value="">{optional ? "Pending UUID mapping" : "Select a returned record"}</option>{options.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></Field>;
  const price = () => field("price", `Price (${snapshot.currency}, whole currency)`, "0");

  return <div className="bootstrap-workflow">
    <nav className="setup-actions" aria-label="Setup stages"><a href="#setup-owner">A · Restaurant and Owner</a><a href="#setup-branding">B · Runtime palette</a><a href="#setup-catalog">C · Catalog and ordering</a><a href="#setup-media">D · Media mapping</a><a href="#setup-handoff">E · Handoff</a></nav>
    {error && <Notice title="Setup needs attention" tone="error">{error}</Notice>}
    {message && <Notice title="Setup status" tone="success">{message}</Notice>}
    <div className="setup-actions"><Button variant="secondary" disabled={busy} onClick={refresh}>{busy ? "Checking setup…" : "Refresh and reconcile setup"}</Button><span className="muted small">Restaurant UUID: {snapshot.restaurantId}</span></div>
    {needsReconciliation && <Notice title="Writes paused" tone="warning">Refresh the current setup before another operation. Keep the reviewed operation key and values for recovery.</Notice>}
    {frozen && <Notice title="Initial setup is closed" tone="info">{snapshot.handedOff ? "Operations handoff has been recorded." : "This restaurant has order activity."} Owner and Manager continue catalog and palette management through their existing Operations permissions.</Notice>}

    <section className="panel lifecycle-panel" id="setup-owner"><p className="overline">STAGE A</p><h2>Restaurant and Owner</h2><p>The restaurant record is provisioned. Invitation acceptance and account setup are separate states.</p>{snapshot.owners.length ? snapshot.owners.map(owner => <OwnerInvitation key={owner.userId} restaurantId={snapshot.restaurantId} owner={owner} />) : <Notice title="Owner missing" tone="warning">No Owner membership is recorded.</Notice>}</section>

    <section className="panel lifecycle-panel" id="setup-branding"><p className="overline">STAGE B</p><h2>Initial runtime palette</h2>
      {snapshot.branding.palette ? <><p>Persisted revision {snapshot.branding.revision}. Subsequent edits belong to Owner/Manager Operations settings.</p><dl className="detail-list">{Object.entries(snapshot.branding.palette).map(([label, color]) => <div key={label}><dt>{label}</dt><dd><span className="palette-swatch" style={{ backgroundColor: color }} aria-hidden="true" />{color}</dd></div>)}</dl></> : <form className="provision-form" onSubmit={event => prepare(event, "palette")}><p className="muted">Enter this restaurant’s approved colors. Confirmation initializes the canonical palette once at expected revision 0.</p><fieldset className="configuration-section" disabled={writingDisabled || review !== null}><div className="form-grid">{field("primaryColor", "Primary color", "", true, "#RRGGBB")}{field("secondaryColor", "Secondary color", "", true, "#RRGGBB")}{field("backgroundColor", "Background color", "", true, "#RRGGBB")}</div><div className="form-actions"><Button type="submit">Review palette initialization</Button></div></fieldset></form>}
    </section>

    <section className="panel lifecycle-panel" id="setup-catalog"><p className="overline">STAGE C</p><h2>Approved initial catalog and ordering</h2><p className="muted">Prepare one reviewed step at a time. Use a unique, stable operation key for each approved record; keep the same key and values when recovering a step.</p>
      <div className="bootstrap-records"><h3>Returned catalog records</h3><ul className="setup-list">{snapshot.categories.map(item => <li key={item.id}>Category: {item.name} · {item.id}{!item.active && " · inactive"}</li>)}{snapshot.products.map(item => <li key={item.id}>Product: {item.name} · {item.id} · {item.price} {snapshot.currency}{!item.available && " · unavailable"}</li>)}{snapshot.variants.map(item => <li key={item.id}>Variant: {item.name} · {item.id} · product {item.productId} · {item.price} {snapshot.currency}</li>)}{snapshot.modifierGroups.map(item => <li key={item.id}>Modifier group: {item.name} · {item.id} · {item.required ? "required" : "optional"} · {item.minSelections}–{item.maxSelections} choices<ul>{item.options.map(option => <li key={option.id}>{option.name} · {option.id} · +{option.additionalPrice} {snapshot.currency}</li>)}</ul></li>)}{snapshot.productModifierGroups.map(item => <li key={`${item.productId}:${item.modifierGroupId}`}>Product {item.productId} uses modifier group {item.modifierGroupId}</li>)}{!snapshot.categories.length && !snapshot.products.length && <li>No initial catalog records yet.</li>}</ul></div>
      <form className="provision-form" onSubmit={event => prepare(event, "step")}><fieldset className="configuration-section" disabled={writingDisabled || review !== null}><Field id="setup-kind" label="Setup step"><select value={kind} onChange={event => { setKind(event.target.value as BootstrapKind); setFieldError({}); }} name="kind">{bootstrapKinds.map(value => <option key={value} value={value}>{stepLabels[value]}</option>)}</select></Field>
      <div className="form-grid" key={kind}>
        {field("operationKey", "Stable operation key", "", true, "Example: approved-menu-01-category. Save this key with your operator review record.")}
        {["CATEGORY", "PRODUCT", "VARIANT", "MODIFIER_GROUP", "MODIFIER_OPTION"].includes(kind) && field("name", "Name")}
        {kind === "CATEGORY" && <>{field("displayOrder", "Display order", "0")}{check("active", "Category active")}</>}
        {kind === "PRODUCT" && <>{select("categoryId", "Category", snapshot.categories.filter(item => item.active))}{field("description", "Description", "", false)}{price()}{check("available", "Product available")}{check("trackStock", "Track stock", false)}{field("stockQuantity", "Stock quantity (used when stock tracking is enabled)", "0")}</>}
        {kind === "VARIANT" && <>{select("productId", "Product", snapshot.products)}{field("description", "Description", "", false)}{price()}{check("available", "Variant available")}</>}
        {kind === "MODIFIER_GROUP" && <>{check("required", "Selection required", false)}{field("minSelections", "Minimum selections", "0")}{field("maxSelections", "Maximum selections", "1")}{check("active", "Modifier group active")}</>}
        {kind === "MODIFIER_OPTION" && <>{select("modifierGroupId", "Modifier group", snapshot.modifierGroups)}{field("additionalPrice", `Additional price (${snapshot.currency}, whole currency)`, "0")}{check("available", "Option available")}</>}
        {kind === "ATTACH_MODIFIER_GROUP" && <>{select("productId", "Product", snapshot.products)}{select("modifierGroupId", "Modifier group", snapshot.modifierGroups)}</>}
        {kind === "ORDERING_SETTINGS" && <><p>Currency: {snapshot.currency} · Timezone: {snapshot.settings.timezone}. These use the provisioned restaurant settings.</p>{field("minimumOrder", `Minimum order (${snapshot.currency})`, String(snapshot.settings.minimumOrder))}{field("defaultDeliveryFee", `Default delivery fee (${snapshot.currency})`, String(snapshot.settings.defaultDeliveryFee))}{check("acceptsOrders", "Accept orders", snapshot.settings.acceptsOrders)}{check("allowQrOrder", "Allow QR orders", snapshot.settings.allowQrOrder)}{check("allowDelivery", "Allow delivery", snapshot.settings.allowDelivery)}{check("allowTakeaway", "Allow takeaway", snapshot.settings.allowTakeaway)}</>}
        {kind === "MEDIA_MANIFEST" && <>{field("originalFilename", "Original filename")}{select("productId", "Product mapping", snapshot.products, true)}{select("variantId", "Variant mapping (must belong to selected product)", snapshot.variants, true)}<Field id="setup-association" label="Intended image association"><select name="intendedAssociation"><option value="PRODUCT_IMAGE">Product image</option><option value="VARIANT_IMAGE">Variant image</option></select></Field><Field id="setup-review-status" label="Original and mapping review"><select name="reviewStatus"><option value="PENDING">Pending review or UUID mapping</option><option value="APPROVED">Approved original and exact UUID mapping</option></select></Field>{field("originalContentHash", "Original SHA-256 hash", "", false, "Required for approval. Keep the mapping pending until the original hash is observed.")}</>}
        {kind === "COMPLETE_CATALOG" && <p>Confirm the approved products, variants, prices, availability, required modifiers and ordering settings have been reviewed. Spring checks that active required groups can be satisfied.</p>}
        {kind === "HANDOFF" && <p>Record Owner Operations handoff only after the server checklist is ready. Photos and native build/release remain separately pending.</p>}
      </div><div className="form-actions"><Button type="submit" disabled={kind === "HANDOFF" && !snapshot.handoffReady}>Review {stepLabels[kind].toLowerCase()}</Button></div></fieldset></form>
    </section>

    <section className="panel lifecycle-panel" id="setup-media"><p className="overline">STAGE D</p><h2>Product media mapping manifest</h2><p>No images are uploaded in this milestone. Original assets, UUID mappings and publication verification may remain pending. Record or revise a mapping by its original filename using the Media mapping manifest step above. A reviewed update replaces the previous mapping for that filename.</p><div className="bootstrap-table"><table><caption className="sr-only">Initial media mappings</caption><thead><tr><th>Original filename</th><th>Association and returned UUIDs</th><th>Review</th><th>Original hash</th><th>Upload result</th></tr></thead><tbody>{snapshot.mediaManifest.map((item, index) => <tr key={`${item.originalFilename}:${index}`}><td>{item.originalFilename}</td><td>{item.intendedAssociation}<br />Restaurant: {item.restaurantId}<br />Product: {item.productId ?? "PENDING"}<br />Variant: {item.variantId ?? "PENDING"}</td><td>{item.reviewStatus}</td><td>{item.originalContentHash ?? "PENDING"}</td><td>{item.uploadStatus}</td></tr>)}</tbody></table>{!snapshot.mediaManifest.length && <p className="muted">No originals or verified media mappings recorded.</p>}</div></section>

    <section className="panel lifecycle-panel" id="setup-handoff"><p className="overline">STAGE E</p><h2>Owner Operations handoff</h2><dl className="detail-list">{setupChecklist(snapshot).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{snapshot.blockers.length > 0 && <Notice title="Handoff blockers" tone="warning"><ul>{snapshot.blockers.map(item => <li key={item}>{item.replaceAll("_", " ").toLowerCase()}</li>)}</ul></Notice>}<p className="muted">Native application IDs, signing, icon, splash and store publication use the separate release process. Creating this restaurant does not publish Android apps.</p></section>

    {review && <section className="panel lifecycle-panel review-panel" aria-labelledby="bootstrap-review-title"><p className="overline">REVIEW BEFORE WRITING</p><h2 id="bootstrap-review-title" ref={reviewHeading} tabIndex={-1}>{review.type === "palette" ? "Initialize this restaurant’s runtime palette?" : `Confirm ${stepLabels[review.request.kind as BootstrapKind].toLowerCase()}?`}</h2><p>Target restaurant: {snapshot.restaurantId}</p><dl className="detail-list">{reviewRows(review.type === "palette" ? { expectedRevision: 0, palette: review.palette } : review.request).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="form-actions"><Button variant="secondary" disabled={busy || needsReconciliation} onClick={() => { setReview(null); setError(null); setRetryAllowed(false); setReviewStale(false); }}>Cancel review</Button><Button disabled={writingDisabled} onClick={confirm}>{busy ? "Saving reviewed step…" : retryAllowed ? "Retry exact reviewed request" : "Confirm reviewed step"}</Button></div></section>}

    <section className="panel lifecycle-panel"><h2>Recorded setup operations</h2><p className="muted">Use these stable receipts when resuming setup. Catalog UUIDs are returned by trusted persistence.</p><ul className="setup-list">{snapshot.steps.map(step => <li key={step.operationKey}>{step.operationKey} · {step.kind} · {step.resourceId ?? "review receipt"} · {step.completedAt}</li>)}{!snapshot.steps.length && <li>No setup steps recorded.</li>}</ul></section>
  </div>;
}
