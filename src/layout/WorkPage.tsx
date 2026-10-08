import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { NotificationBell } from "../features/Notifications";
import { fadeUp, stagger } from "../design-system";

interface WorkPageProps {
  eyebrow: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /** ปุ่มท้ายสุดของแถบบน (หลังกระดิ่งแจ้งเตือน) */
  trailing?: ReactNode;
  toolbar?: ReactNode;
  /** show the notification bell in the header (default true) */
  bell?: boolean;
  /** custom left side of the header (replaces eyebrow + title) */
  lead?: ReactNode;
  children: ReactNode;
}

/** legacy section names → the standard words (ui guide) so every header reads the same */
const LEGACY: [RegExp, string][] = [
  [/ผู้มารับบริการ|ผู้รับบริการ/g, "ผู้ป่วย"],
  [/คิดเงิน/g, "ชำระเงิน"],
];
const norm = (s: string) => LEGACY.reduce((t, [re, to]) => t.replace(re, to), s).trim();

/** the small label above the page title — dropped when it only repeats the title */
export function eyebrowFor(eyebrow: ReactNode, title: ReactNode): ReactNode {
  if (eyebrow == null || eyebrow === false || eyebrow === "") return null;
  if (typeof eyebrow !== "string") return eyebrow;
  const e = norm(eyebrow);
  if (!e) return null;
  if (typeof title === "string" && norm(title).includes(e)) return null;
  return e;
}

/** page title block: one big title, plus a small context label only when it adds something */
export function PageTitles({ eyebrow, title }: { eyebrow: ReactNode; title: ReactNode }) {
  const eb = eyebrowFor(eyebrow, title);
  return (
    <div className={eb ? "work__titles" : "work__titles work__titles--solo"}>
      {eb && <div className="work__eyebrow">{eb}</div>}
      <h1 className="work__title">{typeof title === "string" ? norm(title) : title}</h1>
    </div>
  );
}

/** Scaffold for every non-dashboard page: blurred spa backdrop, white title, glass actions. */
export function WorkPage({ eyebrow, title, actions, trailing, toolbar, bell = true, lead, children }: WorkPageProps) {
  return (
    <motion.div className="work" variants={stagger(0.04, 0.06)} initial="hidden" animate="show">
      <motion.header className="work__head" variants={fadeUp}>
        {lead ?? <PageTitles eyebrow={eyebrow} title={title} />}
        <div className="work__actions">
          {actions}
          {bell && <NotificationBell />}
          {trailing}
        </div>
      </motion.header>
      {toolbar && <motion.div variants={fadeUp}>{toolbar}</motion.div>}
      <motion.div className="work__body" variants={fadeUp}>
        {children}
      </motion.div>
    </motion.div>
  );
}
