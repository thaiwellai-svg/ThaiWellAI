import { useEffect, useMemo, useState } from "react";
import { StaffOverview } from "./StaffOverview";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, ChevronLeft, ChevronRight, Info, Trash2, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, Chip, EmptyState, IconButton, SearchField, Select, listItem, spring, useToast } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { CreditPips } from "../../features/widgets";
import { slotLoad } from "../../features/slotLoad";
import { creditInfo } from "../../data/domain";
import { slotTimes } from "../../data/seed";
import { TH_WEEKDAYS_SHORT, addDays, diffDays, fromISODate, startOfWeek, thaiDateLong, thaiMonthYear, toISODate, todayISO } from "../../data/thaiDate";
import sparkle from "../../assets/figma/ai-sparkle.png";
import { patientPhoto } from "../../data/avatars";
import "./planner.css";

interface Draft {
  date: string;
  start: string;
  therapistId: string;
}

/** จัดตารางงาน — staff work slots only (no patients, no queue status). */
export default function Planner() {
  return <StaffOverview />;
}

/** Course planner for one patient — reached from the patient record (/plan?patient=…). */
export function PatientPlanner() {
  const store = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [onlyCourse, setOnlyCourse] = useState(true);
  const selectedId = params.get("patient") ?? store.patients.find((p) => p.course)?.id ?? store.patients[0]?.id ?? "";
  const patient = store.patientById(selectedId);
  const credits = creditInfo(patient, store.appointments);
  const today = todayISO();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [serviceId, setServiceId] = useState(patient.course?.serviceId ?? "s1");
  const [therapistId, setTherapistId] = useState("t1");

  useEffect(() => {
    setDrafts([]);
    setServiceId(patient.course?.serviceId ?? "s1");
  }, [selectedId, patient.course?.serviceId]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.patients
      .filter((p) => (!onlyCourse || p.course) && (!q || `${p.name} ${p.hn}`.toLowerCase().includes(q)))
      .map((p) => ({ p, c: creditInfo(p, store.appointments) }));
  }, [store.patients, store.appointments, query, onlyCourse]);

  const mine = useMemo(() => store.appointments.filter((a) => a.patientId === patient.id && a.status !== "cancelled"), [store.appointments, patient.id]);
  const capacity = slotTimes(store.settings.openTime, store.settings.closeTime, store.settings.slotMinutes).length * store.settings.bedsPerSlot;
  const remaining = credits ? credits.remaining : Infinity;
  const limitReached = drafts.length >= remaining;
  const minGap = store.settings.minDaysBetweenSessions;

  const dayLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of store.appointments) if (a.status !== "cancelled" && a.status !== "absent") m.set(a.date, (m.get(a.date) ?? 0) + 1);
    return m;
  }, [store.appointments]);

  /** Why a date can't be picked — null when it can. Traceable reasons, surfaced as tooltips. */
  const blocked = (iso: string): string | null => {
    const d = fromISODate(iso);
    if (iso < today) return "วันที่ผ่านมาแล้ว";
    if (store.settings.closedWeekdays.includes(d.getDay())) return "คลินิกปิดทำการ";
    if ((dayLoad.get(iso) ?? 0) >= capacity) return "คิวเต็มทั้งวัน";
    const upcoming = [...mine.filter((a) => a.date >= today && a.status === "waiting").map((a) => a.date), ...drafts.map((x) => x.date)];
    const near = upcoming.find((x) => x !== iso && Math.abs(diffDays(x, iso)) < minGap);
    if (near) return `ห่างจากนัดอื่นน้อยกว่า ${minGap} วัน`;
    if (mine.some((a) => a.date === iso && a.status === "waiting")) return "มีนัดวันนี้อยู่แล้ว";
    return null;
  };

  const firstFreeSlot = (iso: string, prefer?: string) => {
    const slots = slotLoad(store.appointments, iso, store.settings).filter((s) => s.free > 0);
    return (prefer && slots.find((s) => s.time === prefer)?.time) || slots[0]?.time || store.settings.openTime;
  };

  const toggle = (iso: string) => {
    if (drafts.some((d) => d.date === iso)) {
      setDrafts((ds) => ds.filter((d) => d.date !== iso));
      return;
    }
    if (limitReached) {
      toast({ message: `เลือกได้สูงสุด ${remaining} ครั้งตามเครดิตคงเหลือ`, tone: "danger" });
      return;
    }
    const prefer = drafts[drafts.length - 1]?.start ?? "09:00";
    setDrafts((ds) => [...ds, { date: iso, start: firstFreeSlot(iso, prefer), therapistId }].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const suggest = () => {
    const want = Math.min(remaining === Infinity ? 4 : remaining, 6) - drafts.length;
    if (want <= 0) return;
    const picked: Draft[] = [...drafts];
    let cursor = picked.length ? picked[picked.length - 1].date : toISODate(addDays(new Date(), 1));
    let guard = 0;
    while (picked.length < drafts.length + want && guard++ < 60) {
      const iso = cursor;
      const d = fromISODate(iso);
      const tooClose = [...mine.filter((a) => a.date >= today && a.status === "waiting").map((a) => a.date), ...picked.map((p) => p.date)].some(
        (x) => Math.abs(diffDays(x, iso)) < minGap,
      );
      if (iso >= today && !store.settings.closedWeekdays.includes(d.getDay()) && !tooClose && (dayLoad.get(iso) ?? 0) < capacity) {
        picked.push({ date: iso, start: firstFreeSlot(iso, "09:00"), therapistId });
        cursor = toISODate(addDays(d, minGap));
      } else cursor = toISODate(addDays(d, 1));
    }
    setDrafts(picked.sort((a, b) => a.date.localeCompare(b.date)));
    if (picked.length) setMonth(new Date(fromISODate(picked[0].date).getFullYear(), fromISODate(picked[0].date).getMonth(), 1));
  };

  const save = () => {
    store.dispatch({
      type: "schedule",
      items: drafts.map((d) => ({
        patientId: patient.id,
        serviceId,
        therapistId: d.therapistId,
        date: d.date,
        start: d.start,
        status: "waiting",
        type: "booked",
        painBefore: patient.painHistory[patient.painHistory.length - 1]?.score ?? 5,
        paid: false,
      })),
    });
    toast({ message: `บันทึกตารางงาน ${drafts.length} ครั้งให้ ${patient.name} แล้ว` });
    setDrafts([]);
  };

  const gridStart = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <WorkPage eyebrow="ผู้มารับบริการ" title="วางแผนนัดตามคอร์ส" bell={false}>
      <div className="planner">
        {/* Patient picker */}
        <div className="panel picker">
          <SearchField value={query} onChange={setQuery} placeholder="ค้นหาผู้ป่วย / HN" />
          <div style={{ display: "flex", gap: 6 }}>
            <Chip tone="glass" pressed={onlyCourse} onClick={() => setOnlyCourse(true)}>
              มีแผนการรักษา
            </Chip>
            <Chip tone="glass" pressed={!onlyCourse} onClick={() => setOnlyCourse(false)}>
              ทั้งหมด
            </Chip>
          </div>
          <div className="picker__list scroll-y">
            {people.map(({ p, c }) => (
              <motion.button
                key={p.id}
                layout
                className="pick"
                aria-pressed={p.id === selectedId}
                onClick={() => setParams({ patient: p.id })}
                whileTap={{ scale: 0.98 }}
              >
                <Avatar name={p.name} src={patientPhoto(p)} shape="squircle" />
                <span className="pick__text">
                  <span className="pcard__name" style={{ fontSize: 14 }}>
                    {p.name}
                  </span>
                  <span className="tw-meta">
                    {p.hn} · {p.course ? p.course.name : "ไม่มีแผนการรักษา"}
                  </span>
                </span>
                {c && (
                  <span className="pick__credit">
                    {c.remaining}
                    <small>คงเหลือ</small>
                  </span>
                )}
              </motion.button>
            ))}
            {people.length === 0 && <EmptyState onGlass icon={<UserRound size={24} />} title="ไม่พบผู้ป่วย" />}
          </div>
        </div>

        {/* Plan */}
        <div className="panel">
          <div className="sheet plan">
            <div className="plan__main scroll-y scroll-y--light">
              <AnimatePresence mode="wait">
                <motion.div
                  key={patient.id}
                  className="plan__who"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <Avatar name={patient.name} src={patientPhoto(patient)} size="xl" shape="squircle" />
                  <div className="plan__who-text">
                    <p className="plan__name">{patient.name}</p>
                    <p className="tw-meta">
                      {patient.hn} · {patient.gender} {patient.age} ปี · {patient.complaint}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {credits ? (
                <CreditPips info={credits} adding={drafts.length} name={patient.course!.name} />
              ) : (
                <div className="alert alert--info">
                  <Info size={16} />
                  <div>
                    <b>ผู้ป่วยไม่มีแผนการรักษา</b>
                    ทุกครั้งที่จองจะเป็นการรับบริการแบบชำระเงินรายครั้ง
                  </div>
                </div>
              )}

              <div className="mp__head">
                <p className="mp__title">{thaiMonthYear(month)}</p>
                <IconButton label="เดือนก่อน" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  <ChevronLeft size={16} />
                </IconButton>
                <IconButton label="เดือนถัดไป" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  <ChevronRight size={16} />
                </IconButton>
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={month.toISOString()}
                  className="mp"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <div key={d} className="mp__dow">
                      {TH_WEEKDAYS_SHORT[d]}
                    </div>
                  ))}
                  {days.map((d) => {
                    const iso = toISODate(d);
                    const out = d.getMonth() !== month.getMonth();
                    const selIdx = drafts.findIndex((x) => x.date === iso);
                    const sel = selIdx >= 0;
                    const reason = sel ? null : blocked(iso);
                    const own = mine.find((a) => a.date === iso);
                    const load = Math.min(1, (dayLoad.get(iso) ?? 0) / capacity);
                    return (
                      <motion.button
                        key={iso}
                        type="button"
                        className={clsx("mp__day", out && "mp__day--out", sel && "mp__day--selected", iso === today && "mp__day--today")}
                        disabled={!sel && (!!reason || limitReached) && !own}
                        title={reason ?? (limitReached && !sel ? "เครดิตคงเหลือครบจำนวนแล้ว" : undefined)}
                        onClick={() => !own && toggle(iso)}
                        whileTap={{ scale: 0.94 }}
                        animate={sel ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                        transition={spring.snappy}
                      >
                        <span className="mp__num">{d.getDate()}</span>
                        {own && !sel && (
                          <span className={clsx("mp__mark", own.status === "done" ? "mp__mark--done" : "mp__mark--booked")} title="มีนัดของผู้ป่วยรายนี้">
                            ✓
                          </span>
                        )}
                        {sel && <span className="mp__sel">{selIdx + 1}</span>}
                        {!out && iso >= today && !store.settings.closedWeekdays.includes(d.getDay()) && (
                          <span className="mp__load" title={`ใช้เตียงแล้ว ${Math.round(load * 100)}%`}>
                            <span
                              style={{
                                width: `${load * 100}%`,
                                background: sel ? "var(--white)" : load > 0.85 ? "var(--red-500)" : load > 0.6 ? "var(--amber-300)" : "var(--green-500)",
                              }}
                            />
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>

              <div className="mp__legend">
                <span><i style={{ background: "var(--status-active)" }} />วันที่เลือก</span>
                <span><i style={{ background: "var(--status-waiting)" }} />มีนัดอยู่แล้ว</span>
                <span><i style={{ background: "var(--color-brand)" }} />รับบริการแล้ว</span>
                <span><i style={{ background: "linear-gradient(90deg,var(--green-500),var(--amber-300),var(--red-500))" }} />ความหนาแน่นของคิวทั้งคลินิก</span>
              </div>
            </div>

            <aside className="plan__side">
              <div className="plan__side-head">
                <p className="sec__title">รายการที่จะนัด ({drafts.length})</p>
                <Button variant="white" onClick={suggest} disabled={limitReached} leading={<img src={sparkle} alt="" width={12} height={12} style={{ transform: "scaleX(-1)" }} />}>
                  แนะนำวันอัตโนมัติ
                </Button>
              </div>
              <div className="plan__side-body scroll-y scroll-y--light">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="บริการ" style={{ height: 36, fontSize: 12 }}>
                    {store.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={therapistId}
                    onChange={(e) => {
                      setTherapistId(e.target.value);
                      setDrafts((ds) => ds.map((d) => ({ ...d, therapistId: e.target.value })));
                    }}
                    aria-label="ผู้บำบัดหลัก"
                    style={{ height: 36, fontSize: 12 }}
                  >
                    {store.therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <AnimatePresence mode="popLayout" initial={false}>
                  {drafts.map((d, i) => {
                    const slots = slotLoad(store.appointments, d.date, store.settings);
                    return (
                      <motion.div key={d.date} layout className="session" variants={listItem} initial="hidden" animate="show" exit="exit">
                        <div className="session__head">
                          <span className="session__no">{i + 1}</span>
                          <span className="session__date">{thaiDateLong(d.date)}</span>
                          <IconButton label="ลบวันนี้" variant="soft" size="sm" onClick={() => setDrafts((ds) => ds.filter((x) => x.date !== d.date))}>
                            <Trash2 size={14} />
                          </IconButton>
                        </div>
                        <div className="session__times">
                          {slots.map((s) => (
                            <button
                              key={s.time}
                              type="button"
                              className="tchip"
                              aria-pressed={d.start === s.time}
                              disabled={s.free === 0}
                              title={s.free === 0 ? "เต็ม" : `ว่าง ${s.free} เตียง`}
                              onClick={() => setDrafts((ds) => ds.map((x) => (x.date === d.date ? { ...x, start: s.time } : x)))}
                            >
                              {s.time}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {drafts.length === 0 && (
                  <EmptyState
                    icon={<CalendarPlus size={24} />}
                    title="ยังไม่ได้เลือกวัน"
                    description={credits ? `แตะวันที่ในปฏิทิน เลือกได้อีก ${credits.remaining} ครั้งตามแผน` : "แตะวันที่ในปฏิทินเพื่อเพิ่มนัด"}
                  />
                )}
              </div>
              <div className="plan__side-foot">
                {credits && credits.remaining === 0 && (
                  <Badge tone="danger" size="lg">
                    เครดิตหมด — ต้องพบแพทย์แผนไทยเพื่อเปิดแผนใหม่
                  </Badge>
                )}
                <Button size="lg" block disabled={drafts.length === 0} onClick={save} leading={<CalendarPlus size={16} />}>
                  บันทึกตารางงาน {drafts.length > 0 && `(${drafts.length} ครั้ง)`}
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </WorkPage>
  );
}
