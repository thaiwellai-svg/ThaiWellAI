import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { QrCode, CalendarCheck2, ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus, SearchX, X } from "lucide-react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store/store";
import { AnimatedNumber, Avatar, Card, IconButton, EmptyState, SearchField, fadeUp, listItem, spring } from "../../design-system";
import { CheckinQr } from "../../features/CheckinQr";
import { blocksOn, jobRank, stageOf, STATUS_META } from "../../data/domain";
import { TH_WEEKDAYS_SHORT, addISODays, baht, fromISODate, startOfWeek, thaiDateLong, thaiMonthYear, toISODate, todayISO } from "../../data/thaiDate";
import { therapistPhoto } from "../../data/avatars";
import type { AppointmentStatus, BookingRequest } from "../../data/types";
import { AppointmentCard, RequestCard } from "../../features/RecordCards";
import { ApproveDialog, RejectDialog } from "../../features/RequestDialogs";
import { Workspace } from "../../features/Workspace";
import { WorkPage } from "../../layout/WorkPage";
import usersIcon from "../../assets/figma/users-outline.svg";
import chevron from "../../assets/figma/chevron-down.svg";
import "./dashboard.css";

const STAT_ORDER: AppointmentStatus[] = ["done", "waiting", "active", "absent"];

type WidgetId = "patients" | "done" | "credits" | "revenue" | "requests" | "staff" | "calendar";
type Size = "half" | "full";
type WidgetLayout = { order: WidgetId[]; hidden: WidgetId[]; size: Partial<Record<WidgetId, Size>> };

const WIDGETS: Record<WidgetId, { label: string; size: Size; sizes: Size[] }> = {
  patients: { label: "ผู้มารับบริการวันนี้", size: "full", sizes: ["full"] },
  done: { label: "นัดหมายที่เสร็จสิ้น", size: "half", sizes: ["half", "full"] },
  credits: { label: "เครดิตคงเหลือ", size: "half", sizes: ["half", "full"] },
  revenue: { label: "รายได้วันนี้", size: "full", sizes: ["half", "full"] },
  requests: { label: "คำขอจองคิวใหม่", size: "full", sizes: ["full"] },
  staff: { label: "ผู้บำบัดวันนี้", size: "full", sizes: ["full"] },
  calendar: { label: "ตารางงาน", size: "full", sizes: ["full"] },
};
const ALL = Object.keys(WIDGETS) as WidgetId[];
const DEFAULT_WIDGETS: WidgetLayout = { order: ["patients", "done", "credits", "revenue", "calendar", "requests", "staff"], hidden: ["staff"], size: {} };
const WKEY = "thaiwell.dash.widgets";

function useWidgetLayout() {
  const [w, setW] = useState<WidgetLayout>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(WKEY) ?? "null") as WidgetLayout | null;
      if (!s) return DEFAULT_WIDGETS;
      const order = [...s.order.filter((id) => ALL.includes(id)), ...ALL.filter((id) => !s.order.includes(id))];
      return { order, hidden: s.hidden.filter((id) => ALL.includes(id)), size: s.size ?? {} };
    } catch {
      return DEFAULT_WIDGETS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(WKEY, JSON.stringify(w));
    } catch {
      /* ignore */
    }
  }, [w]);
  return [w, setW] as const;
}

