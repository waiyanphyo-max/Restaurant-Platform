import { useRouter } from "expo-router";
import { AddressScreen } from "../../src/features/addresses/AddressScreen";
import { useCustomerAccount } from "../../src/features/profile/AccountProvider";
import { Page, StateView } from "../../src/components/ui";
import { queryStateLabel, useCustomerText } from "../../src/i18n";
import { accountFailureTitle, apiFailureMessage } from "../../src/hooks/apiFailure";

export default function Address() {
  const account = useCustomerAccount();
  const router = useRouter();
  const t = useCustomerText();
  if (account.state.status !== "ready") return <Page title={t("Home Address", "အိမ်လိပ်စာ")}>
    <StateView kind={account.state.status} title={account.state.status === "error" ? accountFailureTitle(account.state.failure, t) : queryStateLabel(account.state.status, t)}
      message={account.state.status === "loading" ? undefined : apiFailureMessage(account.state.failure, t)} retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} onRetry={account.reload} />
  </Page>;
  return <AddressScreen address={account.editingAddress ?? undefined} onSaved={() => { account.reload(); account.dismissOnboarding(); router.replace("/profile"); }}
    onCancel={() => { account.dismissOnboarding(); router.replace("/profile"); }} />;
}
