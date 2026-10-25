"use client";

import type { View } from "@/types/workspace";
import { groups } from "@/features/workspace/config";

type WorkspaceNavigationProps = {
  connected: boolean;
  role: string;
  view: View;
  onNavigate: (view: View) => void;
};

export default function WorkspaceNavigation({ connected, role, view, onNavigate }: WorkspaceNavigationProps) {
  let allowedItems: Set<string> | null = null;
  if (connected && role === "CUSTOMER") {
    allowedItems = new Set(["storefront", "table-order", "profile", "addresses", "my-orders", "notifications", "devices", "queue-track"]);
  } else if (connected && role === "DELIVERY_DRIVER") {
    allowedItems = new Set(["overview", "deliveries", "profile", "addresses", "my-orders", "notifications", "devices", "queue-track"]);
  } else if (connected && role === "STAFF") {
    allowedItems = new Set(["overview", "orders", "staff-order", "queue", "deliveries", "menu", "storefront", "table-order", "profile", "addresses", "my-orders", "notifications", "devices", "queue-track"]);
  } else if (connected && role === "MANAGER") {
    allowedItems = new Set(groups.flatMap((group) => group.items.map((item) => item[0])).filter((key) => key !== "members"));
  }

  return <>
    {groups.map((group) => {
      const items = group.items.filter((item) => !allowedItems || allowedItems.has(item[0]));
      if (!items.length) return null;
      return <div className="ws-nav-group" key={group.title}>
        <div className="ws-nav-label">{group.title}</div>
        {items.map((item) => <button key={item[0]} className={"ws-nav-item " + (view === item[0] ? "is-active" : "")} onClick={() => onNavigate(item[0])}>
          <span className="ws-nav-icon">{item[2]}</span><span>{item[1]}</span>
        </button>)}
      </div>;
    })}
  </>;
}
