import { useId } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { spring } from "../motion";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  tone?: "glass" | "light";
  label: string;
}

export function Segmented<T extends string>({ value, onChange, options, tone = "glass", label }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className={clsx("tw-segmented", tone === "light" && "tw-segmented--light")}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={selected}
            className="tw-segmented__item"
            onClick={() => onChange(o.value)}
          >
            {selected && <motion.span layoutId={`seg-${id}`} className="tw-segmented__thumb" transition={spring.snappy} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
