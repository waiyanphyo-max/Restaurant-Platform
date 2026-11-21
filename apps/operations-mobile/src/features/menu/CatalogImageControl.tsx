import { useEffect, useRef, useState } from "react";
import { Image } from "react-native";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import type { ProductManagementResponse, ProductVariantResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { pickImage, type PickedImage } from "../../components/imageUpload";
import { useImageUpload } from "../../components/useImageUpload";
import { Action, Body, Status } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { mutationError } from "../../hooks/mutation";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

export function catalogImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

export function CatalogPicture({ url, name, compact = false }: { url: string | null; name: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const safeUrl = catalogImageUrl(url);
  return safeUrl && !failed ? <Image accessibilityLabel={`${name} image`} source={{ uri: safeUrl }} onError={() => setFailed(true)}
    style={{ width: compact ? 72 : "100%", height: compact ? 72 : 140, borderRadius: 12 }} resizeMode={compact ? "cover" : "contain"} />
    : <Body style={compact ? { width: 72, minHeight: 72 } : undefined} tone="muted">Image unavailable</Body>;
}

/** Device URIs come only from the validated native picker, never a published URL. */
function LocalImagePreview({ uri, name }: { uri: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <Body>Local preview could not be displayed. Choose another image before uploading.</Body>
    : <Image accessibilityLabel={`${name} local preview`} source={{ uri }} onError={() => setFailed(true)}
      style={{ width: "100%", height: 140, borderRadius: 12 }} resizeMode="contain" />;
}

type ImageRecord = ProductManagementResponse | ProductVariantResponse;
type Props = {
  id: string; name: string; publishedUrl: string | null;
  upload(api: ReturnType<typeof getOperationsApi>, form: FormData): Promise<ImageRecord>;
  check(api: ReturnType<typeof getOperationsApi>): Promise<ImageRecord | null>;
  onSaved(): void;
};

/** A chosen device image remains an unsaved preview until Spring confirms its update. */
export function CatalogImageControl(props: Props) {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER"].includes(state.membership.role)) return null;
  return <ImageEditor key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}:${props.id}`} {...props} />;
}

function ImageEditor({ id, name, publishedUrl, upload, check, onSaved }: Props) {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  const mutation = useApiMutation();
  const uploadImage = useImageUpload();
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ url: string | null; previous: string | null; uploaded: boolean } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const pickerGate = useRef(false);
  const mounted = useRef(true);
  const scope = state.status === "ready" ? `${state.userId}:${state.membership.restaurantId}:${state.membership.role}` : "";
  const activeScope = useRef(scope); activeScope.current = scope;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentUrl = confirmed && publishedUrl === confirmed.previous ? confirmed.url : publishedUrl;
  const busy = mutation.busy || choosing || checking;
  useUnsavedChanges(picked !== null || busy);
  async function choose() {
    if (pickerGate.current || mutation.busy || uncertain || forbidden) return;
    const started = scope;
    pickerGate.current = true; setChoosing(true); setPickError(null); mutation.reset();
    try {
      const asset = await pickImage();
      if (mounted.current && activeScope.current === started && asset) setPicked(asset);
    } catch (failure) { if (mounted.current && activeScope.current === started) setPickError(mutationError(failure)); }
    finally { pickerGate.current = false; if (mounted.current && activeScope.current === started) setChoosing(false); }
  }
  function save() {
    if (!picked || busy || uncertain || forbidden) return;
    const asset = picked;
    void mutation.run(async () => {
      let saved: ImageRecord | null = null;
      await uploadImage(async (api, form) => {
        const result = await upload(api, form);
        if (result.id !== id || !catalogImageUrl(result.imageUrl)) throw new Error("Unconfirmed image response");
        saved = result;
      }, asset);
      if (!saved) throw new Error("Unconfirmed image response");
      return saved as ImageRecord;
    }, result => {
      setConfirmed({ url: result.imageUrl!, previous: publishedUrl, uploaded: true }); setPicked(null); setUncertain(false); onSaved();
    }, failure => {
      if (failure instanceof ApiHttpError && failure.status === 403) setForbidden(true);
      else if (failure instanceof ApiNetworkError || failure instanceof ApiTimeoutError || !(failure instanceof ApiHttpError) || failure.status >= 500) setUncertain(true);
    });
  }
  async function checkPublished() {
    if (pickerGate.current || mutation.busy || state.status !== "ready") return;
    const started = scope;
    const { userId, membership: { role } } = state;
    pickerGate.current = true; setChecking(true); setPickError(null);
    try {
      const result = await check(getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) }));
      if (!result || result.id !== id || result.imageUrl !== null && !catalogImageUrl(result.imageUrl)) throw new Error("Image record is unavailable");
      if (mounted.current && activeScope.current === started) {
        setConfirmed({ url: result.imageUrl, previous: publishedUrl, uploaded: false }); setPicked(null); setUncertain(false); mutation.reset(); onSaved();
      }
    } catch (failure) {
      if (mounted.current && activeScope.current === started) setPickError(mutationError(failure));
    } finally { pickerGate.current = false; if (mounted.current && activeScope.current === started) setChecking(false); }
  }
  return <>
    <Body>{currentUrl ? "Published image" : "No published image"}</Body>
    <CatalogPicture key={currentUrl} url={currentUrl} name={name} />
    {confirmed?.uploaded && currentUrl === confirmed.url ? <Status tone="success">Image update confirmed by the server.</Status> : null}
    {confirmed && !confirmed.uploaded ? <Body>Latest server image loaded. Choose and review a new preview before uploading again.</Body> : null}
    {picked ? <>
      <Status tone="warning">Local preview — not published</Status>
      <LocalImagePreview key={picked.uri} uri={picked.uri} name={name} />
      <Body>This preview does not approve a media mapping or change Featured selection.</Body>
    </> : null}
    {mutation.busy ? <Body accessibilityLiveRegion="polite">Upload pending. Waiting for server confirmation…</Body> : null}
    {checking ? <Body accessibilityLiveRegion="polite">Checking the current server image…</Body> : null}
    {pickError ? <Status tone="danger">{pickError}</Status> : null}
    {mutation.error ? <Status tone="danger">Upload failed or unconfirmed. {mutation.error} The previous published image remains shown until a confirmed update.</Status> : null}
    {uncertain ? <Status tone="warning">Publication could not be confirmed and may have reached the server. Refresh this product before choosing and reviewing another upload.</Status> : null}
    {forbidden ? <Status tone="danger">Your account cannot upload this image. Check your restaurant access.</Status> : null}
    {uncertain ? <Action title={`Check published ${name} image`} secondary disabled={busy} onPress={() => { void checkPublished(); }} /> : null}
    <Action title={choosing ? "Opening image picker…" : `Choose ${name} image`} secondary disabled={busy || uncertain || forbidden} onPress={() => { void choose(); }} />
    {picked ? <>
      <Action title={`Upload reviewed ${name} image`} disabled={busy || uncertain || forbidden} loading={mutation.busy} onPress={save}
        accessibilityHint="Publishes the selected local preview through the restaurant server after access verification." />
      <Action title={`Discard ${name} preview`} secondary disabled={busy} onPress={() => { if (!busy) { setPicked(null); setPickError(null); mutation.reset(); } }} />
    </> : null}
  </>;
}
