import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { spring } from "../motion";
import { IconButton } from "./IconButton";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function Head({ title, subtitle, leading, onClose }: Pick<OverlayProps, "title" | "subtitle" | "leading" | "onClose">) {
  return (
    <header className="tw-overlay-head">
      {leading}
      <div className="tw-overlay-head__text">
        <h2 className="tw-overlay-title">{title}</h2>
        {subtitle && <p className="tw-overlay-sub">{subtitle}</p>}
      </div>
      <IconButton label="ปิด" variant="soft" size="sm" onClick={onClose}>
        <X size={16} strokeWidth={2.4} />
      </IconButton>
    </header>
  );
}

const Scrim = ({ onClose }: { onClose: () => void }) => (
  <motion.div
    className="tw-scrim"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.25 }}
    onClick={onClose}
  />
);

/** Centered dialog — portalled (glass ancestors create containing blocks for `fixed`). */
export function Dialog({ open, onClose, title, subtitle, leading, footer, children, wide, className }: OverlayProps) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Scrim key="scrim" onClose={onClose} />
          <div key="wrap" className="tw-dialog-wrap">
            <motion.div
              role="dialog"
              aria-modal="true"
              className={clsx("tw-dialog", wide && "tw-dialog--wide", className)}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } }}
              transition={spring.gentle}
            >
              <Head title={title} subtitle={subtitle} leading={leading} onClose={onClose} />
              <div className="tw-overlay-body scroll-y scroll-y--light">{children}</div>
              {footer && <footer className="tw-overlay-foot">{footer}</footer>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Right-side sheet for record details. */
export function Drawer({ open, onClose, title, subtitle, leading, footer, children }: OverlayProps) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <Scrim key="scrim" onClose={onClose} />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            className="tw-drawer"
            initial={{ x: "105%" }}
            animate={{ x: 0 }}
            exit={{ x: "105%", transition: { duration: 0.24, ease: [0.65, 0, 0.35, 1] } }}
            transition={spring.gentle}
          >
            <Head title={title} subtitle={subtitle} leading={leading} onClose={onClose} />
            <div className="tw-overlay-body scroll-y scroll-y--light">{children}</div>
            {footer && <footer className="tw-overlay-foot">{footer}</footer>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