export default function Dashboard() {
  const store = useStore();
  const today = todayISO();
  const [qrOpen, setQrOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState<BookingRequest | null>(null);
  const [rejecting, setRejecting] = useState<BookingRequest | null>(null);
  const navigate = useNavigate();
  const [wl, setWl] = useWidgetLayout();

  const todays = useMemo(
    () => store.appointments.filter((a) => a.date === today && a.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start)),
    [store.appointments, today],
  );

  const kpi = useMemo(() => {
    const count = (s: AppointmentStatus) => todays.filter((a) => a.status === s).length;
    const booked = todays.filter((a) => a.type === "booked");
    const bookedDone = booked.filter((a) => a.status === "done").length;
    const billable = todays.filter((a) => a.status !== "absent");
    const revenue = billable.reduce((s, a) => s + store.serviceById(a.serviceId).price, 0);
    const paid = billable.filter((a) => a.paid).reduce((s, a) => s + store.serviceById(a.serviceId).price, 0);
    const credits = store.patients.reduce((s, p) => s + (p.course ? Math.max(0, p.course.total - p.course.used) : 0), 0);
    const coursed = store.patients.filter((p) => p.course);
    const lowCredit = coursed.filter((p) => p.course!.total - p.course!.used <= 1).length;
    return {
      total: todays.length,
      booked: booked.length,
      walkin: todays.length - booked.length,
      bookedDone,
      pct: booked.length ? Math.round((bookedDone / booked.length) * 100) : 0,
      byStatus: Object.fromEntries(STAT_ORDER.map((s) => [s, count(s)])) as Record<AppointmentStatus, number>,
      revenue,
      paid,
      credits,
      coursed: coursed.length,
      lowCredit,
    };
  }, [todays, store]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todays
      .filter((a) => {
        if (statusFilter && a.status !== statusFilter) return false;
        if (!q) return true;
        const p = store.patientById(a.patientId);
        const hay = `${p.name} ${p.hn} ${store.serviceById(a.serviceId).name} ${store.therapistById(a.therapistId).name} ${a.start}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => jobRank(a) - jobRank(b) || a.start.localeCompare(b.start));
  }, [todays, query, statusFilter, store]);

  const deck = expanded ? store.requests : store.requests.slice(0, 3).reverse();

  const widget = (id: WidgetId): ReactNode => {
    switch (id) {
      case "patients":
        return (
          <Card elevated>
            <div className="kpi__head">
              <p className="tw-label">จำนวนผู้มารับบริการวันนี้</p>
              <span className="tw-icon-tile">
                <img src={usersIcon} alt="" width={18} height={18} />
              </span>
            </div>
            <div className="tw-figure">
              <span className="tw-figure__value">
                <AnimatedNumber value={kpi.total} />
              </span>
              <span className="tw-figure__unit">ราย</span>
            </div>
            <p className="tw-caption">
              • นัดล่วงหน้า {kpi.booked} ราย • Walk-in {kpi.walkin} ราย
            </p>
            <div className="tw-progress" role="img" aria-label="สัดส่วนสถานะผู้รับบริการ">
              {STAT_ORDER.map((s, i) => (
                <motion.span
                  key={s}
                  className="tw-progress__seg"
                  style={{ background: STATUS_META[s].color, minWidth: kpi.byStatus[s] ? 6 : 0 }}
                  initial={{ scaleX: 0, flexGrow: kpi.byStatus[s] }}
                  animate={{ scaleX: 1, flexGrow: kpi.byStatus[s] }}
                  transition={{ scaleX: { delay: 0.35 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }, flexGrow: spring.soft }}
                />
              ))}
            </div>
            <div className="kpi__stats">
              {STAT_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="kpi__stat"
                  aria-pressed={statusFilter === s}
                  title={`กรองรายการ: ${STATUS_META[s].label}`}
                  onClick={() => setStatusFilter((f) => (f === s ? null : s))}
                >
                  <span className="kpi__stat-value">
                    <AnimatedNumber value={kpi.byStatus[s]} duration={0.7} />
                  </span>
                  <span className="kpi__stat-label">{STATUS_META[s].label}</span>
                </button>
              ))}
            </div>
          </Card>
        );
      case "done":
        return (
          <Card elevated>
            <div className="kpi__head">
              <p className="tw-label">นัดหมายที่เสร็จสิ้น</p>
            </div>
            <div className="tw-figure">
              <span className="tw-figure__value">
                <AnimatedNumber value={kpi.bookedDone} /> / {kpi.booked}
              </span>
              <span className="tw-figure__unit">เคส</span>
            </div>
            <p className="tw-caption">คิดเป็น {kpi.pct}% ของงานนัดหมายวันนี้</p>
          </Card>
        );
      case "credits":
        return (
          <Card elevated>
            <div className="kpi__head">
              <p className="tw-label">เครดิตคงเหลือรวมของผู้ป่วย</p>
            </div>
            <div className="tw-figure">
              <span className="tw-figure__value">
                <AnimatedNumber value={kpi.credits} />
              </span>
              <span className="tw-figure__unit">ครั้ง</span>
            </div>
            <p className="tw-caption">
              • มีคอร์ส {kpi.coursed} คน • ใกล้หมด {kpi.lowCredit} คน
            </p>
          </Card>
        );
      case "revenue": {
        const full = (wl.size.revenue ?? WIDGETS.revenue.size) === "full";
        const text = (
          <>
            <div className="kpi__head">
              <p className="tw-label">รายได้วันนี้ (รวมประมาณการ)</p>
            </div>
            <div className="tw-figure">
              <span className="tw-figure__value">
                <AnimatedNumber value={kpi.revenue} />
              </span>
              <span className="tw-figure__unit">บาท</span>
            </div>
            {full ? (
              <p className="tw-caption wrev__legend">
                <span>
                  <i className="is-paid" /> ชำระแล้ว {baht(kpi.paid)}
                </span>
                <span>
                  <i className="is-owed" /> ค้างชำระ {baht(kpi.revenue - kpi.paid)}
                </span>
              </p>
            ) : (
              <p className="tw-caption">
                • ชำระแล้ว {baht(kpi.paid)} บาท • ค้างชำระ {baht(kpi.revenue - kpi.paid)} บาท
              </p>
            )}
          </>
        );
        return (
          <Card elevated>
            {full ? (
              <div className="wrev">
                <div className="wrev__text">{text}</div>
                <RevenueDonut paid={kpi.paid} total={kpi.revenue} />
              </div>
            ) : (
              text
            )}
          </Card>
        );
      }
      case "calendar":
        return <ScheduleWidget />;
      case "staff": {
        const staff = store.therapists
          .map((t) => ({ t, blocks: blocksOn(t, today), jobs: todays.filter((a) => a.therapistId === t.id) }))
          .filter((x) => x.blocks.length);
        return (
          <Card elevated className="wstaff">
            <div className="kpi__head">
              <p className="tw-label">ผู้บำบัดเข้างานวันนี้</p>
              <span className="wstaff__count">{staff.length} คน</span>
            </div>
            <div className="wstaff__list">
              {staff.map(({ t, blocks, jobs }) => {
                const busy = jobs.some((a) => stageOf(a) === "treating");
                return (
                  <div key={t.id} className="wstaff__row">
                    <Avatar name={t.name} src={therapistPhoto(t)} color={t.color} size="sm" ring={busy ? "var(--status-active)" : undefined} pulse={busy} />
                    <span className="wstaff__who">
                      <b>{t.name}</b>
                      <small>{blocks.map((b) => `${b.start}–${b.end}`).join(" · ")}</small>
                    </span>
                    <span className={clsx("wstaff__jobs", busy && "is-busy")}>{busy ? "กำลังให้บริการ" : `${jobs.filter((a) => a.status !== "done").length} คิว`}</span>
                  </div>
                );
              })}
              {staff.length === 0 && <p className="tw-caption">วันนี้ไม่มีผู้บำบัดเข้างาน</p>}
            </div>
          </Card>
        );
      }
      case "requests":
        return (
          <section className="pending" aria-labelledby="pending-title">
            <div className="pending__head">
              <h2 id="pending-title" className="pending__title">
                คำขอจองคิวใหม่ (รออนุมัติ)
              </h2>
              <motion.span key={store.requests.length} className="pending__count" initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={spring.snappy}>
                {store.requests.length}
              </motion.span>
              <Link className="pending__more" to="/requests">
                ดูทั้งหมด
              </Link>
            </div>

            {store.requests.length === 0 ? (
              <EmptyState icon={<CalendarCheck2 size={24} />} title="ไม่มีคำขอค้างอนุมัติ" description="คำขอใหม่จากแอป ThaiWell AI จะแสดงที่นี่" />
            ) : (
              <LayoutGroup id="deck">
                <div className={clsx("deck", expanded ? "deck--list" : "deck--stacked")}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {deck.map((r) => {
                      const depth = expanded ? 0 : deck.length - 1 - deck.indexOf(r); // 0 = front
                      const inset = depth * 16;
                      return (
                        <motion.div
                          key={r.id}
                          layout
                          className="deck__card"
                          variants={listItem}
                          initial="hidden"
                          animate={{ opacity: depth === 0 ? 1 : depth === 1 ? 0.85 : 0.6, y: 0, scale: 1 }}
                          exit="exit"
                          transition={spring.soft}
                          style={{
                            marginTop: expanded ? 0 : (deck.length - 1 - depth) * 12,
                            marginInline: inset,
                            pointerEvents: depth === 0 ? "auto" : "none",
                            zIndex: 3 - depth,
                          }}
                        >
                          <RequestCard req={r} inert={depth > 0} elevated={depth === 1} onApprove={() => setApproving(r)} onReject={() => setRejecting(r)} />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {store.requests.length > 1 && (
                    <motion.button
                      layout="position"
                      className="deck__toggle"
                      aria-expanded={expanded}
                      aria-label={expanded ? "ย่อรายการคำขอ" : `กางคำขอทั้งหมด ${store.requests.length} รายการ`}
                      title={expanded ? "ย่อรายการ" : "กางรายการ"}
                      onClick={() => setExpanded((e) => !e)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      transition={spring.snappy}
                    >
                      <motion.img src={chevron} alt="" animate={{ rotate: expanded ? 180 : 0 }} transition={spring.snappy} />
                    </motion.button>
                  )}
                </div>
              </LayoutGroup>
            )}
          </section>
        );
    }
  };

  const jobs = (
    <section className="dash__pane" aria-labelledby="today-title">
      <div className="dash__scroll scroll-y">
        <div className="today">
          <div className="today__head">
            <h2 id="today-title" className="tw-section-title">
              รายการงานวันนี้
            </h2>
            <AnimatePresence>
              {statusFilter && (
                <motion.button
                  className="today__filter"
                  initial={{ opacity: 0, scale: 0.8, x: -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setStatusFilter(null)}
                  aria-label="ล้างตัวกรองสถานะ"
                >
                  <i style={{ background: STATUS_META[statusFilter].color }} />
                  {STATUS_META[statusFilter].label}
                  <X size={12} strokeWidth={2.6} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            {visible.flatMap((a, i) => {
              const r = jobRank(a);
              const head =
                r >= 2 && (i === 0 || jobRank(visible[i - 1]) !== r) ? (
                  <motion.p key={`h${r}`} layout className="jobs__divider">
                    {r === 2 ? "เกินเวลา / ไม่มา" : "เสร็จแล้ว"}
                  </motion.p>
                ) : null;
              return [
                head,
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  layout
                  variants={listItem}
                  exit="exit"
                  transition={spring.soft}
                  onClick={() => navigate(`/visits?id=${a.id}`)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(`/visits?id=${a.id}`)}
                />,
              ];
            })}
          </AnimatePresence>
          {visible.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState onGlass icon={<SearchX size={24} />} title="ไม่พบรายการ" description="ลองค้นหาด้วยชื่อ HN หรือชื่อผู้บำบัด" />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <>
    <CheckinQr open={qrOpen} onClose={() => setQrOpen(false)} />
    <WorkPage
      eyebrow=""
      title=""
      lead={
        <div className="greet">
          <Avatar name={store.settings.staffName} size="lg" variant="glass" />
          <div className="greet__text">
            <p className="greet__hello">สวัสดีค่ะ,</p>
            <p className="greet__name">{store.settings.staffName}</p>
          </div>
        </div>
      }
      actions={
        <>
          {/* เปิด QR เช็กอินให้ผู้ป่วยสแกนรับคิวได้ทันทีจากหน้าแรก */}
          <IconButton label="QR เช็กอิน" title="QR เช็กอิน" onClick={() => setQrOpen(true)}>
            <QrCode size={20} />
          </IconButton>
          <SearchField className="phead-search" value={query} onChange={setQuery} />
        </>
      }
    >
      <Workspace
        storageKey="thaiwell.dash.layout"
        className="dash"
        flexMin={0}
        panes={[
          { id: "widgets", width: 418, min: 340, max: 560, node: (editing) => <WidgetBoard layout={wl} setLayout={setWl} editing={editing} render={widget} /> },
          { id: "room", locked: true, ghost: true, node: null },
          { id: "jobs", width: 418, min: 340, max: 600, node: jobs },
        ]}
      />

      <ApproveDialog request={approving} onClose={() => setApproving(null)} />
      <RejectDialog request={rejecting} onClose={() => setRejecting(null)} />
    </WorkPage>
    </>
  );
}

/** widget column — in edit mode (pane focused via •••) widgets can be dragged, resized, hidden and added back */
function WidgetBoard({
  layout,
  setLayout,
  editing,
  render,
}: {
  layout: WidgetLayout;
  setLayout: (fn: (l: WidgetLayout) => WidgetLayout) => void;
  editing: boolean;
  render: (id: WidgetId) => ReactNode;
}) {
  const refs = useRef<Partial<Record<WidgetId, HTMLDivElement | null>>>({});
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const shown = layout.order.filter((id) => !layout.hidden.includes(id));
  const hidden = layout.order.filter((id) => layout.hidden.includes(id));
  const sizeOf = (id: WidgetId) => layout.size[id] ?? WIDGETS[id].size;

  const moveOver = (id: WidgetId, x: number, y: number) => {
    for (const other of shown) {
      if (other === id) continue;
      const r = refs.current[other]?.getBoundingClientRect();
      if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      setLayout((l) => {
        const o = l.order.filter((k) => k !== id);
        o.splice(o.indexOf(other) + (l.order.indexOf(id) < l.order.indexOf(other) ? 1 : 0), 0, id);
        return { ...l, order: o };
      });
      return;
    }
  };

  return (
    <div className={clsx("dash__pane wboard", editing && "is-editing")}>
      <motion.div className="dash__scroll scroll-y" layoutScroll>
        <div className="wboard__grid">
          {shown.map((id) => (
            <motion.div
              key={id}
              ref={(el) => {
                refs.current[id] = el;
              }}
              layout
              className={clsx("wg", sizeOf(id) === "half" ? "is-half" : "is-full", dragId === id && "is-drag")}
              variants={fadeUp}
              drag={editing}
              dragSnapToOrigin
              dragElastic={1}
              dragMomentum={false}
              onDragStart={() => setDragId(id)}
              onDrag={(_, info) => moveOver(id, info.point.x - window.scrollX, info.point.y - window.scrollY)}
              onDragEnd={() => setDragId(null)}
              whileDrag={{ scale: 1.03, zIndex: 20 }}
              transition={spring.soft}
            >
              {render(id)}
              <AnimatePresence>
                {editing && (
                  <motion.div className="wg__edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button
                      type="button"
                      className="wg__btn wg__btn--hide"
                      aria-label={`ซ่อน ${WIDGETS[id].label}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setLayout((l) => ({ ...l, hidden: [...l.hidden, id] }))}
                    >
                      <Minus size={14} strokeWidth={3} />
                    </button>
                    {WIDGETS[id].sizes.length > 1 && (
                      <button
                        type="button"
                        className="wg__btn wg__btn--size"
                        aria-label={sizeOf(id) === "half" ? "ขยายเต็มแถว" : "ย่อครึ่งแถว"}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setLayout((l) => ({ ...l, size: { ...l.size, [id]: sizeOf(id) === "half" ? "full" : "half" } }))}
                      >
                        {sizeOf(id) === "half" ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        <AnimatePresence>
          {editing && (
            <motion.div className="wboard__add" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
              <p>{hidden.length ? "เพิ่มวิดเจ็ต" : "แสดงวิดเจ็ตครบแล้ว · ลากเพื่อจัดลำดับ"}</p>
              {hidden.length > 0 && (
                <div className="wboard__chips">
                  {hidden.map((id) => (
                    <button key={id} type="button" onClick={() => setLayout((l) => ({ ...l, hidden: l.hidden.filter((k) => k !== id) }))}>
                      <Plus size={14} /> {WIDGETS[id].label}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="wboard__reset" onClick={() => setLayout(() => DEFAULT_WIDGETS)}>
                คืนค่าวิดเจ็ตเริ่มต้น
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** paid vs outstanding — two gradient arcs with a gap, % paid in a raised centre */
function RevenueDonut({ paid, total }: { paid: number; total: number }) {
  const pct = total ? paid / total : 0;
  const S = 104;
  const R = 40;
  const W = 12;
  // round caps add W/2 at each end, so trim arcs (in pathLength units) to keep a clean gap
  const cap = ((W / 2) / (2 * Math.PI * R)) * 100;
  const gap = 2.5;
  const whole = pct === 0 || pct === 1;
  const paidLen = whole ? pct * 100 : Math.max(0.01, pct * 100 - gap - cap * 2);
  const owedLen = whole ? (1 - pct) * 100 : Math.max(0.01, (1 - pct) * 100 - gap - cap * 2);
  const ease = [0.22, 1, 0.36, 1] as const;
  const arc = (len: number, start: number, cls: string, delay: number) => (
    <motion.circle
      cx={S / 2}
      cy={S / 2}
      r={R}
      pathLength={100}
      className={cls}
      initial={{ strokeDasharray: `0 100`, strokeDashoffset: -start }}
      animate={{ strokeDasharray: `${len} ${100 - len}`, strokeDashoffset: -start }}
      transition={{ delay, duration: 1, ease }}
    />
  );
  return (
    <div className="wrev__donut" role="img" aria-label={`ชำระแล้ว ${Math.round(pct * 100)}%`}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <defs>
          <linearGradient id="wrev-paid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8fd3a4" />
            <stop offset="100%" stopColor="#3f7d55" />
          </linearGradient>
          <linearGradient id="wrev-owed" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd9a3" />
            <stop offset="100%" stopColor="#efa65a" />
          </linearGradient>
        </defs>
        <circle cx={S / 2} cy={S / 2} r={R} className="wrev__track" />
        {pct > 0 && arc(paidLen, whole ? 0 : cap + gap / 2, "wrev__paid", 0.3)}
        {pct < 1 && arc(owedLen, whole ? 0 : pct * 100 + cap + gap / 2, "wrev__owed", 0.5)}
      </svg>
      <span className="wrev__pct">
        <b>
          <AnimatedNumber value={Math.round(pct * 100)} />
          <i>%</i>
        </b>
        <small>ชำระแล้ว</small>
      </span>
    </div>
  );
}

/** week strip with a per-day load bar; tap a day to see its timeline */
function ScheduleWidget() {
  const store = useStore();
  const navigate = useNavigate();
  const today = todayISO();
  const [day, setDay] = useState(today);
  const [week, setWeek] = useState(() => toISODate(startOfWeek(new Date())));
  const days = Array.from({ length: 7 }, (_, i) => addISODays(week, i));
  const live = store.appointments.filter((a) => a.status !== "cancelled");
  const countOn = (d: string) => live.filter((a) => a.date === d).length;
  const max = Math.max(1, ...days.map(countOn));
  // today: unfinished first (same order as today's job list); other days: by time
  const list = live.filter((a) => a.date === day).sort((a, b) => (day === today ? jobRank(a) - jobRank(b) : 0) || a.start.localeCompare(b.start));
  const shift = (n: number) => {
    const w = addISODays(week, n * 7);
    setWeek(w);
    setDay(n === 0 ? today : w);
  };

  return (
    <Card elevated className="wcal">
      <div className="kpi__head">
        <p className="tw-label">ตารางงาน · {thaiMonthYear(fromISODate(day))}</p>
        <span className="wcal__nav">
          <button type="button" aria-label="สัปดาห์ก่อน" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </button>
          {!days.includes(today) && (
            <button type="button" className="wcal__today" onClick={() => shift(0)}>
              วันนี้
            </button>
          )}
          <button type="button" aria-label="สัปดาห์ถัดไป" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </button>
        </span>
      </div>

      <div className="wcal__week">
        {days.map((d) => {
          const n = countOn(d);
          const dt = fromISODate(d);
          return (
            <button key={d} type="button" className={clsx("wcal__day", d === today && "is-today")} aria-pressed={d === day} onClick={() => setDay(d)}>
              {d === day && <motion.span layoutId="wcal-sel" className="wcal__sel" transition={spring.snappy} />}
              <small>{TH_WEEKDAYS_SHORT[dt.getDay()]}</small>
              <b>{dt.getDate()}</b>
              <span className="wcal__load">
                <motion.i initial={false} animate={{ height: `${Math.max(n ? 18 : 0, (n / max) * 100)}%` }} transition={spring.soft} />
              </span>
              <em>{n || "–"}</em>
            </button>
          );
        })}
      </div>

      <div className="wcal__list">
        <p className="wcal__date">
          {thaiDateLong(day)} · {list.length} นัด
        </p>
        <AnimatePresence mode="popLayout" initial={false}>
          {list.slice(0, 4).map((a) => {
            const p = store.patientById(a.patientId);
            const t = store.therapistById(a.therapistId);
            return (
              <motion.button
                key={a.id}
                type="button"
                className="wcal__item"
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => navigate(`/visits?id=${a.id}`)}
              >
                <span className="wcal__time">{a.start}</span>
                <i className="wcal__bar" style={{ background: t.color }} />
                <span className="wcal__who">
                  <b>{p.name}</b>
                  <small>
                    {store.serviceById(a.serviceId).short} · {t.name}
                  </small>
                </span>
                <i className="wcal__dot" style={{ background: STATUS_META[a.status].color }} title={STATUS_META[a.status].label} />
              </motion.button>
            );
          })}
        </AnimatePresence>
        {list.length === 0 && <p className="tw-caption">ไม่มีนัดในวันนี้</p>}
        <button type="button" className="wcal__more" onClick={() => navigate(`/appointments?date=${day}`)}>
          {list.length > 4 ? `ดูอีก ${list.length - 4} นัดในตารางนัด` : "เปิดตารางนัด"}
          <ChevronRight size={14} />
        </button>
      </div>
    </Card>
  );
}
