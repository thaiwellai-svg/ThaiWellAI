import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

interface ChipProps {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  tone?: "light" | "glass";
}

export function Chip({ pressed, onClick, children, count, tone = "light" }: ChipProps) {
  return (
    <motion.button
      type="button"
      aria-pressed={pressed}
      whileTap={{ scale: 0.95 }}
      className={clsx("tw-chip", tone === "glass" && "tw-chip--glass")}
      onClick={onClick}
    >
      {children}
      {count !== undefined && <span className="tw-chip__count">{count}</span>}
    </motion.button>
  );
}
