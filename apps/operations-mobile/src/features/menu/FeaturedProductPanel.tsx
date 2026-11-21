import { useEffect, useRef, useState, type ComponentRef } from "react";
import { AccessibilityInfo, View } from "react-native";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { CategoryResponse, FeaturedProductResponse, ProductManagementResponse, UpdateFeaturedProductRequest } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, StateView, Status } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

type Catalog = { products: ProductManagementResponse[]; categories: CategoryResponse[] };
function eligible(product: ProductManagementResponse, categories: CategoryResponse[]) {
  return product.available && categories.some(category => category.id === product.categoryId && category.active)
    && (!product.trackStock || (product.stockQuantity ?? 0) > 0);
}

/** Editorial state has one server authority and does not change ordinary catalog permissions. */
export function FeaturedProductPanel(props: Catalog) {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || !["OWNER", "MANAGER", "STAFF"].includes(state.membership.role)) {
    return <StateView kind="forbidden" message="Your restaurant role cannot access Featured selection." />;
  }
  return <FeaturedQuery key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}`} {...props} />;
}

function FeaturedQuery(props: Catalog) {
  const query = useApiQuery(signal => getOperationsApi().getFeaturedProduct({ signal }), "menu-featured-product", { keepPreviousData: true });
  const catalog = useRef(props);
  useEffect(() => {
    if (catalog.current.products !== props.products || catalog.current.categories !== props.categories) query.reload();
    catalog.current = props;
  }, [props, query.reload]);
  return <Card title="Featured / Restaurant pick"><QueryResult {...query}>{saved => <FeaturedForm {...props} saved={saved} />}</QueryResult></Card>;
}

function FeaturedForm({ products, categories, saved }: Catalog & { saved: FeaturedProductResponse }) {
  const { state, assertWorkspaceAccess } = useOperationsAuth();
  const mutation = useApiMutation();
  const [confirmed, setConfirmed] = useState<{ response: FeaturedProductResponse; baseline: FeaturedProductResponse } | null>(null);
  const current = confirmed && (confirmed.response.revision > saved.revision || confirmed.baseline === saved)
    ? confirmed.response : saved;
  const [draft, setDraft] = useState<UpdateFeaturedProductRequest | null>(null);
  const [review, setReview] = useState<UpdateFeaturedProductRequest | null>(null);
  const [blocked, setBlocked] = useState<"conflict" | "uncertain" | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingGate = useRef(false);
  const mounted = useRef(true);
  const scope = state.status === "ready" ? `${state.userId}:${state.membership.restaurantId}:${state.membership.role}` : "";
  const activeScope = useRef(scope); activeScope.current = scope;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reviewButton = useRef<ComponentRef<typeof View>>(null);
  const owner = state.status === "ready" && state.membership.role === "OWNER";
  const selected = products.find(product => product.id === current.productId);
  const choices = products.filter(product => eligible(product, categories));
  const changed = !!draft && draft.expectedRevision !== current.revision;
  const busy = mutation.busy || checking;
  useUnsavedChanges(draft !== null || busy);
  const api = () => {
    if (state.status !== "ready") throw new Error("Workspace access is unavailable");
    const { userId, membership: { role } } = state;
    return getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) });
  };
  function label(id: string | null) { return id === null ? "No Featured product" : products.find(product => product.id === id)?.name ?? `Product unavailable (${id})`; }
  function valid(request: UpdateFeaturedProductRequest) {
    return request.productId === null || choices.some(product => product.id === request.productId);
  }
  function startReview() {
    if (!owner || busy || blocked || changed || !draft) return;
    if (!valid(draft)) { setValidation("Choose an available product in an active category, or clear the selection."); return; }
    setValidation(null); setReview({ ...draft });
  }
  function save() {
    const request = review;
    if (!owner || busy || blocked || !request || request.expectedRevision !== current.revision) return;
    if (!valid(request)) { setReview(null); setValidation("This product is no longer eligible. Refresh the menu and review again."); return; }
    setReview(null); setFeedback(null);
    void mutation.run(() => api().updateFeaturedProduct(request), response => {
      setConfirmed({ response, baseline: saved }); setDraft(null); setBlocked(null); setValidation(null);
      setFeedback(`Featured selection saved: ${label(response.productId)}.`);
      AccessibilityInfo.announceForAccessibility("Featured selection saved.");
    }, failure => {
      if (failure instanceof ApiHttpError && failure.status === 403) setForbidden(true);
      else if (failure instanceof ApiHttpError && failure.status === 409) setBlocked("conflict");
      else if (failure instanceof ApiHttpError && [400, 404, 422].includes(failure.status)) setValidation("The server rejected this selection. Refresh the menu, choose an eligible product and review again.");
      else if (!(failure instanceof ApiHttpError && failure.status === 401)) setBlocked("uncertain");
    });
  }
  async function loadLatest() {
    if (checkingGate.current || mutation.busy) return;
    const started = scope;
    checkingGate.current = true; setChecking(true); setFeedback(null);
    try {
      const response = await api().getFeaturedProduct();
      if (!mounted.current || activeScope.current !== started) return;
      if (response.revision < current.revision) throw new Error("Stale server response");
      setConfirmed({ response, baseline: saved }); setDraft(null); setReview(null); setBlocked(null); setValidation(null); mutation.reset();
      setFeedback("Latest Featured selection loaded. Edit and review again before saving.");
    } catch (failure) {
      if (mounted.current && activeScope.current === started) {
        if (failure instanceof ApiHttpError && failure.status === 403) setForbidden(true);
        else setFeedback("The latest Featured selection could not be loaded. Reconnect and try again before saving.");
      }
    } finally { checkingGate.current = false; if (mounted.current && activeScope.current === started) setChecking(false); }
  }
  if (forbidden) return <StateView kind="forbidden" title="Featured change not permitted" message="Only the restaurant Owner may change Featured selection. Check your access before trying again." />;
  return <>
    <Body accessibilityLiveRegion="polite">Saved selection: {label(current.productId)}</Body>
    {current.status === "NONE" ? <Body>No Featured product is selected. Catalog order and sales do not select one automatically.</Body>
      : current.status === "UNAVAILABLE" || !selected || !eligible(selected, categories)
        ? <Status tone="warning">The selected product is unavailable or inactive and is not advertised as an orderable Featured item. No replacement is selected automatically.</Status>
        : <Body>Currently available as the restaurant's Featured product.</Body>}
    <Body>Photo publication and Featured selection are separate actions.</Body>
    {feedback ? <Status>{feedback}</Status> : null}
    {!owner ? <Body>Featured is read-only. Only the restaurant Owner can select, replace or clear it.</Body> : <>
      {blocked === "uncertain" ? <Status tone="warning">The save could not be confirmed and may have reached the server. Load the latest selection before another review.</Status> : null}
      {blocked === "conflict" || changed ? <Status tone="warning">The selection changed while you were editing. Load the latest selection, then edit and review again.</Status> : null}
      {!draft ? <Action title="Edit Featured selection" disabled={busy || !!blocked} onPress={() => {
        if (busy || blocked) return;
        setDraft({ productId: current.productId, expectedRevision: current.revision }); setFeedback(null); mutation.reset();
      }} /> : <>
        <Status tone="warning">Unsaved Featured proposal: {label(draft.productId)}</Status>
        {!choices.length ? <Body>No eligible products. Make a product available in an active category before selecting it.</Body> : null}
        {choices.map(product => <Action key={product.id} title={`Feature ${product.name}`} secondary selected={draft.productId === product.id} disabled={busy}
          accessibilityHint="Selects an unsaved proposal. Review and confirm before saving."
          onPress={() => { if (!busy) { setDraft({ ...draft, productId: product.id }); setReview(null); setValidation(null); } }} />)}
        <Action title="Clear Featured selection" secondary selected={draft.productId === null} disabled={busy}
          onPress={() => { if (!busy) { setDraft({ ...draft, productId: null }); setReview(null); setValidation(null); } }} />
        {validation ? <Status tone="danger">{validation}</Status> : null}
        {mutation.error ? <Status tone="danger">{mutation.error}</Status> : null}
        <Action ref={reviewButton} title="Review Featured change" disabled={busy || !!blocked || changed} onPress={startReview} />
        <Action title="Cancel Featured edits" secondary disabled={busy} onPress={() => { if (!busy) { setDraft(null); setReview(null); setValidation(null); mutation.reset(); } }} />
      </>}
    </>}
    <Action title="Load latest Featured selection" secondary disabled={busy} onPress={() => { void loadLatest(); }} />
    <ConfirmDialog visible={review !== null} title="Save Featured selection?" confirmLabel="Save Featured selection" returnFocusRef={reviewButton}
      message={review ? `Review revision ${review.expectedRevision}.\n${label(current.productId)} → ${label(review.productId)}\nThis is an Owner-curated restaurant pick.` : ""}
      busy={mutation.busy} confirmDisabled={busy || !!blocked || changed || !!review && !valid(review)} onConfirm={save}
      onCancel={() => { if (!mutation.busy) setReview(null); }} />
  </>;
}
