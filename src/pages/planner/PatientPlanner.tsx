import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CalendarPlus, RotateCcw, Wallet, ChevronLeft, ChevronRight, Info, Sparkles, Trash2, Wand2 } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, Dialog, IconButton, Select, spring, useToast } from "../../design-system";
import { useLatest } from "../../features/useLatest";
import { slotLoad } from "../../features/slotLoad";
import { creditInfo, sameDayAppt, staffState } from "../../data/domain";
import { slotTimes } from "../../data/seed";
import { patientPhoto, therapistPhoto } from "../../data/avatars";
import { TH_WEEKDAYS_SHORT, addDays, diffDays, fromISODate, startOfWeek, thaiDateLong, thaiMonthYear, toISODate, todayISO } from "../../data/thaiDate";
import "../../features/book-dialog.css";
import "./patient-planner.css";

interface Draft {
  date: string;
  start: string;
  therapistId: string;
}

/** จองนัดตามคอร์ส (popup) — pick dates for one patient's course; times & therapists follow real availability. */
export function CoursePlanDialog({ patientId, onClose }: { patientId: string | null; onClose: () => void }) {
  const shownId = useLatest(patientId);
  if (!shownId) return null;
  return <CoursePlanInner key={shownId} patientId={shownId} open={patientId !== null} onClose={onClose} />;
}

