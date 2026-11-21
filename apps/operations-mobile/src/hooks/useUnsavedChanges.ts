import { createContext, useContext, useEffect, useId } from "react";

export interface DraftNavigation {
  register(id: string, dirty: boolean): void;
  unregister(id: string): void;
  requestNavigation(action: () => void): void;
}

export const DraftNavigationContext = createContext<DraftNavigation>({
  register: () => undefined,
  unregister: () => undefined,
  requestNavigation: action => action(),
});

/** Open-form memory only; access revocation always takes precedence over a draft. */
export function useUnsavedChanges(dirty: boolean) {
  const navigation = useContext(DraftNavigationContext);
  const id = useId();
  useEffect(() => {
    navigation.register(id, dirty);
    return () => navigation.unregister(id);
  }, [navigation, id, dirty]);
}

export function useDraftNavigation() { return useContext(DraftNavigationContext); }
