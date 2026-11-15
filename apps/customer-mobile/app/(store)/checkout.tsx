import { useRouter } from "expo-router";
import { Page, StateView } from "../../src/components/ui";
import { CheckoutScreen } from "../../src/features/checkout/CheckoutScreen";
import { useCustomerAccount } from "../../src/features/profile/AccountProvider";
import { queryStateLabel, useCustomerText } from "../../src/i18n";
import { accountFailureTitle, apiFailureMessage } from "../../src/hooks/apiFailure";

export default function Checkout() {
  const router = useRouter();
  const account = useCustomerAccount();
  const t = useCustomerText();
  if (account.state.status !== "ready") return <Page title={t("Checkout", "ငွေရှင်းရန်")}>
    <StateView kind={account.state.status} title={account.state.status === "error" ? accountFailureTitle(account.state.failure, t) : queryStateLabel(account.state.status, t)}
      message={account.state.status === "loading" ? undefined : apiFailureMessage(account.state.failure, t)}
      retryLabel={t("Try again", "ထပ်ကြိုးစားပါ")} onRetry={account.reload} />
  </Page>;
  return <CheckoutScreen account={account.state.data} onCart={() => router.navigate("/cart")}
    onOrders={() => router.navigate("/orders")}
    onOrder={orderId => router.replace({ pathname: "/order/[orderId]", params: { orderId } })} />;
}
