import { createContext, useContext, type PropsWithChildren } from "react";
import type { PublicMenuResponse } from "@restaurant-platform/shared-types";
import { getCustomerPublicApi } from "../../api";
import { useApiQuery, type QueryState } from "../../hooks/useApiQuery";
import { readEmbeddedTenant } from "../../tenant";

type PublicMenuQuery = { state: QueryState<PublicMenuResponse>; reload(): void };
const MenuContext = createContext<PublicMenuQuery | null>(null);

/** One account-scoped menu read shared across Home, Menu, Product and Cart. */
export function CustomerMenuProvider({ children }: PropsWithChildren) {
  const tenant = readEmbeddedTenant();
  const query = useApiQuery(signal => getCustomerPublicApi().getPublicMenu({ signal }),
    `storefront:${tenant.restaurantId}:${tenant.environment}:${tenant.apiBaseUrl}`, true);
  return <MenuContext.Provider value={query}>{children}</MenuContext.Provider>;
}

export function usePublicMenu(): PublicMenuQuery {
  const query = useContext(MenuContext);
  if (!query) throw new Error("CustomerMenuProvider is required");
  return query;
}
