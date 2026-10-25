"use client";

import type { ReactNode } from "react";

type SectionIntroProps = { heading: string; sub: string };
export function SectionIntro({ heading, sub }: SectionIntroProps) {
  return <div className="ws-section-intro"><div><span className="ws-eyebrow">WORKSPACE</span><h2>{heading}</h2><p>{sub}</p></div></div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="ws-empty-state"><span>—</span><p>{children}</p></div>;
}

type FormFieldProps = { labelText: string; children: ReactNode; wide?: boolean };
export function FormField({ labelText, children, wide = false }: FormFieldProps) {
  return <label className={"ws-field " + (wide ? "ws-field-wide" : "")}><span>{labelText}</span>{children}</label>;
}
