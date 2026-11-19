import { useEffect, useRef, useState, type ComponentRef } from "react";
import { AccessibilityInfo, TextInput, View } from "react-native";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { RuntimeBrandingPalette, UpdateRestaurantBrandingRequest } from "@restaurant-platform/shared-types";
import { isHexColor } from "@restaurant-platform/ui-tokens";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { useRuntimeBranding } from "../../branding/RuntimeBrandingProvider";
import { Action, Body, Card, ConfirmDialog, FormField, StateView, Status, ThemeProvider, useUiTheme } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { readEmbeddedTenant } from "../../tenant";

const fields = [
  ["primaryColor", "Primary color"], ["secondaryColor", "Secondary color"], ["backgroundColor", "Background color"]
] as const;
type ColorKey = keyof RuntimeBrandingPalette;
type Draft = { expectedRevision: number; palette: RuntimeBrandingPalette };

/** The route remains guarded; this also withholds controls if the editor is rendered independently. */
export function RuntimePaletteEditor() {
  const { state } = useOperationsAuth();
  const runtime = useRuntimeBranding();
  if (state.status !== "ready" || !["OWNER", "MANAGER"].includes(state.membership.role)) {
    return <StateView kind="forbidden" message="Only the restaurant Owner or Manager can edit the runtime palette." />;
  }
  return <PaletteForm key={runtime.scopeKey} />;
}

