import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { clsx } from "clsx";
import { spring } from "../design-system";
import { AppointmentsIcon, BillingIcon, VisitIcon, HomeIcon, InsightsIcon, PatientsIcon, PlannerIcon, SettingsIcon } from "../design-system/icons";

const NAV: { to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: "/", label: "หน้าหลัก", Icon: HomeIcon },
  { to: "/visits", label: "รับบริการ", Icon: VisitIcon },
  { to: "/patients", label: "ผู้มารับบริการ", Icon: PatientsIcon },
  { to: "/appointments", label: "ตารางนัด", Icon: AppointmentsIcon },
  { to: "/billing", label: "คิดเงิน", Icon: BillingIcon },
  { to: "/planner", label: "จัดตารางงาน", Icon: PlannerIcon },
  { to: "/insights", label: "ผลการรักษา", Icon: InsightsIcon },
  { to: "/settings", label: "ตั้งค่า", Icon: SettingsIcon },
];

function Tip({ label }: { label: string }) {
  return (
    <motion.span
      className="dock__tip"
      initial={{ opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.16 }}
    >
      {label}
    </motion.span>
  );
}

/** a page can ask the dock to tuck itself away (e.g. while the treatment assistant is open) */
export const DOCK_AUTO = "thaiwell:dock-auto";
let tuckRequested = false; // survives the page asking before the dock is listening
export const tuckDock = (on: boolean) => {
  tuckRequested = on;
  window.dispatchEvent(new CustomEvent<boolean>(DOCK_AUTO, { detail: on }));
};

export function Dock({ onAssistant }: { onAssistant: () => void }) {
  const { pathname } = useLocation();
  const [hover, setHover] = useState<string | null>(null);
  // tucked: a page asked for the room; hidden: what the user currently sees (the arrow toggles it)
  const [tucked, setTucked] = useState(tuckRequested);
  const [hidden, setHidden] = useState(tuckRequested);
  useEffect(() => {
    const apply = (v: boolean) => {
      setTucked(v);
      setHidden(v);
    };
    const on = (e: Event) => apply((e as CustomEvent<boolean>).detail);
    window.addEventListener(DOCK_AUTO, on);
    apply(tuckRequested);
    return () => window.removeEventListener(DOCK_AUTO, on);
  }, []);

  return (
    <div className={clsx("dock-strip", hidden && "is-tucked")}>
      {tucked && (
        <motion.button
          type="button"
          className="dock__handle"
          aria-label={hidden ? "แสดงแถบเมนู" : "ซ่อนแถบเมนู"}
          title={hidden ? "แสดงแถบเมนู" : "ซ่อนแถบเมนู"}
          onClick={() => setHidden((v) => !v)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: hidden ? 0 : -78 }}
          transition={spring.soft}
        >
          {hidden ? <ChevronUp size={18} strokeWidth={2.4} /> : <ChevronDown size={18} strokeWidth={2.4} />}
        </motion.button>
      )}
      <motion.nav
        className="dock"
        aria-label="เมนูหลัก"
        aria-hidden={hidden || undefined}
        initial={{ y: 40, opacity: 0 }}
        animate={hidden ? { y: 130, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={hidden ? spring.soft : { ...spring.soft, delay: tucked ? 0 : 0.25 }}
      >
        <span className="tw-frost" aria-hidden />
        <LayoutGroup>
          {NAV.map(({ to, label, Icon }) => {
            // the requests page is reached from the dashboard, so it stays under "หน้าหลัก"
            const active = to === "/" ? pathname === "/" || pathname.startsWith("/requests") : pathname.startsWith(to);
            return (
              <motion.div
                layout
                transition={spring.soft}
                key={to}
                className={clsx("dock__item", active && "dock__item--active")}
                onHoverStart={() => !active && setHover(to)}
                onHoverEnd={() => setHover(null)}
              >
                <NavLink to={to} aria-label={label} aria-current={active ? "page" : undefined} className="dock__link">
                  {active && <motion.span layoutId="dock-pill" className="dock__pill" transition={spring.soft} />}
                  <motion.span
                    className="dock__glyph"
                    animate={active ? { scale: [0.8, 1.12, 1], rotate: [0, -6, 0] } : { scale: 1, rotate: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Icon />
                  </motion.span>
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span
                        key="label"
                        className="dock__label"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={spring.soft}
                      >
                        <span>{label}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>
                <AnimatePresence>{hover === to && <Tip label={label} />}</AnimatePresence>
              </motion.div>
            );
          })}
          <motion.span layout className="dock__sep" aria-hidden />
          <motion.div layout className="dock__item" onHoverStart={() => setHover("ai")} onHoverEnd={() => setHover(null)}>
            <motion.button
              className="dock__ai"
              aria-label="ผู้ช่วย AI"
              onClick={onAssistant}
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.06 }}
              transition={spring.snappy}
            >
              <span className="ai2__aura" aria-hidden />
              <span className="ai2__ball" aria-hidden>
                <i className="ai2__swirl" />
                <i className="ai2__swirl ai2__swirl--b" />
                <i className="ai2__shine" />
              </span>
              <span className="ai2__star" aria-hidden>
                <svg viewBox="0 0 28 28" width="24" height="24">
                  <g className="ai3__s ai3__s--1" transform="translate(1 6) scale(0.82)">
                    <path d="M12 1.5C12.6 7.4 16.6 11.4 22.5 12 16.6 12.6 12.6 16.6 12 22.5 11.4 16.6 7.4 12.6 1.5 12 7.4 11.4 11.4 7.4 12 1.5Z" fill="currentColor" />
                  </g>
                  <g className="ai3__s ai3__s--2" transform="translate(16 1) scale(0.46)">
                    <path d="M12 1.5C12.6 7.4 16.6 11.4 22.5 12 16.6 12.6 12.6 16.6 12 22.5 11.4 16.6 7.4 12.6 1.5 12 7.4 11.4 11.4 7.4 12 1.5Z" fill="currentColor" />
                  </g>
                  <g className="ai3__s ai3__s--3" transform="translate(18.5 17) scale(0.34)">
                    <path d="M12 1.5C12.6 7.4 16.6 11.4 22.5 12 16.6 12.6 12.6 16.6 12 22.5 11.4 16.6 7.4 12.6 1.5 12 7.4 11.4 11.4 7.4 12 1.5Z" fill="currentColor" />
                  </g>
                </svg>
              </span>
            </motion.button>
            <AnimatePresence>{hover === "ai" && <Tip label="ผู้ช่วย AI" />}</AnimatePresence>
          </motion.div>
        </LayoutGroup>
      </motion.nav>
    </div>
  );
}
