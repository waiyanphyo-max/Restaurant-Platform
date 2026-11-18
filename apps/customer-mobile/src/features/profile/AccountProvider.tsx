import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { usePathname, useRouter } from "expo-router";
import type { CustomerAddressResponse, CustomerProfileResponse } from "@restaurant-platform/shared-types";
import { MissingAccessTokenError } from "@restaurant-platform/api-client";
import { getCustomerApi } from "../../api";
import { useCustomerAuth } from "../../auth/AuthProvider";
import { useApiQuery, type QueryState } from "../../hooks/useApiQuery";
import { accountOperation } from "../../hooks/apiFailure";
import { resumeCustomerNotifications } from "../../notifications/native";
import { checkedAddresses, checkedProfile } from "./account";

export interface CustomerAccount { profile: CustomerProfileResponse; addresses: CustomerAddressResponse[]; }
interface AccountContext {
  state: QueryState<CustomerAccount>;
  reload(): void;
  dismissOnboarding(): void;
  editingAddress: CustomerAddressResponse | null;
  editAddress(address?: CustomerAddressResponse): void;
}
const Context = createContext<AccountContext | null>(null);
export function needsAddressOnboarding(addresses: readonly CustomerAddressResponse[], dismissed: boolean): boolean {
  return !dismissed && addresses.length === 0;
}
export function homeAddress(addresses: readonly CustomerAddressResponse[]): CustomerAddressResponse | undefined {
  return addresses.find(address => address.label.trim().toLowerCase() === "home");
}

export function CustomerAccountProvider({ children }: PropsWithChildren) {
  const { state: auth } = useCustomerAuth();
  const query = useApiQuery(async signal => {
    if (auth.status !== "signed_in") throw new MissingAccessTokenError();
    const api = getCustomerApi(auth.userId);
    const [profile, addresses] = await Promise.all([
      accountOperation("profile", async () => checkedProfile(await api.getProfile({ signal }), auth.userId)),
      accountOperation("addresses", async () => checkedAddresses(await api.listAddresses({ signal })))
    ]);
    return { profile, addresses };
  }, "account");
  const [dismissed, setDismissed] = useState(false);
  const [editingAddress, setEditing] = useState<CustomerAddressResponse | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => { void resumeCustomerNotifications().catch(() => undefined); }, []);
  useEffect(() => {
    if (query.state.status === "ready" && needsAddressOnboarding(query.state.data.addresses, dismissed) && pathname !== "/address") {
      setEditing(null);
      router.replace("/address");
    }
  }, [query.state, dismissed, pathname, router]);
  return <Context.Provider value={{ ...query, editingAddress, dismissOnboarding: () => setDismissed(true), editAddress(address) {
    setEditing(address ?? null);
    setDismissed(true);
    router.push("/address");
  } }}>{children}</Context.Provider>;
}
export function useCustomerAccount() {
  const context = useContext(Context);
  if (!context) throw new Error("CustomerAccountProvider is required");
  return context;
}
