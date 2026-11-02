import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";
import { getOperationsApi } from "../api";
import { readEmbeddedTenant } from "../tenant";
import {
  createOperationsAccessController, type OperationsAccessController, type OperationsAccessState
} from "./access";
import { getOperationsAuth } from "./native";

interface OperationsAuthContextValue {
  state: OperationsAccessState;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  retryMembership(): Promise<void>;
}

const OperationsAuthContext = createContext<OperationsAuthContextValue | null>(null);

export function OperationsAuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<OperationsAccessState>({ status: "loading" });
  const access = useRef<OperationsAccessController | null>(null);

  useEffect(() => {
    let controller: OperationsAccessController | null = null;
    let stop: (() => void) | null = null;
    let lifecycle: { remove(): void } | null = null;
    let connectivity: { remove(): void } | null = null;
    let active = true;
    try {
      const tenant = readEmbeddedTenant();
      controller = createOperationsAccessController(getOperationsAuth(), getOperationsApi(), tenant.restaurantId);
      access.current = controller;
      stop = controller.subscribe(setState);
      const current = controller;
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
  const value: OperationsAuthContextValue = { state, signInWithPassword, signOut, retryMembership };

  return <OperationsAuthContext.Provider value={value}>{children}</OperationsAuthContext.Provider>;
}

export function useOperationsAuth(): OperationsAuthContextValue {
  const context = useContext(OperationsAuthContext);
  if (!context) throw new Error("OperationsAuthProvider is required");
  return context;
}
