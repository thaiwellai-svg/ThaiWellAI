import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import "./multi-select.css";

/** Dropdown that picks several items from a list; free text can be added as a new item. */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "เลือก…",
  none = "ไม่มี",
  tone = "var(--color-text)",
  icon,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: readonly string[];
  placeholder?: string;
  /** label of the "nothing" choice that clears the list */
  none?: string;
  tone?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const field = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);

  const place = () => {
    const r = field.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 340 && r.top > 340;
    setPos({ left: r.left, top: up ? r.top - 8 : r.bottom + 8, width: Math.max(r.width, 280), up });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open, value.length]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!field.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  const shown = all.filter((o) => !q.trim() || o.toLowerCase().includes(q.trim().toLowerCase()));
  const canAdd = q.trim() && !all.some((o) => o === q.trim());

  return (
    <>
      <div
        ref={field}
        className={open ? "msel is-open" : "msel"}
        style={{ ["--mc" as string]: tone }}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen((v) => !v))}
      >
        {icon && <span className="msel__icon">{icon}</span>}
        <span className="msel__chips">
          {value.length === 0 ? (
            <span className="msel__ph">{placeholder}</span>
          ) : (
            value.map((v) => (
              <span key={v} className="msel__chip">
                {v}
                <button
                  type="button"
                  aria-label={`ลบ ${v}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              </span>
            ))
          )}
        </span>
        <ChevronDown size={16} className="msel__caret" />
      </div>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={pop}
              className="msel__pop"
              role="listbox"
              aria-multiselectable
              style={{ left: pos.left, top: pos.top, width: pos.width, translate: pos.up ? "0 -100%" : undefined, ["--mc" as string]: tone }}
              initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
            >
              <label className="msel__search">
                <Search size={14} />
                <input
                  autoFocus={window.matchMedia("(pointer: fine)").matches}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canAdd) {
                      e.preventDefault();
                      toggle(q.trim());
                      setQ("");
                    }
                  }}
                  placeholder="ค้นหา หรือพิมพ์เพิ่ม"
                />
              </label>
              <div className="msel__list">
                <button type="button" className="msel__opt is-none" aria-selected={value.length === 0} onClick={() => onChange([])}>
                  <i>{value.length === 0 && <Check size={12} strokeWidth={3} />}</i>
                  {none}
                </button>
                {shown.map((o) => (
                  <button key={o} type="button" className="msel__opt" role="option" aria-selected={value.includes(o)} onClick={() => toggle(o)}>
                    <i>{value.includes(o) && <Check size={12} strokeWidth={3} />}</i>
                    {o}
                  </button>
                ))}
                {canAdd && (
                  <button
                    type="button"
                    className="msel__opt is-add"
                    onClick={() => {
                      toggle(q.trim());
                      setQ("");
                    }}
                  >
                    <i>
                      <Plus size={12} strokeWidth={3} />
                    </i>
                    เพิ่ม “{q.trim()}”
                  </button>
                )}
              </div>
              <footer className="msel__foot">
                <span>{value.length ? `เลือก ${value.length} รายการ` : "ยังไม่ได้เลือก"}</span>
                <button type="button" onClick={() => setOpen(false)}>
                  เสร็จ
                </button>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
