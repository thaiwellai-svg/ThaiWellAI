import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

type CardVariant = "solid" | "glass";

interface CardProps extends HTMLMotionProps<"div"> {
  variant?: CardVariant;
  elevated?: boolean;
  interactive?: boolean;
  flush?: boolean;
}

/** Figma: white · r24 · p16 · gap10 · shadow 0 8 40 /12 (elevated). */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "solid", elevated, interactive, flush, className, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      className={clsx(
        "tw-card",
        variant === "glass" && "tw-card--glass",
        elevated && "tw-card--elevated",
        interactive && "tw-card--interactive",
        flush && "tw-card--flush",
        className,
      )}
      {...rest}
    />
  );
});

export function Divider(props: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className="tw-divider" {...props} />;
}
