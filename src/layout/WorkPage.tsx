import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { NotificationBell } from "../features/Notifications";
import { fadeUp, stagger } from "../design-system";

interface WorkPageProps {
  eyebrow: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  /** show the notification bell in the header (default true) */
  bell?: boolean;
  /** custom left side of the header (replaces eyebrow + title) */
  lead?: ReactNode;
  children: ReactNode;
}

/** Scaffold for every non-dashboard page: blurred spa backdrop, white title, glass actions. */
export function WorkPage({ eyebrow, title, actions, toolbar, bell = true, lead, children }: WorkPageProps) {
  return (
    <motion.div className="work" variants={stagger(0.04, 0.06)} initial="hidden" animate="show">
      <motion.header className="work__head" variants={fadeUp}>
        {lead ?? (
          <div className="work__titles">
            <div className="work__eyebrow">{eyebrow}</div>
            <h1 className="work__title">{title}</h1>
          </div>
        )}
        <div className="work__actions">
          {actions}
          {bell && <NotificationBell />}
        </div>
      </motion.header>
      {toolbar && <motion.div variants={fadeUp}>{toolbar}</motion.div>}
      <motion.div className="work__body" variants={fadeUp}>
        {children}
      </motion.div>
    </motion.div>
  );
}
