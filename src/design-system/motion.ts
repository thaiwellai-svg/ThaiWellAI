import type { Transition, Variants } from "framer-motion";

/** Motion tokens — keep every animation in the product on these curves. */
export const spring = {
  /** UI controls: segmented thumb, dock halo, switches */
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.8 },
  /** Cards, sheets, list reflow */
  soft: { type: "spring", stiffness: 300, damping: 32, mass: 0.9 },
  /** Dialog / drawer entrance */
  gentle: { type: "spring", stiffness: 240, damping: 30 },
} satisfies Record<string, Transition>;

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: ease.out } },
};

export const stagger = (delayChildren = 0.05, staggerChildren = 0.055): Variants => ({
  hidden: {},
  show: { transition: { delayChildren, staggerChildren } },
});

export const listItem: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.42, ease: ease.out } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: ease.inOut } },
};
