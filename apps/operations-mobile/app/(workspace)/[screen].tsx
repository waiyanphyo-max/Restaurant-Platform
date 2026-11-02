import { useLocalSearchParams } from "expo-router";
import { ScreenGuard } from "../../src/navigation/ScreenGuard";
import { DashboardScreen } from "../../src/features/operations/DashboardScreen";
import { OrdersScreen } from "../../src/features/operations/OrdersScreen";
import { ReportsScreen } from "../../src/features/operations/ReportsScreen";
import { MenuScreen, SettingsScreen, TeamScreen } from "../../src/features/operations/ManagementScreens";
import { DeliveriesScreen } from "../../src/features/operations/DeliveriesScreen";
import { ProfileScreen } from "../../src/features/profile/ProfileScreen";

export default function OperationsRoute() {
  const { screen } = useLocalSearchParams<{ screen: string }>();
  // The guard mounts before any feature component can issue requests.
  return <ScreenGuard screenId={screen}>
    {screen === "dashboard" ? <DashboardScreen /> : screen === "orders" ? <OrdersScreen />
      : screen === "sales-history" ? <OrdersScreen history /> : screen === "reports" ? <ReportsScreen />
      : screen === "menu" ? <MenuScreen /> : screen === "team" ? <TeamScreen />
      : screen === "settings" ? <SettingsScreen /> : screen === "deliveries" ? <DeliveriesScreen />
      : screen === "profile" ? <ProfileScreen /> : null}
  </ScreenGuard>;
}
