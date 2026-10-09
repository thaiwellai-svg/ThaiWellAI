import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck2, CalendarClock, ChevronDown, TriangleAlert, CalendarDays, CalendarPlus, Phone, ChevronLeft, ChevronRight, CircleCheck, Clock3, PlayCircle, UserX } from "lucide-react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, IconButton, SearchField, Segmented, ease } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { FilterMenu } from "../../features/FilterMenu";
import { BookDialog } from "../../features/BookDialog";
import { WaitlistCard } from "../../features/Waitlist";
import type { WaitEntry } from "../../data/biz";
import type { BookPreset, BookSlot } from "../../features/BookDialog";
import { Plus } from "lucide-react";
import { STATUS_META, requestConflicts } from "../../data/domain";
import { slotTimes } from "../../data/seed";
import type { Appointment, AppointmentStatus } from "../../data/types";
import {
  TH_MONTHS_SHORT,
  TH_WEEKDAYS,
  TH_WEEKDAYS_SHORT,
  addDays,
  fromISODate,
  fromMinutes,
  thaiDateLong,
  thaiDateShort,
  timeAgo,
  thaiMonthYear,
  toISODate,
  toMinutes,
  todayISO,
  startOfWeek,
} from "../../data/thaiDate";
import { patientPhoto, therapistPhoto } from "../../data/avatars";

const bareName = (n: string) => n.replace(/^(นาย|นางสาว|นาง)\s*/, "");
import { CalendarSmallIcon, ClockIcon } from "../../design-system/icons";
import "../../features/cards.css";
import "./appointments.css";

