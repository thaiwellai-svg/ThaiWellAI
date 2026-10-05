import { forwardRef } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "glass" | "white";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  /** flex: 1 0 0 — Figma "fill container" inside a button row */
  fill?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}

/** Figma: pill · h28 · px12 · Inter Medium 12. Primary #4C845A, outline #D6DED1. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "sm", block, fill, leading, trailing, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={rest.disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={clsx(
        "tw-btn",
        `tw-btn--${variant}`,
        size !== "sm" && `tw-btn--${size}`,
        block && "tw-btn--block",
        fill && "tw-btn--fill",
        className,
      )}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </motion.button>
  );
});
