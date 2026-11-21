import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import { useOperationsAuth } from "../../auth/AuthProvider";

export type InvitationAttempt = { email: string; state: "sending" | "uncertain" | "confirmed" | "conflict" };

/** Session memory only. An absent membership never proves an external email was not sent. */
export function createInvitationRecovery() {
  const attempts = new Map<string, InvitationAttempt>();
  return {
    get(email: string) { return attempts.get(email.trim().toLowerCase()); },
    list() { return [...attempts.values()]; },
    record(email: string, state: InvitationAttempt["state"]) {
      const normalized = email.trim().toLowerCase();
      attempts.set(normalized, { email: normalized, state });
    },
    rejected(email: string) { attempts.delete(email.trim().toLowerCase()); },
  };
}

type Recovery = ReturnType<typeof createInvitationRecovery>;
const InvitationRecoveryContext = createContext<Recovery | null>(null);

/** Mount outside the retained workspace context so sign-out and revocation clear this memory. */
export function InvitationRecoveryProvider({ children }: PropsWithChildren) {
  const { state, workspace } = useOperationsAuth();
  const access = state.status === "ready" ? state : workspace;
  const scope = access ? `${access.userId}:${access.membership.restaurantId}:${access.membership.role}` : "";
  const current = useRef<{ scope: string; recovery: Recovery }>({ scope, recovery: createInvitationRecovery() });
  if (current.current.scope !== scope) current.current = { scope, recovery: createInvitationRecovery() };
  return <InvitationRecoveryContext.Provider value={current.current.recovery}>{children}</InvitationRecoveryContext.Provider>;
}

export function useInvitationRecovery() {
  const shared = useContext(InvitationRecoveryContext);
  const local = useRef<Recovery | null>(null);
  if (!local.current) local.current = createInvitationRecovery();
  return shared ?? local.current;
}
