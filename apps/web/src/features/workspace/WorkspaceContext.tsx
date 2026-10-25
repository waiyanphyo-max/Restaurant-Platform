/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Membership, Row } from "@/types/workspace";

export type WorkspaceCartItem = {
  quantity: number;
  variantId: string;
  specialInstruction: string;
  modifiers: Record<string, number>;
};

export type WorkspaceViewContext = Record<string, any> & {
  memberships: Membership[];
  orders: Row[];
  queue: Row[];
  deliveries: Row[];
  categories: Row[];
  products: Row[];
  variantsByProduct: Record<string, Row[]>;
  linkedGroupsByProduct: Record<string, Row[]>;
  groupsList: Row[];
  payments: Row[];
  tables: Row[];
  zones: Row[];
  members: Row[];
  addresses: Row[];
  customerOrders: Row[];
  customerZones: Row[];
  notifications: Row[];
  devices: Row[];
  activeCartItems: Array<[string, WorkspaceCartItem]>;
  cart: Record<string, WorkspaceCartItem>;
  trackingNotifications: Row[];
  filteredOrders: Row[];
  filteredProducts: Row[];
  data: Row;
  report: Row;
  publicMenu: Row;
  tracking: Row;
  ticket: { id: string; token: string };
};

const WorkspaceContext = createContext<WorkspaceViewContext | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceViewContext; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceViewContext {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace view components must be rendered inside WorkspaceProvider.");
  return value;
}
