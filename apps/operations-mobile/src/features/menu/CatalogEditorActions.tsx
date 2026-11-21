import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { ApiHttpError, ApiNetworkError, ApiTimeoutError } from "@restaurant-platform/api-client";
import { Action, ConfirmDialog, Status } from "../../components/ui";
import { mutationError } from "../../hooks/mutation";
import type { useApiMutation } from "../../hooks/useApiMutation";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

/** One review/discard flow for catalog forms; review captures the validated request. */
export function CatalogEditorActions<T>({ label, dirty, request, save, summary, done, cancel, mutation, blocked = false }: {
  label: string; dirty: boolean; request(): T; save(request: T): Promise<unknown>; summary(request: T): string;
  done(): void; cancel(): void; mutation: ReturnType<typeof useApiMutation>; blocked?: boolean;
}) {
  const [review, setReview] = useState<{ request: T; fingerprint: string } | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const reviewButton = useRef<ComponentRef<typeof View>>(null);
  const cancelButton = useRef<ComponentRef<typeof View>>(null);
  useUnsavedChanges(dirty || mutation.busy);
  function startReview() {
    if (mutation.busy || blocked || uncertain) return;
    try {
      const value = request();
      setValidation(null); mutation.reset();
      setReview({ request: value, fingerprint: JSON.stringify(value) });
    } catch (failure) { setValidation(mutationError(failure)); }
  }
  function confirm() {
    if (!review || mutation.busy || blocked || uncertain) return;
    try {
      if (JSON.stringify(request()) !== review.fingerprint) {
        setReview(null); setValidation("Your draft changed. Review the current values before saving."); return;
      }
    } catch (failure) { setReview(null); setValidation(mutationError(failure)); return; }
    const reviewed = review.request;
    setReview(null);
    void mutation.run(() => save(reviewed), done, failure => {
      // A create may already have reached the server. Leave and reconcile the list,
      // rather than offering a second unconfirmed catalog write from this draft.
      if (failure instanceof ApiNetworkError || failure instanceof ApiTimeoutError
        || failure instanceof ApiHttpError && failure.status >= 500
        || !(failure instanceof ApiHttpError)) setUncertain(true);
    });
  }
  return <>
    {dirty ? <Status tone="warning">Unsaved {label.toLowerCase()} changes. မသိမ်းရသေးသော ပြင်ဆင်ချက်များ။</Status> : null}
    {validation ? <Status tone="danger">{validation}</Status> : null}
    {mutation.error ? <Status tone="danger">{mutation.error}</Status> : null}
    {uncertain ? <Status tone="warning">This save is unconfirmed. Close this draft, refresh the menu and check the current record before starting another edit. Do not repeat a possibly successful creation.</Status> : null}
    <Action ref={reviewButton} title={`Review ${label.toLowerCase()}`} loading={mutation.busy} disabled={blocked || uncertain} onPress={startReview} />
    <Action ref={cancelButton} title={uncertain ? "Close draft and check menu" : "Cancel"} secondary disabled={mutation.busy}
      onPress={() => { if (!mutation.busy) { if (dirty && !uncertain) setDiscarding(true); else cancel(); } }} />
    <ConfirmDialog visible={review !== null} title={`Save ${label.toLowerCase()}?`} confirmLabel={`Save ${label.toLowerCase()}`}
      message={review ? `${summary(review.request)}\nChanges affect new Guest, Customer and Counter ordering after refresh. Existing order and payment snapshots remain unchanged.` : ""}
      returnFocusRef={reviewButton} busy={mutation.busy} confirmDisabled={blocked || uncertain || mutation.busy} onConfirm={confirm}
      onCancel={() => { if (!mutation.busy) setReview(null); }} />
    <ConfirmDialog visible={discarding} title="Discard catalog changes?" confirmLabel="Discard changes" danger
      message="Leave this form without saving your changes? မသိမ်းရသေးသော ပြင်ဆင်ချက်များကို ဖျက်မည်လား။"
      returnFocusRef={cancelButton} onCancel={() => setDiscarding(false)} onConfirm={() => { setDiscarding(false); cancel(); }} />
  </>;
}