function PaletteForm() {
  const runtime = useRuntimeBranding();
  const { color } = useUiTheme();
  const tenant = readEmbeddedTenant();
  const mutation = useApiMutation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<RuntimeBrandingPalette | null>(null);
  const [pending, setPending] = useState<UpdateRestaurantBrandingRequest | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ColorKey, string>>>({});
  const [blocked, setBlocked] = useState<"conflict" | "uncertain" | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const refreshGate = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const primary = useRef<ComponentRef<typeof TextInput>>(null);
  const secondary = useRef<ComponentRef<typeof TextInput>>(null);
  const background = useRef<ComponentRef<typeof TextInput>>(null);
  const reviewAction = useRef<ComponentRef<typeof View>>(null);
  const inputRefs = { primaryColor: primary, secondaryColor: secondary, backgroundColor: background };
  const branding = runtime.branding;
  const busy = mutation.busy || checking;
  const changedRemotely = !!draft && !!branding && draft.expectedRevision !== branding.revision;

  function cancel() {
    if (busy) return;
    setDraft(null); setPreview(null); setPending(null); setErrors({}); setFeedback(null); mutation.reset();
    AccessibilityInfo.announceForAccessibility("Unsaved palette edits cancelled.");
  }
  function validate(): RuntimeBrandingPalette | null {
    if (!draft) return null;
    const invalid: Partial<Record<ColorKey, string>> = {};
    for (const [key] of fields) if (!isHexColor(draft.palette[key])) invalid[key] = "Enter a six-digit color such as #A51D22.";
    setErrors(invalid);
    const first = fields.find(([key]) => invalid[key]);
    if (first) {
      inputRefs[first[0]].current?.focus();
      AccessibilityInfo.announceForAccessibility(`${first[1]} is invalid. Enter # followed by six hexadecimal digits.`);
      return null;
    }
    return { primaryColor: draft.palette.primaryColor.toUpperCase(), secondaryColor: draft.palette.secondaryColor.toUpperCase(), backgroundColor: draft.palette.backgroundColor.toUpperCase() };
  }
  function review() {
    if (busy || blocked || changedRemotely || !draft) return;
    const palette = validate();
    if (!palette) return;
    setPreview(palette); setPending({ expectedRevision: draft.expectedRevision, palette });
  }
  function save() {
    const request = pending;
    if (!request || busy || blocked || !branding || request.expectedRevision !== branding.revision) return;
    setPending(null); setFeedback(null);
    void mutation.run(() => runtime.save(request), () => {
      setDraft(null); setPreview(null); setBlocked(null); setErrors({});
      setFeedback("Palette saved. The workspace now uses the server's persisted colors.");
      AccessibilityInfo.announceForAccessibility("Palette saved.");
    }, failure => {
      if (failure instanceof ApiHttpError && failure.status === 403) setForbidden(true);
      else if (failure instanceof ApiHttpError && failure.status === 409 && failure.code === "RESTAURANT_BRANDING_STALE") {
        setBlocked("conflict");
        AccessibilityInfo.announceForAccessibility("Another change was saved. Load the latest palette and review again.");
      } else if (failure instanceof ApiHttpError && [400, 422].includes(failure.status)) {
        const invalid: Partial<Record<ColorKey, string>> = {};
        for (const [key] of fields) if (failure.fieldErrors.some(violation => violation.field === `palette.${key}` || violation.field === key)) {
          invalid[key] = "The server rejected this color. Enter a valid #RRGGBB value and review again.";
        }
        setErrors(invalid);
        const first = fields.find(([key]) => invalid[key]);
        if (first) { inputRefs[first[0]].current?.focus(); AccessibilityInfo.announceForAccessibility(`${first[1]} was rejected by the server.`); }
      } else if (!(failure instanceof ApiHttpError && failure.status === 401)) setBlocked("uncertain");
    });
  }
  async function loadLatest() {
    if (refreshGate.current || mutation.busy) return;
    refreshGate.current = true; setChecking(true);
    try {
      if (await runtime.refresh() && mounted.current) {
        setDraft(null); setPreview(null); setPending(null); setErrors({}); setBlocked(null); mutation.reset();
        setFeedback("Latest persisted palette loaded. Edit and review again before saving.");
        AccessibilityInfo.announceForAccessibility("Latest persisted palette loaded. Review again before saving.");
      }
    } finally { refreshGate.current = false; if (mounted.current) setChecking(false); }
  }

  if (forbidden || runtime.error === "denied") return <StateView kind="forbidden" title="Palette change not permitted" message="Your account cannot access palette management. Ask the restaurant Owner to check your permission before trying again." />;
  if (!branding) return <Card title="Runtime palette"><StateView kind={runtime.loading ? "loading" : runtime.error === "offline" ? "offline" : "error"}
    message="Load the persisted restaurant branding before editing. The workspace keeps its same-restaurant fallback."
    onRetry={runtime.loading ? undefined : () => { void runtime.refresh(); }} /></Card>;

  const reviewMessage = pending ? `Review revision ${pending.expectedRevision}.\n${fields.map(([key, label]) => `${label}: ${branding.palette?.[key] ?? "not saved (embedded fallback)"} → ${pending.palette[key]}`).join("\n")}\nOnly the in-app palette will be saved.` : "";
  return <Card title="Runtime palette">
    <Body>Persisted palette revision: {branding.revision}</Body>
    {branding.palette ? <PaletteValues palette={branding.palette} /> : <Status tone="warning">No runtime palette is saved. Revision 0 uses this restaurant's embedded fallback; those fallback colors have not been saved.</Status>}
    <Body>Owners and Managers can edit in-app colors. Logo upload is Owner-only. Launcher icons, splash screens and installed app identity require a separately reviewed release.</Body>
    {runtime.refreshing ? <Body accessibilityLiveRegion="polite">Refreshing persisted branding…</Body> : null}
    {runtime.error ? <StateView kind={runtime.error === "offline" ? "offline" : "error"} title="Branding request failed"
      message="The last validated branding is still shown. Reconnect and retry to check the latest persisted palette." onRetry={() => { void runtime.refresh(); }} /> : null}
    {feedback ? <Status tone="success">{feedback}</Status> : null}
    {blocked === "conflict" || changedRemotely ? <Status tone="warning">Another change was saved while you were editing. Your proposal has not been saved. Load the latest palette, then edit and review again.</Status> : null}
    {blocked === "uncertain" ? <Status tone="warning">The save could not be confirmed. It may have reached the server. Refresh the persisted palette before editing and reviewing another save.</Status> : null}
    {!draft ? <Action title="Edit runtime palette" disabled={busy || !!blocked} onPress={() => {
      if (busy || blocked) return;
      mutation.reset(); setFeedback(null);
      setDraft({ expectedRevision: branding.revision, palette: branding.palette ?? { primaryColor: color.primary, secondaryColor: color.secondary, backgroundColor: color.background } });
    }} /> : <>
      <Status tone="warning">Unsaved palette edits. Preview changes here before reviewing a save. The workspace still uses {branding.palette ? "the persisted palette." : "its embedded fallback."}</Status>
      {fields.map(([key, label]) => <FormField key={key} label={label} value={draft.palette[key]} inputRef={inputRefs[key]}
        error={errors[key]} accessibilityHint="Use # followed by six hexadecimal digits. Changes are unsaved until reviewed and confirmed."
        autoCapitalize="characters" autoCorrect={false} maxLength={7} editable={!busy}
        onChangeText={value => { setDraft({ ...draft, palette: { ...draft.palette, [key]: value } }); setPreview(null); setPending(null); setErrors(current => ({ ...current, [key]: undefined })); mutation.reset(); }} />)}
      <Action title="Preview palette" secondary disabled={busy} onPress={() => {
        const palette = validate(); if (palette) { setPreview(palette); AccessibilityInfo.announceForAccessibility("Unsaved palette preview updated. The workspace palette is unchanged."); }
      }} />
      {preview ? <ThemeProvider restaurantId={tenant.restaurantId} branding={preview}><PalettePreview /></ThemeProvider> : null}
      {mutation.error ? <Status tone="danger">{mutation.error}</Status> : null}
      <Action ref={reviewAction} title="Review palette changes" disabled={busy || !!blocked || changedRemotely} onPress={review} />
      <Action title="Cancel palette edits" secondary disabled={busy} onPress={cancel} />
    </>}
    {blocked || changedRemotely ? <Action title="Load latest palette" secondary disabled={busy} onPress={() => { void loadLatest(); }} /> : null}
    <ConfirmDialog visible={pending !== null} title="Save runtime palette?" message={reviewMessage} confirmLabel="Save palette"
      returnFocusRef={reviewAction} confirmDisabled={busy || changedRemotely || !!blocked} busy={mutation.busy}
      onCancel={() => { if (!mutation.busy) setPending(null); }} onConfirm={save} />
  </Card>;
}

function PaletteValues({ palette }: { palette: RuntimeBrandingPalette }) {
  return <>{fields.map(([key, label]) => <Body key={key}>{label}: {palette[key]}</Body>)}</>;
}

function PalettePreview() {
  const { color, spacing, radius } = useUiTheme();
  return <View accessibilityLabel="Unsaved runtime palette preview" style={{ backgroundColor: color.background, padding: spacing.md, borderRadius: radius.md }}>
    <Body>Unsaved preview</Body>
    <Card title="Restaurant palette preview"><Body>Readable text and controls use the shared contrast resolver.</Body>
      <Action title="Primary preview" onPress={() => undefined} accessibilityHint="Preview only. Does not save changes." />
      <Action title="Secondary preview" secondary onPress={() => undefined} accessibilityHint="Preview only. Does not save changes." />
    </Card>
  </View>;
}