function CoursePlanInner({ patientId, open, onClose }: { patientId: string; open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const today = todayISO();
  const selectedId = patientId;
  const patient = store.patientById(selectedId);
  const credits = creditInfo(patient, store.appointments);

  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [serviceId, setServiceId] = useState(patient.course?.serviceId ?? "s1");
  useEffect(() => {
    setDrafts([]);
    setServiceId(patient.course?.serviceId ?? patient.aiPlan?.phases[0]?.serviceId ?? "s1");
  }, [selectedId, patient.course?.serviceId, patient.aiPlan]);

  const mine = useMemo(() => store.appointments.filter((a) => a.patientId === patient.id && a.status !== "cancelled"), [store.appointments, patient.id]);
  const capacity = slotTimes(store.settings.openTime, store.settings.closeTime, store.settings.slotMinutes).length * store.settings.bedsPerSlot;
  // credits used up → staff can open a new course, or book as pay-per-visit
  const [payPerVisit, setPayPerVisit] = useState(false);
  // ยังไม่มีคอร์ส แต่มีแผนการรักษา (จองก่อนอนุมัติแผน) → นับตามแผน: หักครั้งแรกที่รักษาไปแล้ว + นัดที่ลงไว้แล้ว
  const planLeft = (() => {
    const pl = patient.aiPlan;
    if (credits || !pl || payPerVisit) return undefined;
    const svc = pl.phases[0]?.serviceId ?? serviceId;
    const since = toISODate(addDays(new Date(), -14));
    const first = Math.min(1, store.appointments.filter((a) => a.patientId === patient.id && a.serviceId === svc && a.date >= since && a.date <= today && (a.status === "done" || !!a.endedAt)).length);
    const booked = store.appointments.filter((a) => a.patientId === patient.id && a.serviceId === svc && a.date >= today && (a.status === "waiting" || a.status === "active") && !a.endedAt).length;
    return { total: pl.sessions, first, booked, left: Math.max(0, pl.sessions - first - booked) };
  })();
  const remaining = credits && !payPerVisit ? credits.remaining : planLeft ? planLeft.left : Infinity;
  // นัดตามคอร์ส: ต้องเปิดคอร์สก่อน (แพทย์อนุมัติแผน) · บริการอื่นที่ไม่เกี่ยวกับคอร์ส ลงแยกได้
  const needCourse = !patient.course && !!patient.aiPlan && !patient.aiPlan.approved && serviceId === (patient.aiPlan.phases[0]?.serviceId ?? serviceId);
  const renewSessions = patient.aiPlan?.sessions ?? patient.course?.total ?? 6;
  const renew = () => {
    if (!patient.course || !credits) return;
    // ต่อคอร์ส = เพิ่มครั้งในคอร์สเดิม (ไม่ล้างที่ใช้ไปแล้ว) · ชื่อคอร์สตามจำนวนจริง · ยืดวันหมดอายุ
    const total = patient.course.total + renewSessions;
    const name = /\d+\s*ครั้ง/.test(patient.course.name) ? patient.course.name.replace(/\d+\s*ครั้ง/, `${total} ครั้ง`) : `${patient.course.name} ${total} ครั้ง`;
    store.dispatch({
      type: "updatePatient",
      id: patient.id,
      patch: { course: { ...patient.course, name, total, expiresOn: toISODate(addDays(new Date(), 90)) } },
    });
    toast({ message: `ต่อคอร์ส +${renewSessions} ครั้ง · รวม ${total} ครั้ง` });
  };
  const upcoming = useMemo(
    () => store.appointments.filter((a) => a.patientId === patientId && a.date >= today && (a.status === "waiting" || a.status === "active")).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    [store.appointments, patientId, today],
  );
  const limitReached = drafts.length >= remaining;
  const minGap = store.settings.minDaysBetweenSessions;
  const staff = { therapists: store.therapists, serviceId };

  const dayLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of store.appointments) if (a.status !== "cancelled" && a.status !== "absent") m.set(a.date, (m.get(a.date) ?? 0) + 1);
    return m;
  }, [store.appointments]);

  /** first open slot on a date with a therapist who offers the service */
  const firstSlot = (iso: string, prefer?: string) => {
    const slots = slotLoad(store.appointments, iso, store.settings, staff).filter((s) => s.free > 0);
    return (prefer && slots.find((s) => s.time === prefer)?.time) || slots[0]?.time || "";
  };
  const freeTherapist = (iso: string, start: string, prefer?: string) => {
    const ok = store.therapists.filter((t) => staffState(t, { date: iso, start, serviceId }, store.appointments) === "free");
    return (prefer && ok.find((t) => t.id === prefer)?.id) || ok[0]?.id || "";
  };

  const blocked = (iso: string): string | null => {
    const d = fromISODate(iso);
    if (iso < today) return "วันที่ผ่านมาแล้ว";
    if (store.settings.closedWeekdays.includes(d.getDay())) return "คลินิกปิดทำการ";
    if ((dayLoad.get(iso) ?? 0) >= capacity || !firstSlot(iso)) return "ไม่มีรอบว่าง";
    if (mine.some((a) => a.date === iso && a.status === "waiting")) return "มีนัดวันนี้แล้ว";
    const near = [...mine.filter((a) => a.date >= today && a.status === "waiting").map((a) => a.date), ...drafts.map((x) => x.date)].find(
      (x) => x !== iso && Math.abs(diffDays(x, iso)) < minGap,
    );
    if (near) return `ห่างจากนัดอื่นน้อยกว่า ${minGap} วัน`;
    return null;
  };

  const add = (iso: string) => {
    const prefer = drafts[drafts.length - 1];
    const start = firstSlot(iso, prefer?.start ?? "09:00");
    const draft = { date: iso, start, therapistId: freeTherapist(iso, start, prefer?.therapistId) };
    setDrafts((ds) => [...ds, draft].sort((a, b) => a.date.localeCompare(b.date)));
  };
  // 1 คน 1 นัดต่อวัน → วันที่มีนัดอยู่แล้ว เลือกเพิ่มไม่ได้
  const dayTaken = (iso: string) => sameDayAppt(store.appointments, patient.id, iso);
  const toggle = (iso: string) => {
    if (drafts.some((d) => d.date === iso)) return setDrafts((ds) => ds.filter((d) => d.date !== iso));
    const taken = dayTaken(iso);
    if (taken) return toast({ message: `วันนี้มีนัดแล้ว ${taken.start} น. · 1 คนจองได้วันละ 1 นัด`, tone: "danger" });
    if (limitReached) return toast({ message: `เลือกได้ไม่เกิน ${remaining} ครั้ง`, tone: "danger" });
    add(iso);
  };

  // AI plan frequency (e.g. "สัปดาห์ละ 2 ครั้ง") → spacing in days
  const planGap = (() => {
    const m = patient.aiPlan?.frequency.match(/(\d+)\s*ครั้ง/);
    const perWeek = m ? Number(m[1]) : 0;
    return perWeek ? Math.max(minGap, Math.floor(7 / perWeek)) : minGap;
  })();
  const suggest = () => {
    const target = Math.min(remaining === Infinity ? patient.aiPlan?.sessions ?? 4 : remaining, 8);
    const picked: Draft[] = [...drafts];
    let cursor = picked.length ? picked[picked.length - 1].date : toISODate(addDays(new Date(), 1));
    let guard = 0;
    const prefer = picked[picked.length - 1]?.start ?? "09:00";
    while (picked.length < target && guard++ < 90) {
      const iso = cursor;
      const tooClose = [...mine.filter((a) => a.date >= today && a.status === "waiting").map((a) => a.date), ...picked.map((p) => p.date)].some((x) => Math.abs(diffDays(x, iso)) < minGap);
      const start = firstSlot(iso, prefer);
      if (iso >= today && !store.settings.closedWeekdays.includes(fromISODate(iso).getDay()) && !tooClose && !dayTaken(iso) && start) {
        picked.push({ date: iso, start, therapistId: freeTherapist(iso, start, picked[picked.length - 1]?.therapistId) });
        cursor = toISODate(addDays(fromISODate(iso), planGap));
      } else cursor = toISODate(addDays(fromISODate(iso), 1));
    }
    setDrafts(picked.sort((a, b) => a.date.localeCompare(b.date)));
    if (picked.length) setMonth(new Date(fromISODate(picked[0].date).getFullYear(), fromISODate(picked[0].date).getMonth(), 1));
  };

  const save = () => {
    const ok = drafts.filter((d) => d.start && d.therapistId && !dayTaken(d.date));
    store.dispatch({
      type: "schedule",
      items: ok.map((d) => ({
        patientId: patient.id,
        serviceId,
        therapistId: d.therapistId,
        date: d.date,
        start: d.start,
        status: "waiting",
        type: "booked",
        painBefore: [...patient.painHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.score ?? 5,
        paid: false,
      })),
    });
    toast({ message: `บันทึก ${ok.length} นัดแล้ว · แจ้งผู้ป่วยในแอป ThaiWell` });
    setDrafts([]);
    onClose();
  };

  const gridStart = startOfWeek(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).filter((d, i) => i < 35 || d.getMonth() === month.getMonth());
  const invalid = drafts.some((d) => !d.start || !d.therapistId);
  const usedPct = credits ? (credits.used / credits.total) * 100 : 0;
  const bookedPct = credits ? (credits.booked / credits.total) * 100 : 0;
  const addPct = credits ? (Math.min(drafts.length, credits.remaining) / credits.total) * 100 : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      className="pp-dialog"
      title="จัดนัด"
      subtitle="แตะวันในปฏิทิน หรือกด “แนะนำวัน”"
      footer={
        <>
          <span className="pp__foot-note">
            {needCourse ? <em>เปิดคอร์สก่อน (แพทย์อนุมัติแผน) · หรือเลือกบริการอื่นเพื่อลงนัดแยก</em> : invalid ? <em>บางวันยังไม่มีเวลาหรือผู้บำบัด</em> : drafts.length ? `${drafts.length} นัด · ${store.serviceById(serviceId).name}` : "ยังไม่ได้เลือกวัน"}
          </span>
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!drafts.length || invalid || needCourse} leading={<CalendarPlus size={16} />} onClick={save}>
            บันทึกนัด {drafts.length > 0 && `(${drafts.length})`}
          </Button>
        </>
      }
    >
          <div className="pp">
            <header className="pp__head">
              <Avatar name={patient.name} src={patientPhoto(patient)} size="lg" shape="squircle" />
              <div className="pp__id">
                <h2>{patient.name}</h2>
                <p>
                  {patient.hn} · {patient.gender} {patient.age} ปี
                </p>
                {patient.complaint && <p>{patient.complaint}</p>}
              </div>
              {credits ? (
                <div className="pp__credit">
                  <div className="pp__credit-top">
                    <small>{patient.course!.name}</small>
                    <b>
                      {Math.max(0, credits.remaining - drafts.length)}
                      <span>/{credits.total} คงเหลือ</span>
                    </b>
                  </div>
                  <i>
                    <i className="u" style={{ width: `${usedPct}%` }} />
                    <i className="b" style={{ width: `${bookedPct}%` }} />
                    <i className="n" style={{ width: `${addPct}%` }} />
                  </i>
                  {/* ครั้งแรก (ประเมิน + รักษา) รวมในคอร์สแล้ว → จัดนัดต่อเฉพาะครั้งที่เหลือ */}
                  <small className="pp__credit-note">จัดนัดต่ออีก {Math.max(0, credits.remaining - drafts.length)} ครั้ง</small>
                  <div className="pp__legend">
                    <span className="u">ใช้แล้ว {credits.used}</span>
                    <span className="b">จองไว้ {credits.booked}</span>
                    <span className="n">กำลังเลือก {drafts.length}</span>
                  </div>
                </div>
              ) : (
                planLeft ? (
                  <div className="pp__credit">
                    <div className="pp__credit-top">
                      <small>แผนการรักษา {planLeft.total} ครั้ง</small>
                      <b>
                        {Math.max(0, planLeft.left - drafts.length)}
                        <span>/{planLeft.total} คงเหลือ</span>
                      </b>
                    </div>
                    <small className="pp__credit-note">
                      จัดนัดต่ออีก {Math.max(0, planLeft.left - drafts.length)} ครั้ง
                      {(planLeft.first > 0 || planLeft.booked > 0) && (
                        <i>
                          {[planLeft.first ? "นับครั้งแรกแล้ว" : "", planLeft.booked ? `นัดไว้ ${planLeft.booked}` : ""].filter(Boolean).join(" · ")}
                        </i>
                      )}
                    </small>
                  </div>
                ) : (
                  <Badge tone="info">ชำระรายครั้ง</Badge>
                )
              )}
            </header>

            <div className="pp__body">
              {needCourse && (
                <div className="alert alert--caution pp__need">
                  <CircleAlert size={16} />
                  <div>
                    <b>ยังไม่ได้เปิดคอร์ส</b>
                    ให้แพทย์อนุมัติแผน {patient.aiPlan!.sessions} ครั้งก่อน แล้วจึงจองนัดตามคอร์ส · การรักษาอื่นเลือกบริการด้านล่างแล้วลงนัดแยกได้
                  </div>
                </div>
              )}
              {/* calendar */}
              <section className="pp__cal">
                <div className="pp__cal-head">
                  <h3>{thaiMonthYear(month)}</h3>
                  <Select value={serviceId} onChange={(e) => (setServiceId(e.target.value), setDrafts([]))} aria-label="บริการ">
                    {store.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <IconButton label="เดือนก่อน" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                    <ChevronLeft size={16} />
                  </IconButton>
                  <IconButton label="เดือนถัดไป" variant="soft" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                    <ChevronRight size={16} />
                  </IconButton>
                </div>
                <div className="pp__grid">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <span key={d} className="pp__dow">
                      {TH_WEEKDAYS_SHORT[d]}
                    </span>
                  ))}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={month.toISOString()} className="pp__days" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      {days.map((d) => {
                        const iso = toISODate(d);
                        const out = d.getMonth() !== month.getMonth();
                        const idx = drafts.findIndex((x) => x.date === iso);
                        const sel = idx >= 0;
                        const own = mine.find((a) => a.date === iso);
                        const reason = sel || own ? null : blocked(iso);
                        const load = Math.min(1, (dayLoad.get(iso) ?? 0) / capacity);
                        return (
                          <button
                            key={iso}
                            type="button"
                            className={clsx("pp__day", out && "is-out", sel && "is-sel", iso === today && "is-today", own && (own.status === "done" ? "is-done" : "is-booked"))}
                            disabled={!sel && !own && (!!reason || limitReached)}
                            title={own ? (own.status === "done" ? "รักษาแล้ว" : `มีนัด ${own.start} น.`) : reason ?? undefined}
                            onClick={() => !own && toggle(iso)}
                          >
                            <b>{d.getDate()}</b>
                            {sel && <em>{idx + 1}</em>}
                            {own && !sel && <em className="own">{own.status === "done" ? "✓" : own.start}</em>}
                            {!out && !own && !sel && iso >= today && !reason && (
                              <i>
                                <i style={{ width: `${load * 100}%`, background: load > 0.85 ? "var(--red-500)" : load > 0.6 ? "var(--amber-300)" : "var(--green-500)" }} />
                              </i>
                            )}
                          </button>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="pp__key">
                  <span>
                    <i className="sel" /> เลือกไว้
                  </span>
                  <span>
                    <i className="booked" /> มีนัดแล้ว
                  </span>
                  <span>
                    <i className="done" /> รักษาแล้ว
                  </span>
                  <span>
                    <i className="load" /> คิวแน่น
                  </span>
                </div>
              </section>

              {/* drafts */}
              <section className="pp__drafts">
                <div className="pp__drafts-head">
                  <h3>นัดที่เลือก ({drafts.length})</h3>
                  <Button variant="outline" size="sm" leading={<Wand2 size={14} />} disabled={limitReached} onClick={suggest}>
                    แนะนำวัน
                  </Button>
                </div>
                {patient.aiPlan && (
                  <p className="pp__ai">
                    <Sparkles size={13} /> แผน AI: {patient.aiPlan.sessions} ครั้ง · {patient.aiPlan.frequency}
                  </p>
                )}
                {credits && credits.remaining === 0 && !payPerVisit && (
                  <div className="pp__out">
                    <div>
                      <Info size={16} />
                      <span>
                        <b>คอร์สครบแล้ว</b>
                        ใช้แล้ว {credits.used} · จองไว้ {credits.booked} จาก {credits.total} ครั้ง
                      </span>
                    </div>
                    <div className="pp__out-acts">
                      <Button size="md" leading={<RotateCcw size={15} />} onClick={renew}>
                        เปิดคอร์สใหม่ {renewSessions} ครั้ง
                      </Button>
                      <Button variant="outline" size="md" leading={<Wallet size={15} />} onClick={() => setPayPerVisit(true)}>
                        จองแบบรายครั้ง
                      </Button>
                    </div>
                  </div>
                )}
                {payPerVisit && (
                  <p className="pp__ai pp__ai--pay">
                    <Wallet size={13} /> ชำระรายครั้ง · {store.serviceById(serviceId).price} บาท/ครั้ง
                    <button type="button" onClick={() => (setPayPerVisit(false), setDrafts([]))}>
                      ยกเลิก
                    </button>
                  </p>
                )}
                <div className="pp__drafts-list scroll-y scroll-y--light">
                  <AnimatePresence initial={false} mode="popLayout">
                    {drafts.map((d, i) => {
                      const slots = slotLoad(store.appointments, d.date, store.settings, staff);
                      const free = d.start ? store.therapists.filter((t) => staffState(t, { date: d.date, start: d.start, serviceId }, store.appointments) === "free") : [];
                      const t = store.therapists.find((x) => x.id === d.therapistId);
                      const set = (patch: Partial<Draft>) => setDrafts((ds) => ds.map((x) => (x.date === d.date ? { ...x, ...patch } : x)));
                      return (
                        <motion.div key={d.date} layout className="pp__draft" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={spring.soft}>
                          <div className="pp__draft-head">
                            <span className="pp__no">{i + 1}</span>
                            <b>{thaiDateLong(d.date)}</b>
                            <IconButton label="ลบ" variant="soft" size="sm" onClick={() => setDrafts((ds) => ds.filter((x) => x.date !== d.date))}>
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                          <div className="pp__times">
                            {slots.map((s) => (
                              <button
                                key={s.time}
                                type="button"
                                className="tchip"
                                aria-pressed={d.start === s.time}
                                disabled={s.free === 0}
                                onClick={() => set({ start: s.time, therapistId: freeTherapist(d.date, s.time, d.therapistId) })}
                              >
                                {s.time}
                              </button>
                            ))}
                          </div>
                          <div className="pp__who-pick">
                            {t && <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />}
                            <Select value={d.therapistId} onChange={(e) => set({ therapistId: e.target.value })} aria-label="ผู้บำบัด">
                              {!free.length && <option value="">ไม่มีผู้บำบัดว่าง</option>}
                              {free.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {drafts.length === 0 && upcoming.length > 0 && (
                    <div className="pp__booked">
                      <h4>นัดที่มีอยู่ ({upcoming.length})</h4>
                      {upcoming.map((a) => (
                        <div key={a.id}>
                          <b>{thaiDateLong(a.date)}</b>
                          <span>
                            {a.start} น. · {store.serviceById(a.serviceId).short} · {store.therapistById(a.therapistId).name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {drafts.length === 0 && remaining > 0 && (
                    <div className="pp__empty">
                      <CalendarPlus size={22} />
                      <p>
                        แตะวันในปฏิทินเพื่อเพิ่มนัด
                        <small>{credits && !payPerVisit ? `เลือกได้อีก ${credits.remaining} ครั้ง` : "หรือกด “แนะนำวัน”"}</small>
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>

          </div>
    </Dialog>
  );
}
