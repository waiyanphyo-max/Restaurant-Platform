import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { usePathname, useRouter } from "expo-router";
import type { CustomerAddressResponse, CustomerProfileResponse } from "@restaurant-platform/shared-types";
import { ApiProtocolError } from "@restaurant-platform/api-client";
import { getCustomerApi } from "../../api";
import { useCustomerAuth } from "../../auth/AuthProvider";
import { useApiQuery, type QueryState } from "../../hooks/useApiQuery";
import { resumeCustomerNotifications } from "../../notifications/native";

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
    const api = getCustomerApi();
    const [profile, addresses] = await Promise.all([api.getProfile({ signal }), api.listAddresses({ signal })]);
    if (auth.status !== "signed_in" || typeof profile?.id !== "string" || profile.id.toLowerCase() !== auth.userId.toLowerCase()) {
      throw new ApiProtocolError();
    }
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
