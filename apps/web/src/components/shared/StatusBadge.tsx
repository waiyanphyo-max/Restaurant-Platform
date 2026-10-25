import type { ReactNode } from "react";

type StatusBadgeProps = { status?: string | null; fallback?: string; label?: string; children?: ReactNode };

export default function StatusBadge({ status, fallback = "—", label, children }: StatusBadgeProps) {
  const text = children ?? (status || fallback).replaceAll("_", " ");
  return <span className="ws-status" aria-label={label ? `${label}: ${text}` : undefined}>{text}</span>;
}
