"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PlatformAndroidConfiguration, PlatformRestaurantDetailResponse } from "@restaurant-platform/shared-types";
import { updateRestaurantConfiguration, updateRestaurantStatus } from "@/app/(admin)/actions";
import type { MutationFailure } from "@/lib/lifecycle";
import { validateRestaurantConfiguration } from "@/lib/configuration";
import { Button, ConfirmationDialog, Field, Notice } from "./ui";

export function RestaurantConfiguration({ detail }: { detail: PlatformRestaurantDetailResponse }) {
  const { restaurant, configuration } = detail;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setFailure(null); setSaved(false);
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const android = (kind: string): PlatformAndroidConfiguration => ({ displayName: value(`${kind}-displayName`) || null, stagingApplicationId: value(`${kind}-stagingApplicationId`) || null, productionApplicationId: value(`${kind}-productionApplicationId`) || null, iconPath: value(`${kind}-iconPath`) || null });
    const domains = (key: string) => value(key).split(/[\s,]+/).filter(Boolean);
    try {
      const request = { name: value("name"), slug: value("slug"), logoUrl: value("logoUrl") || null, configuration: { primaryColor: value("primaryColor") || null, secondaryColor: value("secondaryColor") || null, guestDomains: { staging: domains("stagingDomains"), production: domains("productionDomains") }, android: { operations: android("operations"), customer: android("customer") } } };
      const fields = validateRestaurantConfiguration(request);
      if (Object.keys(fields).length) { setFailure({ ok: false, message: "Check the highlighted configuration fields.", fields }); return; }
      const result = await updateRestaurantConfiguration(restaurant.id, request);
      if (result.ok) { setSaved(true); router.refresh(); } else setFailure(result);
    } catch { setFailure({ ok: false, message: "The save result could not be confirmed. Reload this record before retrying.", fields: {} }); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function changeStatus() {
    setFailure(null); setSaved(false);
    const result = await updateRestaurantStatus(restaurant.id, !restaurant.active);
    if (!result.ok) { setFailure(result); throw new Error("Status update failed"); }
    router.refresh();
  }

  const error = (key: string) => failure?.fields[key] ?? failure?.fields[`configuration.${key}`];
  const androidFields = (kind: "operations" | "customer", title: string) => <fieldset className="configuration-section"><legend>{title}</legend><div className="form-grid">{([
    ["displayName", "Application display name", 100], ["stagingApplicationId", "Staging application ID", 200], ["productionApplicationId", "Production application ID", 200], ["iconPath", "Icon asset path", 500],
  ] as const).map(([key, label, maxLength]) => <Field key={key} id={`${kind}-${key}`} label={label} error={error(`android.${kind}.${key}`)} hint={key.includes("ApplicationId") ? "For example com.example.restaurant.operations" : key === "iconPath" ? "PNG asset path, such as assets/icon.png" : undefined}><input name={`${kind}-${key}`} defaultValue={configuration.android[kind][key] ?? ""} maxLength={maxLength} spellCheck={false} /></Field>)}</div></fieldset>;

  return <section className="panel lifecycle-panel"><div className="panel-heading"><div><p className="overline">RESTAURANT MANAGEMENT</p><h2>Branding and application configuration</h2></div></div>
    {failure && <Notice tone="error" title="Update could not be completed"><p>{failure.message}</p></Notice>}
    {saved && <Notice tone="success" title="Configuration saved">The restaurant configuration has been updated.</Notice>}
    <form className="provision-form" onSubmit={submit}><fieldset disabled={busy} className="configuration-section"><legend>Brand identity</legend><div className="form-grid">
      <Field id="config-name" label="Restaurant name" required error={error("name")}><input name="name" defaultValue={restaurant.name} maxLength={150} /></Field>
      <Field id="config-slug" label="Public slug" required error={error("slug")}><input name="slug" defaultValue={restaurant.slug ?? ""} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" spellCheck={false} /></Field>
      <Field id="config-logo" label="Logo URL" error={error("logoUrl")} hint="Public HTTPS image URL."><input name="logoUrl" type="url" defaultValue={restaurant.logoUrl ?? ""} maxLength={2000} /></Field>
      <Field id="config-primary" label="Primary color" error={error("primaryColor")}><input name="primaryColor" defaultValue={configuration.primaryColor ?? ""} pattern="#[0-9A-Fa-f]{6}" /></Field>
      <Field id="config-secondary" label="Secondary color" error={error("secondaryColor")}><input name="secondaryColor" defaultValue={configuration.secondaryColor ?? ""} pattern="#[0-9A-Fa-f]{6}" /></Field>
    </div></fieldset>
    <fieldset disabled={busy} className="configuration-section"><legend>Guest Website</legend><p className="muted small">Domains are deployment metadata. Saving does not configure DNS, verify domain ownership or publish a website.</p><div className="form-grid"><Field id="staging-domains" label="Staging domains" error={error("guestDomains.staging")} hint="Hostnames separated by commas; no scheme or path."><textarea name="stagingDomains" defaultValue={configuration.guestDomains.staging.join(", ")} maxLength={3000} /></Field><Field id="production-domains" label="Production domains" error={error("guestDomains.production")} hint="For example restaurant.example.com"><textarea name="productionDomains" defaultValue={configuration.guestDomains.production.join(", ")} maxLength={3000} /></Field></div></fieldset>
    {androidFields("operations", "Operations Android")}{androidFields("customer", "Customer Android")}
    <p className="muted small">Android settings describe build configuration. Publishing and installing an application is a separate release step.</p>
    <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save configuration"}</Button><Button variant="secondary" disabled={busy} onClick={() => window.location.reload()}>Reload record</Button></div></form>
    <div className="lifecycle-status"><div><h3>Restaurant status</h3><p className="muted small">Current status: {restaurant.active ? "Active" : "Inactive"}. Inactive restaurants cannot accept public orders.</p></div><ConfirmationDialog triggerLabel={restaurant.active ? "Deactivate restaurant" : "Activate restaurant"} title={restaurant.active ? "Deactivate restaurant?" : "Activate restaurant?"} description={restaurant.active ? `Public orders for ${restaurant.name} will be disabled.` : `${restaurant.name} will be active. Ordering still follows its restaurant settings.`} confirmLabel={restaurant.active ? "Deactivate" : "Activate"} variant={restaurant.active ? "danger" : "primary"} onConfirm={changeStatus} /></div>
  </section>;
}
