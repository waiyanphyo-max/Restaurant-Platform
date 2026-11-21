import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { usePreventRemove } from "expo-router";
import { useOperationsAuth } from "../auth/AuthProvider";
import { ConfirmDialog } from "../components/ui";
import { DraftNavigationContext, type DraftNavigation } from "../hooks/useUnsavedChanges";
import { useOperationsText } from "./OperationsLanguage";

type Prevention = { enabled: boolean; register(id: string, disable: () => void): () => void };
const DraftPreventionContext = createContext<Prevention>({ enabled: false, register: () => () => undefined });

/** Attach prevention inside the route's own navigator, as well as its workspace. */
export function DraftRouteBoundary({ children }: PropsWithChildren) {
  const prevention = useContext(DraftPreventionContext);
  const navigation = useContext(DraftNavigationContext);
  const id = useId();
  const disable = usePreventRemove(prevention.enabled, ({ repeat }) => navigation.requestNavigation(repeat));
  useEffect(() => prevention.register(id, disable), [prevention.register, id, disable]);
  return children;
}

export function DraftNavigationProvider({ children }: PropsWithChildren) {
  const { state, workspace } = useOperationsAuth();
  const access = state.status === "ready" ? state : state.status === "checking_membership" ? workspace : null;
  const scope = access ? `${access.userId}:${access.membership.restaurantId}:${access.membership.role}` : "";
  return <ScopedDraftNavigation key={scope} scope={scope} permitted={state.status === "ready"}>{children}</ScopedDraftNavigation>;
}

function ScopedDraftNavigation({ children, scope, permitted }: PropsWithChildren<{ scope: string; permitted: boolean }>) {
  const dirty = useRef(new Set<string>());
  const [hasDraft, setHasDraft] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [bypassing, setBypassing] = useState(false);
  const disablePrevention = useRef<() => void>(() => undefined);
  const routePrevention = useRef(new Map<string, () => void>());
  const active = useRef(true);
  const access = useRef(permitted); access.current = permitted;
  const t = useOperationsText();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const context = useMemo<DraftNavigation>(() => ({
    register(id, changed) {
      if (changed) dirty.current.add(id); else dirty.current.delete(id);
      setHasDraft(dirty.current.size > 0);
    },
    unregister(id) { dirty.current.delete(id); setHasDraft(dirty.current.size > 0); },
    requestNavigation(action) {
      if (!active.current || !access.current) return;
      if (scope && dirty.current.size) setPending(() => action);
      else action();
    },
  }), [scope]);
  disablePrevention.current = usePreventRemove(permitted && !!scope && hasDraft && !bypassing, ({ repeat }) => context.requestNavigation(repeat));
  // Expo's prevention hook rearms only after a false → true transition. A local
  // action may retain another dirty form, so keep its registration and rearm.
  useEffect(() => { if (bypassing) setBypassing(false); }, [bypassing]);
  const registerPrevention = useMemo(() => (id: string, disable: () => void) => {
    routePrevention.current.set(id, disable);
    return () => { routePrevention.current.delete(id); };
  }, []);
  const discard = () => {
    const action = pending;
    setPending(null);
    setBypassing(true);
    disablePrevention.current();
    for (const disable of routePrevention.current.values()) disable();
    if (active.current && access.current) action?.();
  };
  return <DraftNavigationContext.Provider value={context}>
    <DraftPreventionContext.Provider value={{ enabled: permitted && !!scope && hasDraft && !bypassing, register: registerPrevention }}>{children}</DraftPreventionContext.Provider>
    <ConfirmDialog visible={permitted && pending !== null} title={t("Leave these changes?", "ပြောင်းလဲမှုများကို စွန့်ပစ်မည်လား။")}
      message={t("Unsaved edits in forms you close will be discarded. Saved catalog, settings, orders and history remain unchanged. Drafts stay only while their form is open.", "မသိမ်းရသေးသော ပြောင်းလဲမှုများကို စွန့်ပစ်မည်။ သိမ်းထားသော အချက်အလက်နှင့် မှတ်တမ်းများကို မဖျက်ပါ။")}
      cancelLabel={t("Keep editing", "ဆက်လက်ပြင်ဆင်မည်")}
      confirmLabel={t("Discard changes", "ပြောင်းလဲမှုများကို စွန့်ပစ်မည်")} danger onCancel={() => setPending(null)} onConfirm={discard} />
  </DraftNavigationContext.Provider>;
}
