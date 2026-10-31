"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { provisionRestaurant } from "@/app/(admin)/actions";
import type { PlatformRestaurantConfiguration } from "@restaurant-platform/shared-types";
import { Button, Field, Notice } from "./ui";
import type { MutationFailure } from "@/lib/lifecycle";

export interface ProvisioningDraft {
  name: string; slug: string; city: string; township: string; ownerFullName: string; ownerEmail: string;
  ownerUserId?: string; address?: string; phone?: string; timezone?: string; currency?: string;
  logoUrl?: string; primaryColor?: string; secondaryColor?: string;
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
  for (const key of ["primaryColor", "secondaryColor"] as const) if (draft[key] && !/^#[0-9a-f]{6}$/i.test(draft[key])) errors[key] = "Use a six-digit hex color, such as #234D3C.";
  return errors;
}

export function initialConfiguration(primaryColor = "#234D3C", secondaryColor = "#E8EEDB"): PlatformRestaurantConfiguration {
  const android = () => ({ displayName: null, stagingApplicationId: null, productionApplicationId: null, iconPath: null });
  return { primaryColor, secondaryColor, guestDomains: { staging: [], production: [] }, android: { operations: android(), customer: android() } };
}

export function ProvisioningForm() {
  const [review, setReview] = useState<ProvisioningDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; ownerInvitationStatus: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const keys = ["name", "slug", "city", "township", "ownerFullName", "ownerEmail", "ownerUserId", "address", "phone", "timezone", "currency", "logoUrl", "primaryColor", "secondaryColor"] as const;
    const draft = Object.fromEntries(keys.map(key => [key, String(values.get(key) ?? "").trim()])) as unknown as ProvisioningDraft;
    const nextErrors = validateProvisioningDraft(draft);
    setErrors(nextErrors); setFailure(null);
    if (Object.keys(nextErrors).length) { const invalid = form.elements.namedItem(Object.keys(nextErrors)[0]); if (invalid instanceof HTMLElement) invalid.focus(); return; }
    setReview(draft);
  }

  async function create() {
    if (!review || submitting.current) return;
    submitting.current = true; setBusy(true); setFailure(null);
    try {
      const { ownerEmail, ownerFullName, ownerUserId, primaryColor, secondaryColor, ...restaurant } = review;
      const result = await provisionRestaurant({ ownerEmail, ownerFullName, ownerUserId: ownerUserId || null, restaurant, configuration: initialConfiguration(primaryColor, secondaryColor) });
      if (result.ok) { setCreated(result.data); setReview(null); }
      else { setFailure(result); setErrors(result.fields); }
    } catch { setFailure({ ok: false, message: "The result could not be confirmed. Check the restaurant registry before retrying.", fields: {}, uncertain: true }); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (created) return <section aria-live="polite"><Notice title="Restaurant created" tone="success"><p>{created.name} is ready. Owner invitation: {created.ownerInvitationStatus === "ACCEPTED" ? "verified account" : "sent, awaiting acceptance"}.</p></Notice><ol className="setup-list"><li>Ask the Owner to follow the email invitation and complete sign-in.</li><li>Review branding and application configuration in restaurant details.</li><li>The Owner signs in to Operations to configure menus, tables and QR ordering.</li></ol><Link className="button button-primary" href={`/restaurant-details?id=${created.id}`}>Open restaurant details →</Link></section>;

  return <>
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
      <div className="form-section-title"><span className="action-number">02</span><div><h3>Initial branding</h3><p className="muted">You can update branding after creation.</p></div></div>
      <div className="form-grid">
        <Field id="restaurant-logo" label="Logo URL" error={errors.logoUrl} hint="Optional public HTTPS image URL."><input name="logoUrl" type="url" maxLength={2000} /></Field>
        <Field id="restaurant-primary" label="Primary color" error={errors.primaryColor}><input name="primaryColor" defaultValue="#234D3C" pattern="#[0-9A-Fa-f]{6}" /></Field>
        <Field id="restaurant-secondary" label="Secondary color" error={errors.secondaryColor}><input name="secondaryColor" defaultValue="#E8EEDB" pattern="#[0-9A-Fa-f]{6}" /></Field>
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
    {review && <section className="review-panel" aria-labelledby="review-title"><p className="overline">READY TO PROVISION</p><h3 id="review-title">Review restaurant information</h3><dl className="detail-list">{Object.entries(review).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{({ ownerEmail: "Owner email", ownerUserId: "Auth user ID", ownerFullName: "Owner name", primaryColor: "Primary color", secondaryColor: "Secondary color", logoUrl: "Logo URL" } as Record<string, string>)[key] ?? key}</dt><dd>{value}</dd></div>)}</dl><Notice title="Owner invitation" tone="info"><p>{review.ownerUserId ? "The existing Auth identity and confirmed email will be verified before assigning OWNER." : "Supabase will email an invitation. Ownership is assigned only to the Auth UUID returned by the provider."}</p></Notice><div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => { setReview(null); setFailure(null); }}>Edit information</Button><Button disabled={busy} onClick={create}>{busy ? "Creating restaurant…" : "Create restaurant"}</Button></div></section>}
  </>;
}
