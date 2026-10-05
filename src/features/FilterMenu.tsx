import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ListFilter } from "lucide-react";
import { IconButton, spring } from "../design-system";
import "./filter-menu.css";

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number }>;

interface Option<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: IconCmp;
}

/** Glass icon button that opens a filter menu; shows a dot while a non-default filter is active. */
export function FilterMenu<T extends string>({ value, onChange, options, label = "ตัวกรอง" }: { value: T; onChange: (v: T) => void; options: Option<T>[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== options[0]?.value;
  // the trigger wears the icon of whichever filter is applied
  // with no filter applied the trigger reads as a plain "filter" button
  const Current: IconCmp = (active && options.find((o) => o.value === value)?.icon) || ListFilter;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="fmenu" ref={ref}>
      <IconButton label={label} aria-expanded={open} aria-haspopup="menu" indicator={active} onClick={() => setOpen((o) => !o)}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            style={{ display: "grid" }}
            initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 30 }}
            transition={spring.snappy}
          >
            <Current size={20} strokeWidth={1.8} />
          </motion.span>
        </AnimatePresence>
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="fmenu__panel"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14 } }}
            transition={spring.soft}
          >
            <p className="fmenu__title">{label}</p>
            {options.map((o) => (
              <button
                key={o.value}
                role="menuitemradio"
                aria-checked={o.value === value}
                className="fmenu__item"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="fmenu__icon">{o.icon && <o.icon size={18} strokeWidth={1.8} />}</span>
                <span className="fmenu__label">{o.label}</span>
                {o.count !== undefined && <span className="fmenu__count">{o.count}</span>}
                <span className="fmenu__check">{o.value === value && <Check size={15} strokeWidth={2.6} />}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
