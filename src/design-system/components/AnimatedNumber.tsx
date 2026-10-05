import { useEffect, useRef } from "react";
import { animate, useInView, useMotionValue, useTransform, motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString("th-TH");

/** Counts up on first view, then tweens between values when data changes. */
export function AnimatedNumber({ value, format = defaultFormat, duration = 1.1 }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [inView, value, duration, mv]);

  return <motion.span ref={ref} className="num">{text}</motion.span>;
}
