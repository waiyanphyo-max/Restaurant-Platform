import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Notice({ title, children, tone = "info", action }: {
  title: string;
  children?: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  action?: ReactNode;
}) {
  return (
    <div className={`notice notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "success" ? "check" : tone === "error" || tone === "warning" ? "alert" : "shield"} />
      <div className="notice-content"><strong>{title}</strong>{children && <div>{children}</div>}</div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description, icon, action }: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
