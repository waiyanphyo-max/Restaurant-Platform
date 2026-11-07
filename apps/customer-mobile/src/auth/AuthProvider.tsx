import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { getCustomerAuth } from "./native";
import { cleanupCustomerDevice, watchCustomerNotificationConnectivity } from "../notifications/native";
import { createCustomerAuthFlow, type CustomerAuthFlow, type CustomerAuthState, type CustomerAuthView } from "./flow";

export type { CustomerAuthState } from "./flow";
interface CustomerAuthContextValue {
  state: CustomerAuthState;
  phoneEnabled: boolean;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<{ authenticated: boolean }>;
  requestPhoneOtp(phone: string): Promise<void>;
  verifyPhoneOtp(phone: string, token: string): Promise<void>;
  signOut(): Promise<void>;
  retry(): Promise<void>;
}
const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: PropsWithChildren) {
  const [view, setView] = useState<CustomerAuthView>({ state: { status: "loading" }, phoneEnabled: false });
  const flow = useRef<CustomerAuthFlow | null>(null);
  useEffect(() => {
    let controller: CustomerAuthFlow | null = null;
    let stop: (() => void) | undefined;
    let stopNotifications: (() => void) | undefined;
    try {
      controller = createCustomerAuthFlow(getCustomerAuth(), cleanupCustomerDevice);
      flow.current = controller;
      stop = controller.subscribe(setView);
      stopNotifications = watchCustomerNotificationConnectivity();
      void controller.start();
    } catch { setView({ state: { status: "unconfigured" }, phoneEnabled: false }); }
    return () => { stop?.(); stopNotifications?.(); controller?.dispose(); flow.current = null; };
  }, []);
  const current = useCallback(() => {
    if (!flow.current) throw new Error("Customer authentication is unavailable");
    return flow.current;
  }, []);
  const value: CustomerAuthContextValue = {
    ...view,
    signInWithPassword: (email, password) => current().signInWithPassword(email, password),
    signUpWithPassword: (email, password) => current().signUpWithPassword(email, password),
    requestPhoneOtp: phone => current().requestPhoneOtp(phone),
    verifyPhoneOtp: (phone, token) => current().verifyPhoneOtp(phone, token),
    signOut: () => current().signOut(), retry: () => current().retry()
  };
  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const context = useContext(CustomerAuthContext);
  if (!context) throw new Error("CustomerAuthProvider is required");
  return context;
}
