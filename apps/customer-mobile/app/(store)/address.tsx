import { useRouter } from "expo-router";
import { AddressScreen } from "../../src/features/addresses/AddressScreen";
import { useCustomerAccount } from "../../src/features/profile/AccountProvider";
import { Page, StateView } from "../../src/components/ui";

export default function Address() {
  const account = useCustomerAccount();
  const router = useRouter();
  if (account.state.status !== "ready") return <Page title="Home Address"><StateView kind={account.state.status} onRetry={account.reload} /></Page>;
  return <AddressScreen address={account.editingAddress ?? undefined} onSaved={() => { account.reload(); account.dismissOnboarding(); router.replace("/profile"); }}
    onCancel={() => { account.dismissOnboarding(); router.replace("/profile"); }} />;
}
