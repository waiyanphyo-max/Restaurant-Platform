import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { customerEmailRecoveryEnabled, getCustomerAuth } from "./native";
import { cleanupCustomerDevice, resumeCustomerNotifications, watchCustomerNotificationConnectivity } from "../notifications/native";
import { createCustomerAuthFlow, type CustomerAuthFlow, type CustomerAuthState, type CustomerAuthView } from "./flow";

export type { CustomerAuthState } from "./flow";
interface CustomerAuthContextValue {
  state: CustomerAuthState;
  phoneEnabled: boolean;
  emailRecoveryEnabled: boolean;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<{ authenticated: boolean }>;
  resendConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, token: string, password: string): Promise<void>;
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
    let previousOwner: string | null | undefined;
    try {
      controller = createCustomerAuthFlow(getCustomerAuth(), cleanupCustomerDevice);
      flow.current = controller;
      stop = controller.subscribe(next => {
        setView(next);
        if (next.state.status !== "signed_in" && next.state.status !== "signed_out") return;
        const owner = next.state.status === "signed_in" ? next.state.userId : null;
        if (owner === previousOwner) return;
        previousOwner = owner;
        if (owner) void resumeCustomerNotifications().catch(() => undefined);
        else void cleanupCustomerDevice();
      });
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
    emailRecoveryEnabled: customerEmailRecoveryEnabled(),
    signInWithPassword: (email, password) => current().signInWithPassword(email, password),
    signUpWithPassword: (email, password) => current().signUpWithPassword(email, password),
    resendConfirmation: email => current().resendConfirmation(email),
    requestPasswordReset: email => current().requestPasswordReset(email),
    resetPassword: (email, token, password) => current().resetPassword(email, token, password),
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
