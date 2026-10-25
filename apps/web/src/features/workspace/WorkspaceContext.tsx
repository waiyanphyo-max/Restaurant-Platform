/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type WorkspaceViewContext = Record<string, any>;

const WorkspaceContext = createContext<WorkspaceViewContext | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceViewContext; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceViewContext {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace view components must be rendered inside WorkspaceProvider.");
  return value;
}
