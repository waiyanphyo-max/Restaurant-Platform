"use client";

import type { View } from "@/types/workspace";
import { OverviewView, OrdersView, StaffOrderView, QueueView, DeliveriesView, ReportsView } from "@/features/workspace/views/OperationsViews";
import { MenuView, TablesView, SettingsView, DeliveryZonesView, TeamMembersView, RestaurantProfileView } from "@/features/workspace/views/RestaurantViews";
import { TableOrderView, StorefrontView, CustomerProfileView, CustomerAddressesView, CustomerOrdersView, NotificationsView, DevicesView, QueueTrackerView } from "@/features/workspace/views/CustomerViews";
import { ApiWorkbenchView, CreateRestaurantView } from "@/features/workspace/views/SpecialViews";
import { useWorkspaceContext } from "@/features/workspace/WorkspaceContext";

export default function WorkspaceViews() {
  const { view } = useWorkspaceContext();
  switch (view as View) {
    case "overview": return <OverviewView />;
    case "orders": return <OrdersView />;
    case "staff-order": return <StaffOrderView />;
    case "queue": return <QueueView />;
    case "deliveries": return <DeliveriesView />;
    case "reports": return <ReportsView />;
    case "menu": return <MenuView />;
    case "tables": return <TablesView />;
    case "settings": return <SettingsView />;
    case "zones": return <DeliveryZonesView />;
    case "members": return <TeamMembersView />;
    case "restaurant": return <RestaurantProfileView />;
    case "table-order": return <TableOrderView />;
    case "storefront": return <StorefrontView />;
    case "profile": return <CustomerProfileView />;
    case "addresses": return <CustomerAddressesView />;
    case "my-orders": return <CustomerOrdersView />;
    case "notifications": return <NotificationsView />;
    case "devices": return <DevicesView />;
    case "queue-track": return <QueueTrackerView />;
    case "api": return <ApiWorkbenchView />;
    case "create": return <CreateRestaurantView />;
    default: return <OverviewView />;
  }
}
