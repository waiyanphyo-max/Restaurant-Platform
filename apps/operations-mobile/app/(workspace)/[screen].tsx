import { useLocalSearchParams } from "expo-router";
import { ScreenGuard } from "../../src/navigation/ScreenGuard";
import { DashboardScreen } from "../../src/features/operations/DashboardScreen";
import { OrdersScreen } from "../../src/features/operations/OrdersScreen";
import { ReportsScreen } from "../../src/features/operations/ReportsScreen";
import { MenuScreen } from "../../src/features/menu/MenuScreen";
import { SettingsScreen } from "../../src/features/management/SettingsScreen";
import { TeamScreen } from "../../src/features/management/TeamScreen";
import { TablesScreen } from "../../src/features/management/TablesScreen";
import { QueueScreen } from "../../src/features/operations/QueueScreen";
import { NotificationsScreen } from "../../src/features/operations/NotificationsScreen";
import { DeliveriesScreen } from "../../src/features/operations/DeliveriesScreen";
import { ProfileScreen } from "../../src/features/profile/ProfileScreen";
import { SalesLedgerScreen } from "../../src/features/accounting/SalesLedgerScreen";
import { ShoppingScreen } from "../../src/features/accounting/ShoppingScreen";
import { AccountingScreen } from "../../src/features/accounting/AccountingScreen";

export default function OperationsRoute() {
  const { screen } = useLocalSearchParams<{ screen: string }>();
  // The guard mounts before any feature component can issue requests.
  return <ScreenGuard screenId={screen}>
    {screen === "dashboard" ? <DashboardScreen /> : screen === "orders" ? <OrdersScreen />
      : screen === "sales-history" ? <SalesLedgerScreen /> : screen === "reports" ? <ReportsScreen />
      : screen === "shopping" ? <ShoppingScreen /> : screen === "accounting" ? <AccountingScreen />
      : screen === "menu" ? <MenuScreen /> : screen === "team" ? <TeamScreen />
      : screen === "settings" ? <SettingsScreen /> : screen === "deliveries" ? <DeliveriesScreen />
      : screen === "tables" ? <TablesScreen /> : screen === "queue" ? <QueueScreen /> : screen === "notifications" ? <NotificationsScreen />
      : screen === "profile" ? <ProfileScreen /> : null}
  </ScreenGuard>;
}
