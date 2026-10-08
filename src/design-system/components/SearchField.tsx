import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { clsx } from "clsx";
import { CloseIcon, SearchIcon } from "../icons";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tone?: "glass" | "light";
  className?: string;
  autoFocus?: boolean;
  /** ⌘K / Ctrl+K / "/" focuses this field (glass fields only by default) */
  shortcut?: boolean;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPad|iPhone/.test(navigator.platform || navigator.userAgent);

/** Frosted pill · h44 · stroke icon · clear button · keyboard shortcut hint. */
export function SearchField({ value, onChange, placeholder = "ค้นหา…", tone = "glass", className, autoFocus, shortcut = tone === "glass" }: SearchFieldProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  return (
    <label className={clsx("tw-search", tone === "light" ? "tw-search--light" : "tw-frosted", className)}>
      <SearchIcon className="tw-search__icon" />
      <span className="sr-only">ค้นหา</span>
      <input
        ref={input}
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            input.current?.blur();
          }
        }}
      />
      <AnimatePresence initial={false} mode="popLayout">
        {value ? (
          <motion.button
            key="clear"
            type="button"
            className="tw-search__clear"
            aria-label="ล้างคำค้นหา"
            initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
            transition={{ type: "spring", stiffness: 520, damping: 30 }}
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
          >
            <CloseIcon />
          </motion.button>
        ) : (
          shortcut && (
            <motion.kbd key="kbd" className="tw-search__kbd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isMac ? "⌘K" : "Ctrl K"}
            </motion.kbd>
          )
        )}
      </AnimatePresence>
    </label>
  );
}