type View = "day" | "week";
type StatusFilter = "all" | AppointmentStatus;
const STATUSES: AppointmentStatus[] = ["waiting", "active", "done", "absent"];
const STATUS_ICON = { all: CalendarDays, waiting: Clock3, active: PlayCircle, done: CircleCheck, absent: UserX, cancelled: UserX };

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/* ── Left rail: mini month ─────────────────────────────────── */
function MiniMonth({ value, onChange, load }: { value: string; onChange: (d: string) => void; load: (d: string) => number }) {
  const { settings } = useStore();
  const [month, setMonth] = useState(() => {
    const d = fromISODate(value);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  useEffect(() => {
    const d = fromISODate(value);
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const start = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = todayISO();
  return (
    <div className="mm">
      <div className="mm__head">
        <b>{thaiMonthYear(month)}</b>
        <IconButton label="เดือนก่อน" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="เดือนถัดไป" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
      <div className="mm__grid">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <span key={d} className="mm__dow">
            {TH_WEEKDAYS_SHORT[d]}
          </span>
        ))}
        {days.map((d) => {
          const iso = toISODate(d);
          const out = d.getMonth() !== month.getMonth();
          const closed = settings.closedWeekdays.includes(d.getDay());
          const l = load(iso);
          return (
            <button
              key={iso}
              type="button"
              className={clsx("mm__day", out && "mm__day--out", iso === today && "mm__day--today", closed && "mm__day--closed")}
              aria-pressed={iso === value}
              onClick={() => onChange(iso)}
            >
              {iso === value && <motion.span layoutId="mm-sel" className="mm__sel" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="mm__num">{d.getDate()}</span>
              {!closed && l > 0 && (
                <span className="mm__load">
                  <i style={{ width: `${Math.min(1, l) * 100}%`, background: l > 0.85 ? "var(--red-500)" : l > 0.6 ? "var(--amber-300)" : "var(--green-500)" }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Appointments() {
  const store = useStore();
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(() => new URLSearchParams(window.location.search).get("date") ?? todayISO());
  const [status, setStatus] = useState<StatusFilter>("all");
  const [therapist, setTherapist] = useState("all");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const [dir, setDir] = useState(0);
  const [booking, setBooking] = useState<BookPreset | null>(null);
  // booking for someone on the waitlist: once the dialog closes, mark them booked if they got a new appointment
  const waitFor = useRef<{ e: WaitEntry; n: number } | null>(null);
  const bookWait = (e: WaitEntry) => {
    waitFor.current = { e, n: store.appointments.filter((a) => a.patientId === e.patientId).length };
    setBooking({ patientId: e.patientId, serviceId: e.serviceId, type: "booked" });
  };
  useEffect(() => {
    const w = waitFor.current;
    if (booking || !w) return;
    waitFor.current = null;
    if (store.appointments.filter((a) => a.patientId === w.e.patientId).length > w.n)
      store.dispatch({ type: "biz", cat: "นัดหมาย", patientId: w.e.patientId, log: `จัดนัดจากรายการรอคิว · ${store.patientById(w.e.patientId).name}`, update: (b) => ({ ...b, waitlist: b.waitlist.map((x) => (x.id === w.e.id ? { ...x, status: "booked" } : x)) }) });
  }, [booking, store]);
  const [clashOpen, setClashOpen] = useState(false);
  const { settings } = store;

  const capacity = slotTimes(settings.openTime, settings.closeTime, settings.slotMinutes).length * settings.bedsPerSlot;
  const live = useMemo(() => store.appointments.filter((a) => a.status !== "cancelled"), [store.appointments]);
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of live) if (a.status !== "absent") m.set(a.date, (m.get(a.date) ?? 0) + 1);
    return m;
  }, [live]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter((a) => `${store.patientById(a.patientId).name} ${store.patientById(a.patientId).hn}`.toLowerCase().includes(q));
  }, [live, query, store]);

  const range = useMemo(() => {
    if (view === "day") return { from: date, to: date };
    const s = startOfWeek(fromISODate(date));
    return { from: toISODate(s), to: toISODate(addDays(s, 6)) };
  }, [view, date]);
  const inRange = useMemo(
    () => searched.filter((a) => a.date >= range.from && a.date <= range.to && (therapist === "all" || a.therapistId === therapist)),
    [searched, range, therapist],
  );
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, inRange.filter((a) => a.status === s).length])) as Record<AppointmentStatus, number>, [inRange]);
  const shown = useMemo(() => searched.filter((a) => (status === "all" || a.status === status) && (therapist === "all" || a.therapistId === therapist)), [searched, status, therapist]);

  const dayAppts = searched.filter((a) => a.date === date);
  const conflicts = useMemo(
    () => store.requests.map((r) => ({ r, c: requestConflicts(r, store.appointments, settings, store.therapists) })).filter((x) => x.c.length > 0),
    [store.requests, store.appointments, settings],
  );
  const dayCounts = Object.fromEntries(STATUSES.map((s) => [s, dayAppts.filter((a) => a.status === s).length])) as Record<AppointmentStatus, number>;
  const dayLoad = Math.round(((perDay.get(date) ?? 0) / capacity) * 100);

  const go = (d: string, direction = 0) => {
    setDir(direction);
    setDate(d);
  };
  const shift = (n: number) => go(toISODate(addDays(fromISODate(date), view === "day" ? n : 7 * n)), n);

  const title =
    view === "day"
      ? thaiDateLong(date)
      : (() => {
          const a = fromISODate(range.from);
          const b = fromISODate(range.to);
          return `${a.getDate()} ${TH_MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${TH_MONTHS_SHORT[b.getMonth()]} ${b.getFullYear() + 543}`;
        })();

  return (
    <WorkPage
      eyebrow="ตารางนัด"
      title="ตารางนัด"
      bell={false}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นหาชื่อ / HN" />
          <FilterMenu
            label="สถานะ"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all" as StatusFilter, label: "ทุกสถานะ", count: inRange.length, icon: STATUS_ICON.all },
              ...STATUSES.map((s) => ({ value: s as StatusFilter, label: STATUS_META[s].label, count: counts[s], icon: STATUS_ICON[s] })),
            ]}
          />
          <IconButton label="เพิ่มคิวนัด" variant="white" className="padd-btn" onClick={() => setBooking({})}>
            <CalendarPlus size={20} strokeWidth={1.8} />
          </IconButton>
        </>
      }
    >
      <div className="appt">
        {/* left rail */}
        <aside className="appt__rail scroll-y">
          <div className="rail-card">
            <MiniMonth value={date} onChange={(d) => go(d, d > date ? 1 : -1)} load={(d) => (perDay.get(d) ?? 0) / capacity} />
          </div>

          <div className="rail-card">
            <div className="rail-card__head">
              <b>{date === todayISO() ? "วันนี้" : thaiDateLong(date)}</b>
              <span className="tw-caption">ใช้เตียง {dayLoad}%</span>
            </div>
            <div className="rail-stats">
              {STATUSES.map((s) => {
                const Ic = STATUS_ICON[s];
                return (
                  <button key={s} type="button" className="rail-stat" aria-pressed={status === s} onClick={() => setStatus(status === s ? "all" : s)}>
                    <span className="rail-stat__icon" style={{ color: STATUS_META[s].color }}>
                      <Ic size={16} strokeWidth={2} />
                    </span>
                    <span className="rail-stat__label">{STATUS_META[s].label}</span>
                    <b>{dayCounts[s]}</b>
                  </button>
                );
              })}
            </div>
          </div>

          <WaitlistCard date={date} onBook={bookWait} />

          <div className="rail-card">
            <div className="rail-card__head">
              <b>ผู้บำบัด</b>
              {therapist !== "all" && (
                <button className="rail-clear" onClick={() => setTherapist("all")}>
                  ดูทั้งหมด
                </button>
              )}
            </div>
            <div className="rail-people">
              {store.therapists.map((t) => {
                const n = dayAppts.filter((a) => a.therapistId === t.id).length;
                return (
                  <button key={t.id} type="button" className="rail-person" aria-pressed={therapist === t.id} onClick={() => setTherapist(therapist === t.id ? "all" : t.id)}>
                    <Avatar name={t.name} src={therapistPhoto(t)} size="sm" color={t.color} />
                    <span className="rail-person__name">
                      {t.name}
                      <small>{t.role}</small>
                    </span>
                    <Badge tone="neutral" compact>
                      {n} นัด
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
          {conflicts.length > 0 && (
            <section className="pending clash-panel" aria-label="ต้องโทรยืนยัน">
              <div className="pending__head">
                <h2 className="pending__title">ต้องโทรยืนยัน</h2>
                <span className="pending__count">{conflicts.length}</span>
              </div>
              <div className={clsx("deck clash-list", !clashOpen && conflicts.length > 1 && "clash-list--stacked")}>
                {(clashOpen ? conflicts : conflicts.slice(0, 3)).map(({ r, c }, i) => {
                  const p = store.patientById(r.patientId);
                  const depth = clashOpen ? 0 : i;
                  return (
                    <motion.div
                      key={r.id}
                      layout
                      className="tw-card pcard clash"
                      aria-hidden={depth > 0 || undefined}
                      transition={{ type: "spring", stiffness: 300, damping: 32 }}
                      style={{
                        zIndex: 3 - depth,
                        marginInline: depth * 12,
                        // back cards peek out above the front one, like the dashboard deck
                        marginTop: clashOpen ? 0 : (Math.min(conflicts.length, 3) - 1 - depth) * 12,
                        opacity: depth === 0 ? 1 : depth === 1 ? 0.85 : 0.6,
                        pointerEvents: depth > 0 ? "none" : undefined,
                      }}
                    >
                      <div className="pcard__head">
                        <Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" />
                        <div className="pcard__id">
                          <p className="pcard__name">{p.name}</p>
                          <p className="pcard__sub">จากแอป ThaiWell · {timeAgo(r.submittedAt)}</p>
                        </div>
                      </div>
                      <div className="pcard__strip">
                        <span className="pcard__when">
                          <CalendarSmallIcon />
                          <b>{thaiDateShort(r.date, true)}</b>
                          <ClockIcon />
                          <b>
                            {r.start}–{fromMinutes(toMinutes(r.start) + store.serviceById(r.serviceId).minutes)}
                          </b>
                        </span>
                      </div>
                      <p className="pcard__line">
                        {store.serviceById(r.serviceId).name} · {store.therapistById(r.therapistId).name}
                      </p>
                      <div className="clash__tags">
                        {c.map((x) => (
                          <Badge key={x.kind} tone={x.kind === "double" ? "warning" : "danger"} compact>
                            <TriangleAlert size={10} strokeWidth={2.6} />
                            {x.label}
                          </Badge>
                        ))}
                      </div>
                      <div className="pcard__actions">
                        {p.phone && (
                          <Button variant="outline" size="md" fill leading={<Phone size={14} />} onClick={() => (window.location.href = `tel:${p.phone.replace(/-/g, "")}`)}>
                            โทร
                          </Button>
                        )}
                        <Button
                          size="md"
                          fill
                          leading={<CalendarClock size={14} />}
                          onClick={() => setBooking({ requestId: r.id, patientId: r.patientId, serviceId: r.serviceId, therapistId: r.therapistId })}
                        >
                          จัดเวลาใหม่
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
                {conflicts.length > 1 && (
                  <motion.button
                    layout="position"
                    className="deck__toggle clash-toggle"
                    aria-expanded={clashOpen}
                    aria-label={clashOpen ? "ย่อ" : `ดูทั้งหมด ${conflicts.length} คำขอ`}
                    onClick={() => setClashOpen((o) => !o)}
                    whileTap={{ scale: 0.92 }}
                  >
                    <motion.span style={{ display: "grid" }} animate={{ rotate: clashOpen ? 180 : 0 }}>
                      <ChevronDown size={16} />
                    </motion.span>
                  </motion.button>
                )}
              </div>
            </section>
          )}
        </aside>

        {/* main calendar */}
        <div className="panel appt__main">
          <div className="sheet">
            <div className="appt__bar">
              <div className="appt__nav">
                <IconButton label="ก่อนหน้า" variant="soft" size="sm" onClick={() => shift(-1)}>
                  <ChevronLeft size={16} />
                </IconButton>
                <IconButton label="ถัดไป" variant="soft" size="sm" onClick={() => shift(1)}>
                  <ChevronRight size={16} />
                </IconButton>
                <h2 className="appt__title">{title}</h2>
                {date !== todayISO() && (
                  <Button variant="outline" size="sm" leading={<CalendarCheck2 size={14} />} onClick={() => go(todayISO(), 0)}>
                    วันนี้
                  </Button>
                )}
              </div>
              <Segmented
                tone="light"
                label="มุมมอง"
                value={view}
                onChange={(v) => {
                  setDir(0);
                  setView(v);
                }}
                options={[
                  { value: "day", label: "วัน" },
                  { value: "week", label: "สัปดาห์" },
                ]}
              />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${view}-${range.from}`}
                className="cal scroll-y scroll-y--light"
                initial={{ opacity: 0, x: dir * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -28 }}
                transition={{ duration: 0.3, ease: ease.out }}
              >
                {view === "week" ? (
                  <WeekView from={range.from} appts={shown} onOpenDay={(d) => { go(d, 0); setView("day"); }} onBook={(slot: BookSlot) => setBooking({ slot })} />
                ) : (
                  <DayView date={date} appts={shown} therapistFilter={therapist} onOpen={(id: string) => navigate(`/appointments/${id}`)} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <BookDialog
        preset={booking}
        onClose={() => setBooking(null)}
      />
    </WorkPage>
  );
}

/* ── Week ──────────────────────────────────────────────────── */
function WeekView({ from, appts, onOpenDay, onBook }: { from: string; appts: Appointment[]; onOpenDay: (d: string) => void; onBook: (s: BookSlot) => void }) {
  const store = useStore();
  const { settings } = store;
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(fromISODate(from), i)));
  const times = slotTimes(settings.openTime, settings.closeTime, settings.slotMinutes);
  const today = todayISO();
  const byKey = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appts) {
      const k = `${a.date} ${a.start}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [appts]);

  const rows: (string | "lunch")[] = [];
  times.forEach((t) => {
    if (t === "13:00") rows.push("lunch");
    rows.push(t);
  });

  return (
    <div
      className="cal-grid"
      style={{
        gridTemplateColumns: `52px repeat(7, minmax(0, 1fr))`,
        gridTemplateRows: `auto ${rows.map((r) => (r === "lunch" ? "34px" : "124px")).join(" ")}`,
      }}
    >
      <div className="cal-corner" />
      {days.map((d) => {
        const dt = fromISODate(d);
        const closed = settings.closedWeekdays.includes(dt.getDay());
        return (
          <button key={d} className={clsx("cal-head", d === today && "cal-head--today", closed && "cal-head--closed")} onClick={() => onOpenDay(d)}>
            <span className="cal-head__dow">{TH_WEEKDAYS[dt.getDay()]}</span>
            <span className="cal-head__date">
              <span>{dt.getDate()}</span>
            </span>
          </button>
        );
      })}
      {rows.map((r, ri) =>
        r === "lunch" ? (
          <div key={`lunch-${ri}`} style={{ display: "contents" }}>
            <div className="cal-time" style={{ paddingTop: 11 }}>12:00</div>
            <div className="cal-cell cal-cell--lunch" style={{ gridColumn: "2 / -1" }}>
              พักกลางวัน
            </div>
          </div>
        ) : (
          <div key={r} style={{ display: "contents" }}>
            <div className="cal-time">{r}</div>
            {days.map((d, di) => {
              const closed = settings.closedWeekdays.includes(fromISODate(d).getDay());
              const list = byKey.get(`${d} ${r}`) ?? [];
              const past = d < todayISO() || (d === todayISO() && toMinutes(r) + 60 <= new Date().getHours() * 60 + new Date().getMinutes());
              return (
                <div key={d} className={clsx("cal-cell", closed && "cal-cell--closed")}>
                  {!closed && (
                    <motion.button
                      className={clsx("wcell", list.length === 0 && "wcell--empty")}
                      onClick={() => (list.length === 0 && !past ? onBook({ date: d, start: r }) : onOpenDay(d))}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(0.4, di * 0.03 + ri * 0.02), duration: 0.3, ease: ease.out }}
                    >
                      {list.length === 0 ? (
                        past ? (
                          <span className="wcell__free">ว่าง</span>
                        ) : (
                          <span className="wcell__add">
                            <Plus size={16} strokeWidth={2.2} />
                            เพิ่มนัด
                          </span>
                        )
                      ) : (
                        <>
                          <span className="wcell__top">
                            <span className="wcell__count">{list.length}</span>
                            <span className="wcell__cap">/ {settings.bedsPerSlot} เตียง</span>
                          </span>
                          <span className="wcell__names">
                            {list.slice(0, 3).map((a) => (
                              <span key={a.id} className="wcell__name">
                                <i style={{ background: STATUS_META[a.status].color }} />
                                <span>{store.patientById(a.patientId).name.replace(/^(นาย|นางสาว|นาง)\s*/, "")}</span>
                              </span>
                            ))}
                            {list.length > 3 && <span className="wcell__more">+{list.length - 3} คน</span>}
                          </span>
                        </>
                      )}
                    </motion.button>
                  )}
                </div>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}

/* ── Day (therapist resources) ─────────────────────────────── */
const HOUR = 104;

/** Greedy interval-graph lanes: overlapping sessions sit side by side, never on top of each other. */
function layoutLanes(items: { id: string; start: number; end: number }[]) {
  const out = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start);
  let cluster: typeof sorted = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    cluster.forEach((c) => (out.get(c.id)!.lanes = laneEnds.length));
    cluster = [];
    laneEnds = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else laneEnds[lane] = it.end;
    out.set(it.id, { lane, lanes: 1 });
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

function DayView({ date, appts, therapistFilter, onOpen }: { date: string; appts: Appointment[]; therapistFilter: string; onOpen: (id: string) => void }) {
  const store = useStore();
  const { settings } = store;
  const now = useNow();
  const scroller = useRef<HTMLDivElement>(null);
  const open = toMinutes(settings.openTime);
  const close = toMinutes(settings.closeTime);
  const hours = Array.from({ length: Math.ceil((close - open) / 60) }, (_, i) => open + i * 60);
  const height = ((close - open) / 60) * HOUR;
  const therapists = therapistFilter === "all" ? store.therapists : store.therapists.filter((t) => t.id === therapistFilter);
  const dayAppts = appts.filter((a) => a.date === date);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = date === todayISO() && nowMin >= open && nowMin <= close;

  return (
    <div ref={scroller} className="cal-grid" style={{ gridTemplateColumns: `64px repeat(${therapists.length}, minmax(236px, 1fr))` }}>
      <div className="cal-corner" />
      {therapists.map((t) => (
        <div key={t.id} className="cal-head">
          <div className="dhead" style={{ width: "100%" }}>
            <Avatar name={t.name} src={therapistPhoto(t)} size="sm" color={t.color} />
            <div style={{ minWidth: 0 }}>
              <p className="dhead__name">{t.name}</p>
              <p className="dhead__role">{t.role}</p>
            </div>
            <Badge tone="neutral" compact className="dhead__count">
              {dayAppts.filter((a) => a.therapistId === t.id).length} นัด
            </Badge>
          </div>
        </div>
      ))}

      <div className="day-times" style={{ height }}>
        {showNow && (
          <span className="now-line__time" style={{ top: ((nowMin - open) / 60) * HOUR - 9 }}>
            {`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`}
          </span>
        )}
        {hours.map((h) => (
          <div key={h} className="cal-time" style={{ position: "absolute", top: ((h - open) / 60) * HOUR, left: 0, right: 0, height: HOUR, border: 0 }}>
            {`${String(h / 60).padStart(2, "0")}:00`}
          </div>
        ))}
      </div>
      {therapists.map((t, ti) => {
        const mine = dayAppts.filter((a) => a.therapistId === t.id).sort((a, b) => a.start.localeCompare(b.start));
        const lanes = layoutLanes(mine.map((a) => ({ id: a.id, start: toMinutes(a.start), end: toMinutes(a.start) + store.serviceById(a.serviceId).minutes })));
        return (
          <div
            key={t.id}
            className="cal-cell"
            style={{
              height,
              padding: 0,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${HOUR - 1}px, var(--sage-50) ${HOUR - 1}px ${HOUR}px)`,
            }}
          >
            <div className="cal-cell--lunch" style={{ position: "absolute", left: 0, right: 0, top: ((720 - open) / 60) * HOUR, height: HOUR }}>
              พักกลางวัน
            </div>
            {mine.map((a) => {
              const s = store.serviceById(a.serviceId);
              const p = store.patientById(a.patientId);
              const { lane, lanes: n } = lanes.get(a.id)!;
              const top = ((toMinutes(a.start) - open) / 60) * HOUR + 4;
              const h = (s.minutes / 60) * HOUR - 8;
              return (
                <motion.button
                  key={a.id}
                  className={clsx("dblock", `dblock--${a.status}`)}
                  style={{
                    top,
                    height: h,
                    left: `calc(${(lane / n) * 100}% + ${lane ? 3 : 6}px)`,
                    right: `calc(${((n - lane - 1) / n) * 100}% + ${lane === n - 1 ? 6 : 3}px)`,
                    ["--accent" as string]: STATUS_META[a.status].color,
                  }}
                  onClick={() => onOpen(a.id)}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: a.status === "absent" ? 0.55 : 1, scale: 1 }}
                  whileHover={{ y: -2 }}
                  transition={{ delay: ti * 0.04 + lane * 0.02, duration: 0.35, ease: ease.out }}
                >
                  <span className="dblock__top">
                    <span className="dblock__bar" />
                    <span className="dblock__time">
                      {a.start}–{fromMinutes(toMinutes(a.start) + s.minutes)}
                    </span>
                  </span>
                  <span className="dblock__name">{n > 1 ? bareName(p.name) : p.name}</span>
                  <span className="dblock__meta">{n > 1 ? s.short : `${s.name} · ${s.minutes} นาที`}</span>
                  {a.type === "walkin" && <span className="dblock__tag">วอล์กอิน</span>}
                </motion.button>
              );
            })}
          </div>
        );
      })}
      {showNow && (
        <div className="now-track" style={{ gridColumn: "1 / -1", gridRow: 2 }}>
          <div className="now-line now-line--full" style={{ top: ((nowMin - open) / 60) * HOUR }} />
        </div>
      )}
    </div>
  );
}

