import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BellOff, CalendarClock, CheckCheck, ChevronRight, ClipboardList, TriangleAlert, UserRoundX, UsersRound, X } from "lucide-react";
import { BellIcon } from "../design-system/icons";
import { useStore } from "../store/store";
import { Drawer, IconButton } from "../design-system";
import { timeAgo, todayISO, toISODate } from "../data/thaiDate";
import type { Notification } from "../data/types";
import { useNotificationDetail } from "./NotificationDrawer";
import "./notifications.css";

const KIND: Record<Notification["kind"], { icon: typeof BellOff; label: string }> = {
  request: { icon: CalendarClock, label: "คำขอจอง" },
  alert: { icon: TriangleAlert, label: "คัดกรอง" },
  noshow: { icon: UserRoundX, label: "ไม่มาตามนัด" },
  staff: { icon: UsersRound, label: "เจ้าหน้าที่" },
  info: { icon: ClipboardList, label: "ติดตามผล" },
};


export function NotificationBell() {
  const { notifications, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const unread = unreadCount > 0;

  // newest first, grouped วันนี้ / เมื่อวาน / ก่อนหน้า
  const groups = useMemo(() => {
    const list = [...notifications].sort((a, b) => b.at.localeCompare(a.at));
    const today = todayISO();
    const yesterday = toISODate(new Date(Date.now() - 86_400_000));
    const out: { label: string; items: Notification[] }[] = [];
    for (const n of list) {
      const d = toISODate(new Date(n.at));
      const label = d === today ? "วันนี้" : d === yesterday ? "เมื่อวาน" : "ก่อนหน้า";
      const g = out.find((x) => x.label === label) ?? out[out.push({ label, items: [] }) - 1];
      g.items.push(n);
    }
    return out;
  }, [notifications]);

  const [detail, setDetail] = useState<string | null>(null);
  const go = (n: Notification) => {
    dispatch({ type: "readNotification", id: n.id });
    setDetail(n.id);
  };
  const close = () => {
    setOpen(false);
    window.setTimeout(() => setDetail(null), 300);
  };
  const view = useNotificationDetail(detail, close);

  return (
    <div className="notif" ref={btn}>
      <IconButton label={unread ? `การแจ้งเตือน ${unreadCount} รายการใหม่` : "การแจ้งเตือน"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <motion.span
          style={{ display: "grid", transformOrigin: "50% 12%" }}
          animate={unread ? { rotate: [0, 16, -13, 9, -6, 3, 0] } : { rotate: 0 }}
          transition={unread ? { duration: 0.9, delay: 0.8, repeat: Infinity, repeatDelay: 7, ease: "easeInOut" } : { duration: 0.2 }}
        >
          <BellIcon />
        </motion.span>
        <AnimatePresence>
          {unread && (
            <motion.span
              key="count"
              className="tw-count"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
            >
              {unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </IconButton>

      <Drawer
        open={open}
        onClose={close}
        leading={
          view ? (
            <span className="notif__lead">
              <IconButton label="กลับไปรายการ" variant="soft" size="sm" onClick={() => setDetail(null)}>
                <ArrowLeft size={16} />
              </IconButton>
              {view.leading}
            </span>
          ) : (
            <span className="notif__icon notif__icon--lg">
              <BellIcon />
            </span>
          )
        }
        title={view ? view.title : "การแจ้งเตือน"}
        subtitle={view ? view.subtitle : unread ? `${unreadCount} รายการใหม่` : "อ่านครบแล้ว"}
        footer={view ? view.footer : undefined}
      >
        <AnimatePresence mode="wait" initial={false}>
          {view ? (
            <motion.div key={"d" + detail} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }}>
              {view.body}
            </motion.div>
          ) : (
            <motion.div key="list" className="notif__drawer" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
              {unread && (
                <button type="button" className="notif__readall" onClick={() => dispatch({ type: "readNotifications" })}>
                  <CheckCheck size={15} /> อ่านทั้งหมด
                </button>
              )}
              <div className="notif__list scroll-y scroll-y--light">
                <AnimatePresence initial={false} mode="popLayout">
                  {groups.map((g) => (
                    <motion.section key={g.label} layout className="notif__group">
                      <p className="notif__glabel">{g.label}</p>
                      {g.items.map((n) => {
                        const K = KIND[n.kind] ?? KIND.info;
                        return (
                          <motion.div
                            key={n.id}
                            layout
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
                            className="notif__item"
                            data-unread={!n.read || undefined}
                          >
                            <button type="button" className="notif__main" onClick={() => go(n)}>
                              <span className={`notif__icon notif__icon--${n.kind}`}>
                                <K.icon size={17} strokeWidth={1.9} />
                              </span>
                              <span className="notif__text">
                                <span className="notif__row">
                                  <b>{n.title}</b>
                                  <small>{timeAgo(n.at)}</small>
                                </span>
                                <span className="notif__body">{n.body}</span>
                                <span className="notif__tag">
                                  {K.label} · ดูรายละเอียด
                                  <ChevronRight size={12} />
                                </span>
                              </span>
                            </button>
                            <button type="button" className="notif__x" aria-label="ลบการแจ้งเตือน" onClick={() => dispatch({ type: "dismissNotification", id: n.id })}>
                              <X size={14} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </motion.section>
                  ))}
                </AnimatePresence>
                {groups.length === 0 && (
                  <div className="notif__empty">
                    <span>
                      <BellOff size={22} />
                    </span>
                    <b>ไม่มีการแจ้งเตือน</b>
                    <small>แจ้งเตือนใหม่จะแสดงที่นี่</small>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Drawer>
      {view?.dialogs}
    </div>
  );
}
