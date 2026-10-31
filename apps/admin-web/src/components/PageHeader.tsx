import type { ReactNode } from "react";

export function PageHeader({ eyebrow = "PLATFORM WORKSPACE", title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="overline">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-action">{action}</div>}</div>;
}
