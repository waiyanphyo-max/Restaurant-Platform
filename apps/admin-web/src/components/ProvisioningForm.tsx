"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field, Icon, Notice } from "./ui";

export interface ProvisioningDraft {
  name: string;
  slug: string;
  city: string;
  township: string;
  ownerFullName: string;
  ownerEmail: string;
}

type DraftErrors = Partial<Record<keyof ProvisioningDraft, string>>;

/** Preview validation mirrors the existing provisioning request's field constraints. */
export function validateProvisioningDraft(draft: ProvisioningDraft): DraftErrors {
  const errors: DraftErrors = {};
  const limits: Record<keyof ProvisioningDraft, number> = { name: 150, slug: 100, city: 100, township: 100, ownerFullName: 150, ownerEmail: 320 };
  for (const key of Object.keys(limits) as (keyof ProvisioningDraft)[]) {
    if (key !== "ownerFullName" && !draft[key].trim()) errors[key] = "Enter a value for this field.";
    else if (draft[key].length > limits[key]) errors[key] = `Use ${limits[key]} characters or fewer.`;
  }
  if (draft.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) errors.slug = "Use lowercase letters, numbers and single hyphens between words.";
  if (draft.ownerEmail && !/^[^\s@]+@[^\s@]+$/.test(draft.ownerEmail)) errors.ownerEmail = "Enter a valid email address.";
  return errors;
}

export function ProvisioningForm() {
  const [review, setReview] = useState<ProvisioningDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const reviewed = useRef(false);

  useEffect(() => {
    if (review) {
      reviewed.current = true;
      heading.current?.focus();
    } else if (reviewed.current) firstInput.current?.focus();
  }, [review]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const value = (key: keyof ProvisioningDraft) => String(values.get(key) ?? "").trim();
    const draft: ProvisioningDraft = { name: value("name"), slug: value("slug"), city: value("city"), township: value("township"), ownerFullName: value("ownerFullName"), ownerEmail: value("ownerEmail") };
    const nextErrors = validateProvisioningDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const invalid = form.elements.namedItem(Object.keys(nextErrors)[0]);
      if (invalid instanceof HTMLElement) invalid.focus();
      return;
    }
    setReview(draft);
  }

  return <>
    <form className="provision-form" hidden={review !== null} style={review ? { display: "none" } : undefined} onSubmit={submit}>
      <div className="form-section-title"><span className="action-number">01</span><div><h3>Restaurant information</h3><p className="muted">The essentials for a new restaurant workspace.</p></div></div>
      <div className="form-grid">
        <Field id="restaurant-name" label="Restaurant name" required error={errors.name}><input ref={firstInput} name="name" maxLength={150} autoComplete="organization" placeholder="Enter restaurant name" /></Field>
        <Field id="restaurant-slug" label="Restaurant slug" required error={errors.slug} hint="Lowercase letters, numbers and hyphens."><input name="slug" maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" spellCheck={false} placeholder="restaurant-name" /></Field>
        <Field id="restaurant-city" label="City" required error={errors.city}><input name="city" maxLength={100} autoComplete="address-level1" placeholder="Enter city" /></Field>
        <Field id="restaurant-township" label="Township" required error={errors.township}><input name="township" maxLength={100} autoComplete="address-level2" placeholder="Enter township" /></Field>
      </div>
      <div className="form-section-title"><span className="action-number">02</span><div><h3>Owner information</h3><p className="muted">Contact details for the restaurant owner.</p></div></div>
      <div className="form-grid">
        <Field id="owner-name" label="Owner full name" error={errors.ownerFullName} hint="Optional."><input name="ownerFullName" maxLength={150} autoComplete="name" placeholder="Enter full name" /></Field>
        <Field id="owner-email" label="Owner email" required error={errors.ownerEmail}><input name="ownerEmail" type="email" maxLength={320} autoComplete="email" placeholder="owner@example.com" /></Field>
      </div>
      <div className="form-actions"><p className="muted">Preview only. Information stays on this page.</p><Button type="submit">Review information <Icon name="arrow" /></Button></div>
    </form>
    {review && <section className="review-panel" aria-labelledby="review-title">
      <p className="overline">INFORMATION PREVIEW</p><h3 id="review-title" ref={heading} tabIndex={-1}>Review restaurant information</h3>
      <p className="muted">Check the details below. No restaurant has been created and no invitation has been sent.</p>
      <dl className="detail-list"><div><dt>Restaurant</dt><dd>{review.name}</dd></div><div><dt>Slug</dt><dd>{review.slug}</dd></div><div><dt>City</dt><dd>{review.city}</dd></div><div><dt>Township</dt><dd>{review.township}</dd></div><div><dt>Owner</dt><dd>{review.ownerFullName || "Not provided"}</dd></div><div><dt>Owner email</dt><dd>{review.ownerEmail}</dd></div></dl>
      <Notice title="Creation is not available yet" tone="warning"><p>Restaurant creation will be enabled when the provisioning service is available in this workspace. Nothing is saved by this preview.</p></Notice>
      <div className="form-actions"><Button variant="secondary" onClick={() => setReview(null)}>Edit information</Button><Button disabled title="Restaurant provisioning is not available in this workspace">Create restaurant</Button></div>
    </section>}
  </>;
}
