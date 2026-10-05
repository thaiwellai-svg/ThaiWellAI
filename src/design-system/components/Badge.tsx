import type { ReactNode } from "react";
import { clsx } from "clsx";

export type BadgeTone = "danger" | "warning" | "success" | "info" | "neutral" | "white";

interface BadgeProps {
  tone?: BadgeTone;
  size?: "sm" | "lg";
  compact?: boolean;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

/** Figma: pill · px12 py4 · Sarabun Medium 10 (sm) / 12 (lg). */
export function Badge({ tone = "neutral", size = "sm", compact, dot, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "tw-badge",
        `tw-badge--${tone}`,
        size === "lg" && "tw-badge--lg",
        compact && "tw-badge--compact",
        className,
      )}
    >
      {dot && <span className="tw-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}
