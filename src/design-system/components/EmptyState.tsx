import type { ReactNode } from "react";
import { clsx } from "clsx";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  onGlass?: boolean;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, onGlass, action }: EmptyStateProps) {
  return (
    <div className={clsx("tw-empty", onGlass && "tw-empty--on-glass")}>
      <span className="tw-empty__icon">{icon}</span>
      <p className="tw-empty__title">{title}</p>
      {description && <p className="tw-meta" style={onGlass ? { color: "rgba(255,255,255,.8)" } : undefined}>{description}</p>}
      {action}
    </div>
  );
}
