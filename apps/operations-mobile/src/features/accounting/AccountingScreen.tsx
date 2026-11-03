import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Choices } from "../management/controls";
import { ExpenseScreen } from "./ExpenseCashScreens";
import { CashbookScreen, DailyCashClosingScreen } from "./CashbookScreens";
import { AccountingAuditScreen } from "./AccountingAuditScreen";
import { FinancialRequestKeys } from "./financial-requests";

const views = ["expenses", "cashbook", "closing", "audit"] as const;
const labels = {
  expenses: "Expense Register",
  cashbook: "Cashbook",
  closing: "Daily Cash Closing",
  audit: "Audit History"
};

export function AccountingScreen() {
  const [workspace, setWorkspace] = useState<typeof views[number]>("expenses");
  const [requestKeys] = useState(() => new FinancialRequestKeys());
  return <View style={styles.container}>
    <View style={styles.navigation}>
      <Choices label="Accounting workspace" value={workspace} values={views} labels={labels} onChange={setWorkspace} />
    </View>
    {workspace === "expenses" ? <ExpenseScreen requestKeys={requestKeys} /> : null}
    {workspace === "cashbook" ? <CashbookScreen requestKeys={requestKeys} /> : null}
    {workspace === "closing" ? <DailyCashClosingScreen requestKeys={requestKeys} /> : null}
    {workspace === "audit" ? <AccountingAuditScreen /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navigation: { width: "100%", maxWidth: 1000, alignSelf: "center", paddingHorizontal: 20, paddingTop: 16 }
});
