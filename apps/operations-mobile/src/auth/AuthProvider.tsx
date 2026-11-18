import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { getOperationsApi } from "../api";
import { readEmbeddedTenant } from "../tenant";
import {
  createOperationsAccessController, type OperationsAccessController, type OperationsAccessState
} from "./access";
import { getOperationsAuth } from "./native";
import { operationsNotifications, watchOperationsNotifications } from "../notifications/native";
import { retainWorkspace, type VerifiedWorkspace } from "./workspace";
import type { OperationsRole } from "./access";

interface OperationsAuthContextValue {
  state: OperationsAccessState;
  workspace: VerifiedWorkspace | null;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  retryMembership(): Promise<void>;
  verifyWorkspaceAccess(userId: string, role: OperationsRole): Promise<void>;
  assertWorkspaceAccess(userId: string, role: OperationsRole): void;
}

const OperationsAuthContext = createContext<OperationsAuthContextValue | null>(null);

export function OperationsAuthProvider({ children }: PropsWithChildren) {
  const [view, setView] = useState<{ state: OperationsAccessState; workspace: VerifiedWorkspace | null }>({
    state: { status: "loading" }, workspace: null,
  });
  const { state, workspace } = view;
  function setState(next: OperationsAccessState) {
    setView(previous => ({ state: next, workspace: retainWorkspace(previous.workspace, next) }));
  }
  const access = useRef<OperationsAccessController | null>(null);

  useEffect(() => {
    let controller: OperationsAccessController | null = null;
    let stop: (() => void) | null = null;
    let lifecycle: { remove(): void } | null = null;
    let connectivity: { remove(): void } | null = null;
    let stopNotifications: (() => void) | undefined;
    let active = true;
    try {
      const tenant = readEmbeddedTenant();
      controller = createOperationsAccessController(getOperationsAuth(), getOperationsApi(), tenant.restaurantId, operationsNotifications.cleanup);
      access.current = controller;
      const current = controller;
      stopNotifications = watchOperationsNotifications(() => {
        const state = current.getState();
        return state.status === "ready" ? state.userId : null;
      });
      stop = controller.subscribe(next => {
        setState(next);
        if (next.status === "ready") void operationsNotifications.resume().catch(() => undefined);
        if (next.status === "denied" || next.status === "signed_out") void operationsNotifications.cleanup();
      });
      if (AppState.currentState !== "active") current.suspend();
      lifecycle = AppState.addEventListener("change", (next) => {
        if (next === "active") void current.retryMembership();
        else current.suspend();
      });
      const updateNetwork = (network: Network.NetworkState) => {
        if (!active) return;
        if (network.isConnected === false || network.isInternetReachable === false) current.setOnline(false);
        else if (network.isConnected === true) current.setOnline(true);
      };
      connectivity = Network.addNetworkStateListener(updateNetwork);
      void Network.getNetworkStateAsync().then(updateNetwork).catch(() => { /* The API check still fails closed. */ });
      void controller.start();
    } catch {
      setState({ status: "unconfigured" });
    }
    return () => {
      active = false;
      access.current = null;
      stop?.();
      lifecycle?.remove();
      connectivity?.remove();
      stopNotifications?.();
      controller?.dispose();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!access.current) throw new Error("Sign-in is unavailable in this build");
    await getOperationsAuth().signInWithPassword(email, password);
  }, []);
  const signOut = useCallback(async () => {
    try { await access.current?.signOut(); }
    catch (error) {
      setState({ status: "error", message: "Your device could not clear its secure session. Try signing out again before closing the app." });
      throw error;
    }
  }, []);
  const retryMembership = useCallback(async () => { await access.current?.retryMembership(); }, []);
  const assertWorkspaceAccess = useCallback((userId: string, role: OperationsRole) => {
    if (!access.current) throw new Error("Restaurant access is unavailable");
    access.current.assertAccess(userId, role);
  }, []);
  const verifyWorkspaceAccess = useCallback(async (userId: string, role: OperationsRole) => {
    if (!access.current) throw new Error("Restaurant access is unavailable");
    await access.current.verifyAccess(userId, role);
  }, []);
  const value: OperationsAuthContextValue = {
    state, workspace, signInWithPassword, signOut, retryMembership, verifyWorkspaceAccess, assertWorkspaceAccess,
  };

  return <OperationsAuthContext.Provider value={value}>{children}</OperationsAuthContext.Provider>;
}

/** Used only inside a hidden, guarded workspace while its real access is rechecked. */
export function OperationsWorkspaceContext({ children }: PropsWithChildren) {
  const context = useOperationsAuth();
  if (!context.workspace) return null;
  return <OperationsAuthContext.Provider value={{ ...context, state: context.workspace }}>
    {children}
  </OperationsAuthContext.Provider>;
}

export function useOperationsAuth(): OperationsAuthContextValue {
  const context = useContext(OperationsAuthContext);
  if (!context) throw new Error("OperationsAuthProvider is required");
  return context;
}
