import { useState } from "react";
import { View } from "react-native";
import { Choices } from "../management/controls";
import { CashbookScreen, ExpenseScreen } from "./ExpenseCashScreens";
import { AccountingAuditScreen } from "./AccountingAuditScreen";

export function AccountingScreen() {
  const [workspace, setWorkspace] = useState<"EXPENSES" | "CASHBOOK" | "AUDIT">("EXPENSES");
  return <View style={{ flex: 1 }}><View style={{ padding: 16 }}><Choices<"EXPENSES" | "CASHBOOK" | "AUDIT"> label="Accounting workspace" value={workspace} values={["EXPENSES", "CASHBOOK", "AUDIT"] as const} onChange={setWorkspace} /></View>
    {workspace === "EXPENSES" ? <ExpenseScreen /> : workspace === "CASHBOOK" ? <CashbookScreen /> : <AccountingAuditScreen />}
  </View>;
}
