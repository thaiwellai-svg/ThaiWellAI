import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { clsx } from "clsx";
import { spring } from "../motion";

interface ToastInput {
  message: string;
  tone?: "success" | "danger";
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.action ? 5200 : 3200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="tw-toast-stack" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.div
                key={t.id}
                layout
                className="tw-toast"
                initial={{ opacity: 0, y: -16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.94, transition: { duration: 0.18 } }}
                transition={spring.soft}
              >
                <span className={clsx("tw-toast__icon", t.tone === "danger" && "tw-toast__icon--danger")}>
                  {t.tone === "danger" ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}
                </span>
                <span>{t.message}</span>
                {t.action ? (
                  <button
                    className="tw-toast__action"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                ) : (
                  <span className="tw-toast__spacer" />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
