import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Ellipsis } from "lucide-react";
import "./more-menu.css";

export type MoreItem = { label: string; icon: ReactNode; onClick: () => void; hint?: string };

/** ⋯ button with a small popover of secondary actions */
export function MoreMenu({ items, className = "pd__ib" }: { items: MoreItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !btn.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <>
      <button ref={btn} type="button" className={open ? `${className} is-on` : className} aria-label="เพิ่มเติม" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Ellipsis size={18} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={pop} className="more" role="menu" style={pos} initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.16 }}>
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                >
                  <span>{it.icon}</span>
                  <b>{it.label}</b>
                  {it.hint && <small>{it.hint}</small>}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
