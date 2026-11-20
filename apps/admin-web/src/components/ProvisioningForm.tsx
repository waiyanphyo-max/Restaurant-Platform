"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { provisionRestaurant, reconcileProvisioning } from "@/app/(admin)/actions";
import { Button, Field, Notice } from "./ui";
import type { MutationFailure } from "@/lib/lifecycle";
import { createProvisioningAttemptStore, type ProvisioningAttemptScope } from "@/lib/provisioning-attempt";

export interface ProvisioningDraft {
  name: string; slug: string; city: string; township: string; ownerFullName: string; ownerEmail: string;
  ownerUserId?: string; address?: string; phone?: string; timezone?: string; currency?: string;
  logoUrl?: string;
}
type DraftErrors = Partial<Record<keyof ProvisioningDraft, string>>;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateProvisioningDraft(draft: ProvisioningDraft): DraftErrors {
  const errors: DraftErrors = {};
  const limits: Partial<Record<keyof ProvisioningDraft, number>> = { name: 150, slug: 100, city: 100, township: 100, ownerFullName: 150, ownerEmail: 320, address: 2000, phone: 30, timezone: 60, logoUrl: 2000 };
  for (const key of ["name", "slug", "city", "township", "ownerEmail"] as const) if (!draft[key].trim()) errors[key] = "Enter a value for this field.";
  for (const [key, limit] of Object.entries(limits)) if ((draft[key as keyof ProvisioningDraft]?.length ?? 0) > limit) errors[key as keyof ProvisioningDraft] = `Use ${limit} characters or fewer.`;
  if (draft.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) errors.slug = "Use lowercase letters, numbers and single hyphens between words.";
  if (draft.ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.ownerEmail)) errors.ownerEmail = "Enter a valid email address.";
  if (draft.ownerUserId && !uuidPattern.test(draft.ownerUserId)) errors.ownerUserId = "Enter the exact Supabase Auth user UUID.";
  if (draft.currency !== undefined && !/^[A-Za-z]{3}$/.test(draft.currency)) errors.currency = "Use a three-letter currency code.";
  if (draft.timezone !== undefined) {
    try { if (!draft.timezone) throw new Error(); new Intl.DateTimeFormat("en", { timeZone: draft.timezone }); }
    catch { errors.timezone = "Enter a valid timezone, such as Asia/Yangon."; }
  }
  if (draft.logoUrl) { try { const url = new URL(draft.logoUrl); if (url.protocol !== "https:" || url.username || url.password || /[?#\s]/.test(draft.logoUrl)) throw new Error(); } catch { errors.logoUrl = "Use a public HTTPS logo URL without credentials, query or fragment."; } }
  return errors;
}

export function ProvisioningForm({ recoveryScope }: { recoveryScope: ProvisioningAttemptScope }) {
  const [review, setReview] = useState<ProvisioningDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; ownerInvitationStatus: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertainSlug, setUncertainSlug] = useState<string | null>(null);
  const [reconciledId, setReconciledId] = useState<string | null>(null);
  const [reconciledAbsentSlug, setReconciledAbsentSlug] = useState<string | null>(null);
  const submitting = useRef(false);
  const attemptStore = useRef<ReturnType<typeof createProvisioningAttemptStore> | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const verifiedRecovery = Boolean(uncertainSlug && reconciledAbsentSlug === uncertainSlug && review?.slug === uncertainSlug && uuidPattern.test(review.ownerUserId ?? ""));

  useEffect(() => {
    try {
      const store = createProvisioningAttemptStore(window.sessionStorage, recoveryScope);
      attemptStore.current = store;
      setUncertainSlug(store.read());
      setStorageReady(true);
    } catch {
      setFailure({ ok: false, message: "Creation recovery storage is unavailable or needs operator review. Check the restaurant registry; another invitation cannot be submitted from this page.", fields: {}, uncertain: true });
      setStorageReady(false);
    }
  }, [recoveryScope]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const keys = ["name", "slug", "city", "township", "ownerFullName", "ownerEmail", "ownerUserId", "address", "phone", "timezone", "currency", "logoUrl"] as const;
    const draft = Object.fromEntries(keys.map(key => [key, String(values.get(key) ?? "").trim()])) as unknown as ProvisioningDraft;
    const nextErrors = validateProvisioningDraft(draft);
    setErrors(nextErrors); setFailure(null);
    if (Object.keys(nextErrors).length) { const invalid = form.elements.namedItem(Object.keys(nextErrors)[0]); if (invalid instanceof HTMLElement) invalid.focus(); return; }
    setReview(draft);
  }

  async function create() {
    if (!review || submitting.current || (uncertainSlug && !verifiedRecovery) || reconciledId || !storageReady) return;
    const recovering = Boolean(uncertainSlug);
    submitting.current = true; setBusy(true); setFailure(null);
    try {
      // Persist uncertainty before dispatch so a reload cannot silently invite again.
      try {
        if (recovering) {
          if (attemptStore.current!.read() !== uncertainSlug) throw new Error("Original attempt marker changed");
        } else attemptStore.current!.begin(review.slug);
      }
      catch { setStorageReady(false); setFailure({ ok: false, message: "Creation recovery could not be recorded. No request was sent. Check the registry before continuing.", fields: {}, uncertain: true }); return; }
      const { ownerEmail, ownerFullName, ownerUserId, ...restaurant } = review;
      const result = await provisionRestaurant({ ownerEmail, ownerFullName, ownerUserId: ownerUserId || null, restaurant });
      if (result.ok) { setCreated(result.data); setReview(null); try { attemptStore.current!.clear(); } catch { /* The existing record can be reconciled on the next visit. */ } }
      else {
        setFailure(result); setErrors(result.fields);
        if (result.safeToEdit) { if (!recovering) attemptStore.current!.clear(); setReview(null); }
        else setUncertainSlug(review.slug);
      }
    } catch { setUncertainSlug(review.slug); setFailure({ ok: false, message: "The result could not be confirmed. Check the restaurant registry before retrying.", fields: {}, uncertain: true }); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function reconcile() {
    if (!uncertainSlug || submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      const result = await reconcileProvisioning(uncertainSlug);
      if (!result.ok) { setFailure(result); return; }
      if (result.data.id) { setReconciledId(result.data.id); attemptStore.current!.clear(); }
      else if (review?.ownerUserId) {
        setReconciledAbsentSlug(uncertainSlug);
        setFailure({ ok: false, message: "No restaurant uses this exact slug. Recovery requires this original slug and the reviewed Auth UUID; the server must verify that identity before creating. No new email invitation will be requested.", fields: {} });
      } else {
        setFailure({ ok: false, message: "No restaurant uses this exact slug. An Auth invitation may still exist. Enter its exact verified Auth UUID, review again, then recheck this slug before creating.", fields: { ownerUserId: "Verify the existing Auth identity before retrying." } });
        setErrors({ ownerUserId: "Verify the existing Auth identity before retrying." });
        setReview(null);
      }
    } catch { setFailure({ ok: false, message: "The registry could not be reconciled. Creation remains blocked; check the registry.", fields: {}, uncertain: true }); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (created) return <section aria-live="polite"><Notice title="Restaurant provisioned" tone="success"><p>{created.name} was created. Owner invitation: {created.ownerInvitationStatus === "ACCEPTED" ? "Auth contact confirmed; account setup must still be checked" : "recorded, awaiting account setup"}.</p></Notice><ol className="setup-list"><li>Prepare the runtime palette and approved catalog.</li><li>Review media mappings and the actual Owner account setup status.</li><li>Review the Operations handoff checklist. Native release remains separate.</li></ol><Link className="button button-primary" href={`/restaurant-setup?id=${created.id}`}>Continue initial setup →</Link></section>;

  return <>
    {uncertainSlug && <Notice title="Creation paused for reconciliation" tone="warning"><p>Check the exact slug before another creation attempt. A provider invitation can survive a failed database response.</p><Button disabled={busy} variant="secondary" onClick={reconcile}>Check exact slug in registry</Button>{reconciledId && <p><Link href={`/restaurant-setup?id=${reconciledId}`}>Resume the existing restaurant setup →</Link></p>}</Notice>}
    {failure && <Notice title={failure.uncertain ? "Check before retrying" : "Restaurant was not created"} tone="error"><p>{failure.message}</p><Link href="/restaurants">Check restaurant registry</Link></Notice>}
    <form className="provision-form" hidden={review !== null} style={review ? { display: "none" } : undefined} onSubmit={submit}>
      <div className="form-section-title"><span className="action-number">01</span><div><h3>Restaurant information</h3><p className="muted">Identity, location and contact details.</p></div></div>
      <div className="form-grid">
        <Field id="restaurant-name" label="Restaurant name" required error={errors.name}><input name="name" maxLength={150} autoComplete="organization" /></Field>
        <Field id="restaurant-slug" label="Public slug" required error={errors.slug} hint="Lowercase letters, numbers and hyphens."><input name="slug" maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" spellCheck={false} /></Field>
        <Field id="restaurant-city" label="City" required error={errors.city}><input name="city" maxLength={100} autoComplete="address-level1" /></Field>
        <Field id="restaurant-township" label="Township" required error={errors.township}><input name="township" maxLength={100} autoComplete="address-level2" /></Field>
        <Field id="restaurant-address" label="Address" error={errors.address}><textarea name="address" maxLength={2000} autoComplete="street-address" /></Field>
        <Field id="restaurant-phone" label="Restaurant contact phone" error={errors.phone} hint="Contact information; this does not verify an Owner identity."><input name="phone" type="tel" maxLength={30} autoComplete="tel" /></Field>
        <Field id="restaurant-timezone" label="Timezone" required error={errors.timezone}><input name="timezone" defaultValue="Asia/Yangon" maxLength={60} placeholder="Asia/Yangon" /></Field>
        <Field id="restaurant-currency" label="Currency" required error={errors.currency}><input name="currency" defaultValue="MMK" maxLength={3} pattern="[A-Za-z]{3}" /></Field>
      </div>
      <div className="form-section-title"><span className="action-number">02</span><div><h3>Approved logo reference</h3><p className="muted">Runtime colors are initialized separately after the restaurant UUID is returned.</p></div></div>
      <div className="form-grid">
        <Field id="restaurant-logo" label="Logo URL" error={errors.logoUrl} hint="Optional public HTTPS image URL."><input name="logoUrl" type="url" maxLength={2000} /></Field>
      </div>
      <div className="form-section-title"><span className="action-number">03</span><div><h3>Owner onboarding</h3><p className="muted">Email invitations use a Supabase Auth identity.</p></div></div>
      <div className="form-grid">
        <Field id="owner-name" label="Owner full name" error={errors.ownerFullName} hint="Optional."><input name="ownerFullName" maxLength={150} autoComplete="name" /></Field>
        <Field id="owner-email" label="Owner email" required error={errors.ownerEmail}><input name="ownerEmail" type="email" maxLength={320} autoComplete="email" /></Field>
        <Field id="owner-user-id" label="Existing Owner Auth user ID" error={errors.ownerUserId} hint="For an existing account, enter its exact Supabase Auth UUID. The server checks its confirmed email."><input name="ownerUserId" autoCapitalize="none" spellCheck={false} maxLength={36} /></Field>
      </div>
      <p className="muted small">Phone onboarding will be available after verified phone identity and SMS delivery are supported.</p>
      <div className="form-actions"><p className="muted">Review before creating the restaurant and inviting its Owner.</p><Button type="submit">Review information →</Button></div>
    </form>
    {review && <section className="review-panel" aria-labelledby="review-title"><p className="overline">READY TO PROVISION</p><h3 id="review-title">Review restaurant information</h3><dl className="detail-list">{Object.entries(review).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{({ ownerEmail: "Owner email", ownerUserId: "Auth user ID", ownerFullName: "Owner name", logoUrl: "Logo URL" } as Record<string, string>)[key] ?? key}</dt><dd>{value}</dd></div>)}</dl><Notice title="Owner invitation" tone="info"><p>{review.ownerUserId ? "The existing Auth identity and confirmed email will be verified before assigning OWNER." : "Supabase will email an invitation. Ownership is assigned only to the Auth UUID returned by the provider."}</p></Notice><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => { setReview(null); setFailure(null); }}>Edit information</Button><Button disabled={busy || (Boolean(uncertainSlug) && !verifiedRecovery) || Boolean(reconciledId) || !storageReady} onClick={create}>{busy ? "Creating restaurant…" : "Create restaurant"}</Button></div></section>}
  </>;
}
