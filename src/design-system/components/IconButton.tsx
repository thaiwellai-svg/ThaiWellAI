import { forwardRef } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

interface IconButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  label: string;
  variant?: "glass" | "white" | "soft";
  size?: "sm" | "md";
  indicator?: boolean;
  children: ReactNode;
}

/** Figma: 44 circle · glass rgba(255,255,255,.1) · p10 · icon 20. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "glass", size = "md", indicator, className, children, type = "button", style, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={clsx("tw-icon-btn", `tw-icon-btn--${variant}`, size === "sm" && "tw-icon-btn--sm", className)}
      style={{ position: "relative", ...style }}
      {...rest}
    >
      {children}
      {indicator && <span className="tw-icon-btn__dot" aria-hidden />}
    </motion.button>
  );
});
