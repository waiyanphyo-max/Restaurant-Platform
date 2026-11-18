import * as SecureStore from "expo-secure-store";
import { createPurchaseAttemptStore, type PurchaseAttemptScope } from "./purchase-attempt";

export function createNativePurchaseAttemptStore(scope: PurchaseAttemptScope) {
  return createPurchaseAttemptStore(scope, SecureStore);
}
