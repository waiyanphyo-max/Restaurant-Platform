import type { ReactNode } from "react";

type StatusBadgeProps = { status?: string | null; fallback?: string; label?: string; children?: ReactNode };

export default function StatusBadge({ status, fallback = "—", label, children }: StatusBadgeProps) {
  const text = children ?? (status || fallback).replaceAll("_", " ");
  const accessibleLabel = label && typeof text === "string" ? `${label}: ${text}` : undefined;
  return <span className="ws-status" aria-label={accessibleLabel}>{text}</span>;
}
