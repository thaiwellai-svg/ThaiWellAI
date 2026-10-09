import { useNavigate } from "react-router-dom";
import type { Appointment } from "../../data/types";
import { CoursePlanDialog } from "../planner/PatientPlanner";
import { ScreeningAlert } from "../../features/ScreeningAlert";
import { MoreMenu } from "../../features/MoreMenu";
import { CancelDialog } from "../../features/CancelDialog";
import { DocDialog, type DocKind } from "../../features/MedDocs";
import { VisitAssessments } from "../../features/VisitAssessments";
import { ResetPatientDialog } from "../../features/ResetPatientDialog";
import { SellPackageDialog } from "../../features/SellPackageDialog";
import { usePatientPrint } from "../../features/PatientPrint";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, CalendarX2, FileHeart, Send, ShoppingBag, Printer, Activity, PenLine, CalendarPlus, Check, HeartPulse, History, Phone, Stethoscope, RotateCcw, UserX, ClipboardList, UserRound, Target, TriangleAlert, Ticket, CalendarDays } from "lucide-react";
import { useStore } from "../../store/store";
import { Button, EmptyState, ease, useToast } from "../../design-system";
import { stageMeta, creditInfo, courseUsage, coursePrepaid } from "../../data/domain";
import { patientPhoto } from "../../data/avatars";
import { baht, thaiDate, thaiDateShort, todayISO } from "../../data/thaiDate";
import { PhotoPicker } from "../../features/PhotoPicker";
import { PainMini } from "../../features/RecordCards";
import { AIPlanCard, ElementCard } from "../../features/AIPlan";
import { painColor } from "../../features/widgets";
import "../../features/health.css";
import "../../features/patient-health.css";



export function PatientDetail({ id, onAdd, onEdit, onAIPlan, aiOpen, onHealth, healthOpen }: { id: string | null; onAdd: () => void; onEdit?: () => void; /** opens the AI plan side panel (wide layout) */ onAIPlan?: () => void; aiOpen?: boolean; /** opens the health side panel, like on รับบริการ */ onHealth?: () => void; healthOpen?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  // remember the open patient so "back" from the appointment page lands on them again
  const openAppt = (aid: string) => {
    if (id) navigate(`/patients?id=${id}`, { replace: true });
    navigate(`/appointments/${aid}`);
  };
  const [planFor, setPlanFor] = useState<string | null>(null);
  const p = id ? store.patients.find((x) => x.id === id) : undefined;
  const today = todayISO();
  const [print, printNode] = usePatientPrint(p ?? null);
  const [cancelPlan, setCancelPlan] = useState<Appointment | null>(null);
  const [cancelExtra, setCancelExtra] = useState(false);
  const [doc, setDoc] = useState<DocKind | null>(null);
  const [selling, setSelling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState(false);
  // นัดถัดไปของคอร์ส (ตัวนับกลาง) → ปุ่มยกเลิกนัดตามแผน
  const planNext = p?.course ? courseUsage(p, store.appointments)?.bookedVisits.find((a) => a.status === "waiting" && !a.calledAt && a.date >= today) : undefined;

  const visits = useMemo(
    () => (p ? store.appointments.filter((a) => a.patientId === p.id).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start)) : []),
    [store.appointments, p],
  );

  if (!p)
    return (
      <div className="pd pd--empty">
        <EmptyState icon={<CalendarPlus size={24} />} title="เลือกผู้ป่วยจากรายการ" description="หรือเพิ่มผู้ป่วยใหม่" action={<Button onClick={onAdd}>เพิ่มผู้ป่วย</Button>} />
      </div>
    );

  const credits = creditInfo(p, store.appointments);

  const prepaid = coursePrepaid(p, store.biz.sales);
  // นัดเกินจำนวนครั้งของคอร์ส (เช่น จองตามแผนก่อนเปิดคอร์ส แล้วคอร์สเปิดจำนวนน้อยกว่า)
  const over = credits ? Math.max(0, credits.used + credits.booked - credits.total) : 0;
  const growCourse = () => {
    if (!p?.course || !credits) return;
    const total = credits.used + credits.booked;
    store.dispatch({ type: "updatePatient", id: p.id, patch: { course: { ...p.course, total, name: p.course.name.replace(/\d+\s*ครั้ง/, `${total} ครั้ง`) } } });
    toast({ message: `เพิ่มคอร์สเป็น ${total} ครั้งแล้ว · เก็บเงินส่วนเพิ่มด้วย` });
  };
  // นัดส่วนเกิน = นัดท้ายสุดที่ยังไม่เริ่ม → เปิดหน้าต่างยกเลิกนัดแบบเดียวกับทุกที่ (เลือกไว้ให้ ตรวจ/แก้ได้ก่อนยืนยัน)
  const extraAppts = over
    ? store.appointments
        .filter((a) => a.patientId === p.id && a.status === "waiting" && !a.calledAt && !a.checkinQueue && a.date >= today)
        .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
        .slice(0, over)
    : [];
  const upcoming = visits.filter((v) => v.date >= today && (v.status === "waiting" || v.status === "active")).reverse();
  // ล่าสุด 5 ครั้ง (ทุกครั้ง + ปวดก่อน/หลัง อยู่ในการ์ด "ความปวด")
  const past = visits.filter((v) => !upcoming.includes(v)).slice(0, 5);
  const doneCount = visits.filter((v) => v.status === "done").length;
  const h = [...p.painHistory].sort((a, b) => a.date.localeCompare(b.date));
  const last = h[h.length - 1]?.score;
  // ปวดก่อน → หลังนวด รายครั้ง (เฉพาะครั้งที่มาแล้ว) · เทียบปวดตอนมาครั้งแรกกับครั้งล่าสุด
  const painPairs = [...visits]
    .reverse()
    .filter((v) => v.date <= today && (v.status === "done" || v.status === "active") && v.painBefore !== undefined)
    .map((v) => ({ id: v.id, date: v.date, before: v.painBefore!, after: v.painAfter }))
    .slice(-10);
  const lastP = painPairs[painPairs.length - 1];
  const painSum = {
    pairs: painPairs,
    lastP,
    drop: lastP && lastP.after !== undefined ? lastP.before - lastP.after : undefined,
    trend: painPairs.length > 1 ? lastP.before - painPairs[0].before : undefined,
  };

  const cid = p.citizenId?.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, "$1-$2-$3-$4-$5");
  const assessed = visits.filter((v) => v.status !== "cancelled" && v.status !== "absent").length;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={p.id}
        className="pd scroll-y scroll-y--light"
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10, transition: { duration: 0.12 } }}
        transition={{ duration: 0.3, ease: ease.out }}
      >
        {/* Identity: name, HN, and the safety tags (โรคประจำตัว · แพ้) — shown once, here */}
        <header className="pd__hero">
          <PhotoPicker name={p.name} src={patientPhoto(p)} size="card" onPick={(photo) => store.dispatch({ type: "updatePatient", id: p.id, patch: { photo } })} />
          <div className="pd__id">
            <h2>{p.name}</h2>
            <p>
              {p.hn} · {p.gender} {p.age} ปี
              {p.conditions.map((c) => (
                <span key={c} className="pd__flag is-cond">
                  {" · "}
                  {c}
                </span>
              ))}
              {p.allergies?.map((x) => (
                <span key={x} className="pd__flag is-allergy">
                  {" · "}แพ้ {x}
                </span>
              ))}
              {!p.conditions.length && !p.allergies?.length && " · ไม่มีโรคประจำตัว · ไม่แพ้"}
            </p>
          </div>
          <div className="pd__actions pd__icons">
            {onHealth && (
              <button type="button" className={healthOpen ? "pd__ib is-on" : "pd__ib"} aria-pressed={!!healthOpen} onClick={onHealth} aria-label="ข้อมูลสุขภาพ" title={healthOpen ? "ซ่อนข้อมูลสุขภาพ" : "ข้อมูลสุขภาพ"}>
                <HeartPulse size={18} />
              </button>
            )}
            <MoreMenu
              items={[
                ...(onEdit ? [{ label: "แก้ไขข้อมูล", icon: <PenLine size={16} />, onClick: onEdit }] : []),
                ...(p.phone ? [{ label: "โทร", hint: p.phone, icon: <Phone size={16} />, onClick: () => (window.location.href = `tel:${p.phone.replace(/-/g, "")}`) }] : []),
                { label: "พิมพ์ / PDF", icon: <Printer size={16} />, onClick: print },
                { label: "ใบรับรองแพทย์", icon: <FileHeart size={16} />, onClick: () => setDoc("cert") },
                { label: "ใบส่งตัว", icon: <Send size={16} />, onClick: () => setDoc("refer") },
                { label: "ขายแพ็กเกจ", icon: <ShoppingBag size={16} />, onClick: () => setSelling(true) },
                { label: "รีเซ็ตข้อมูลการรักษา", hint: "ใช้ทดสอบ", icon: <RotateCcw size={16} />, onClick: () => setResetting(true), danger: true },
                { label: "ลบผู้ป่วย", hint: "ลบทั้งคน", icon: <UserX size={16} />, onClick: () => setRemoving(true), danger: true },
              ]}
            />
            <ResetPatientDialog patientId={resetting ? p.id : null} onClose={() => setResetting(false)} />
            <ResetPatientDialog mode="remove" patientId={removing ? p.id : null} onClose={() => setRemoving(false)} onDone={() => navigate("/patients")} />
            <DocDialog patientId={doc ? p.id : null} kind={doc ?? "cert"} onClose={() => setDoc(null)} />
            <SellPackageDialog patientId={selling ? p.id : null} onClose={() => setSelling(false)} />
            {printNode}
            <CancelDialog appt={cancelPlan} planFirst onClose={() => setCancelPlan(null)} />
            <CancelDialog
              appt={cancelExtra ? (extraAppts[0] ?? null) : null}
              preset={{ ids: extraAppts.map((a) => a.id), by: "clinic", reason: "เกินจำนวนครั้งในคอร์ส" }}
              onClose={() => setCancelExtra(false)}
            />
            <button type="button" className="pd__ib is-primary" onClick={() => setPlanFor(p.id)} aria-label="จัดนัด" title="จัดนัด">
              <CalendarPlus size={18} />
            </button>
          </div>
        </header>

        <ScreeningAlert p={p} />

        <div className="pd__grid">
          {/* ── 2 คอลัมน์: ผู้ป่วย | การรักษา (แผน → คอร์ส → นัด) ── */}
          <div className="pd__cols">
            <div className="pd__col">
              <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#6b7a71" }}>
                <UserRound size={15} />
              </span>
              ข้อมูลส่วนตัว
              {onEdit && (
                <button type="button" className="pd2__act" onClick={onEdit}>
                  แก้ไข
                </button>
              )}
            </h3>
            <dl className="pd2__kv">
                {p.phone && (
                  <div>
                    <dt>เบอร์โทร</dt>
                    <dd>{p.phone}</dd>
                  </div>
                )}
                {p.birthDate && (
                  <div>
                    <dt>วันเกิด</dt>
                    <dd>{thaiDate(p.birthDate)}</dd>
                  </div>
                )}
                {cid && (
                  <div>
                    <dt>เลขบัตรประชาชน</dt>
                    <dd>{cid}</dd>
                  </div>
                )}
                {p.email && (
                  <div>
                    <dt>อีเมล</dt>
                    <dd>{p.email}</dd>
                  </div>
                )}
                {p.emergency && (
                  <div>
                    <dt>ติดต่อฉุกเฉิน</dt>
                    <dd>
                      {p.emergency.name}
                      {p.emergency.relation ? ` (${p.emergency.relation})` : ""} · {p.emergency.phone}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>ลงทะเบียน</dt>
                  <dd>{thaiDate(p.registeredOn)}</dd>
                </div>
              </dl>
          </section>
              <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#2f8a52" }}>
                <Stethoscope size={15} />
              </span>
              อาการสำคัญ
            </h3>
            <p className="pd2__quote">{p.complaint}</p>
          </section>
              <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#c2482b" }}>
                <Activity size={15} />
              </span>
              ความปวด
              {painSum.trend !== undefined && painSum.trend !== 0 && (
                <em className={painSum.trend < 0 ? "is-good" : "is-bad"}>{painSum.trend < 0 ? `ดีขึ้น ${-painSum.trend} จากครั้งแรก` : `แย่ลง ${painSum.trend} จากครั้งแรก`}</em>
              )}
            </h3>
            {painSum.pairs.length ? (
              <div className="pnc">
                <div className="pnc__now">
                  <small>ครั้งล่าสุด · {thaiDateShort(painSum.lastP!.date)}</small>
                  <b>
                    <span style={{ color: painColor(painSum.lastP!.before) }}>{painSum.lastP!.before}</span>
                    <i>→</i>
                    <span style={{ color: painSum.lastP!.after !== undefined ? painColor(painSum.lastP!.after) : undefined }}>{painSum.lastP!.after ?? "—"}</span>
                    <i>/10</i>
                  </b>
                  <span>{painSum.drop !== undefined ? (painSum.drop > 0 ? `นวดแล้วลด ${painSum.drop}` : painSum.drop < 0 ? `นวดแล้วเพิ่ม ${-painSum.drop}` : "นวดแล้วเท่าเดิม") : "ยังไม่ประเมินหลังนวด"}</span>
                </div>
                <div className="pnc__chart">
                  <PainPairs pairs={painSum.pairs} />
                  <div className="pnc__legend">
                    <span>
                      <i className="is-before" /> ก่อนนวด
                    </span>
                    <span>
                      <i className="is-after" /> หลังนวด
                    </span>
                    <span className="pnc__range">
                      {thaiDateShort(painSum.pairs[0].date)}
                      {painSum.pairs.length > 1 ? ` – ${thaiDateShort(painSum.lastP!.date)}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="pd2__muted">{last === undefined ? "ยังไม่มีคะแนนปวด" : `ปวด ${last}/10 จากการประเมิน`}</p>
            )}
            {/* การประเมินรายครั้ง: แต่ละวันที่มารักษา ผู้ป่วยประเมินอะไรมา */}
            {assessed > 0 && (
              <details className="pd2__more">
                <summary>
                  <ClipboardList size={14} /> ปวดก่อน–หลังนวด รายครั้ง
                  <ChevronDown size={14} />
                </summary>
                <VisitAssessments p={p} onOpen={openAppt} />
              </details>
            )}
          </section>
              <section className="pd__card pd2">
            <h3 className="pd2__h">
              <span className="pd2__i" style={{ ["--c" as string]: "#7c5cc4" }}>
                <History size={15} />
              </span>
              ประวัติการรักษา
              <em>{doneCount ? `รักษาแล้ว ${doneCount} ครั้ง` : "ยังไม่เคยรักษา"}</em>
            </h3>
            {past.length ? (
              <ol className="hx-hist">
                {past.map((v) => (
                  <li key={v.id} className={v.status === "absent" ? "is-absent" : undefined} role="button" tabIndex={0} onClick={() => openAppt(v.id)}>
                    <span className="hx-hist__date">{thaiDateShort(v.date)}</span>
                    <span className="hx-hist__body">
                      <b>{store.serviceById(v.serviceId).short}</b>
                      {v.status === "absent" || (v.status === "waiting" && v.date < todayISO()) ? <small>ไม่มา</small> : v.diagnoses?.[0] ? <small>{v.diagnoses[0].name}</small> : <small>{stageMeta(v).label}</small>}
                    </span>
                    {v.status === "done" && v.painAfter !== undefined && <PainMini score={v.painAfter} label="หลัง" />}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="pd2__muted">ยังไม่มีประวัติ</p>
            )}
          </section>
            </div>
            <div className="pd__col">
              {/* 1 แผนการรักษา */}
              <section className="pd__card pd2 ptx ptx--plan">
                <h3 className="pd2__h">
                  <span className="pd2__i" style={{ ["--c" as string]: "#2f8a52" }}>
                    <ClipboardList size={15} />
                  </span>
                  แผนการรักษา
                  <em className={p.aiPlan?.approved ? "is-good" : p.aiPlan ? "is-low" : undefined}>{!p.aiPlan ? "ยังไม่วางแผน" : p.aiPlan.approved ? "อนุมัติแล้ว" : "รอแพทย์อนุมัติ"}</em>
                  {onAIPlan && (
                    <button type="button" className="pd2__act" onClick={onAIPlan}>
                      {p.aiPlan ? (aiOpen ? "ซ่อนแผน" : "เปิดแผน") : "วางแผน"}
                    </button>
                  )}
                </h3>
                {p.aiPlan ? (
                  (() => {
                    const pl = p.aiPlan!;
                    const perWeek = Number(/(\d+)/.exec(pl.frequency)?.[1] ?? 1) || 1;
                    const weeks = Math.ceil(pl.sessions / perWeek);
                    return (
                      <div className="pln">
                        <div className="pln__hero">
                          <span className="pln__n">
                            <b>{pl.sessions}</b>
                            <small>ครั้ง</small>
                          </span>
                          <span className="pln__meta">
                            <b>{pl.massageType}</b>
                            <small>
                              {pl.frequency} · ประมาณ {weeks} สัปดาห์
                            </small>
                          </span>
                        </div>
                        {pl.goals[0] && (
                          <p className="pln__row">
                            <Target size={14} />
                            <span>
                              <small>เป้าหมาย</small>
                              {pl.goals[0]}
                            </span>
                          </p>
                        )}
                        {pl.phases.length > 0 && (
                          <ol className="pln__phases">
                            {pl.phases.slice(0, 3).map((ph, k) => (
                              <li key={k}>
                                <i>{k + 1}</i>
                                <span>
                                  <b>{ph.title}</b>
                                  <small>
                                    สัปดาห์ {ph.weeks}
                                    {ph.focus ? ` · ${ph.focus}` : ""}
                                  </small>
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {!pl.approved && (
                          <div className="pln__approve">
                            <span>เปิดแผนเพื่อตรวจ แล้วกดอนุมัติ ระบบจะเปิดคอร์ส {pl.sessions} ครั้งให้</span>
                            <Button size="md" leading={<Stethoscope size={15} />} onClick={() => {
                                // เปิดแผนให้แพทย์ตรวจ แล้วเลื่อนไปที่ปุ่ม "แพทย์อนุมัติ"
                                if (onAIPlan && !aiOpen) onAIPlan();
                                window.setTimeout(() => document.querySelector(".aip-foot")?.scrollIntoView({ behavior: "smooth", block: "center" }), onAIPlan && !aiOpen ? 450 : 0);
                              }}>
                              อนุมัติแผน
                            </Button>
                          </div>
                        )}
                        {pl.referToDoctor && (
                          <p className="pln__warn">
                            <TriangleAlert size={14} /> ควรให้แพทย์ตรวจก่อนเริ่ม
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="pln__empty">
                    <p>ยังไม่มีแผน · ให้ AI ร่างจากอาการ แล้วแพทย์อนุมัติ</p>
                  </div>
                )}
                {!onAIPlan && <AIPlanCard p={p} />}
              </section>
              {/* 2 คอร์ส */}
              <section className="pd__card pd2 ptx ptx--course">
                <h3 className="pd2__h">
                  <span className="pd2__i" style={{ ["--c" as string]: "#7a5bb5" }}>
                    <Ticket size={15} />
                  </span>
                  คอร์ส
                  {credits ? <em className={credits.total - credits.used <= 1 ? "is-low" : "is-good"}>ใช้แล้ว {credits.used}/{credits.total}</em> : null}
                  <button type="button" className="pd2__sell pd2__act" onClick={() => setSelling(true)}>
                    <ShoppingBag size={14} /> {credits ? "ต่อคอร์ส" : "ขายแพ็กเกจ"}
                  </button>
                </h3>

            {credits && p.course ? (
              <>
                <div className="pd2__course-row">
                  <b className="pd2__course">{p.course.name}</b>
                  <small className="pd2__muted">
                    {thaiDateShort(p.course.startedOn)} – {thaiDateShort(p.course.expiresOn, true)}
                  </small>
                </div>
                <div className="hx-tix" style={{ gridTemplateColumns: `repeat(${Math.min(credits.total, 10)}, minmax(0, 1fr))` }}>
                  {Array.from({ length: credits.total }, (_, k) => {
                    const st = k < credits.used ? "used" : k < credits.used + credits.booked ? "booked" : "free";
                    const base = p.course!.base ?? 0;
                    const v = st === "used" ? credits.usedVisits[k - base] : st === "booked" ? credits.bookedVisits[k - credits.used] : undefined;
                    return (
                      <span key={k} className={`hx-tix__t is-${st}`} title={v ? `ครั้งที่ ${k + 1} · ${thaiDateShort(v.date)} ${v.start} น.` : undefined}>
                        {st === "used" ? <Check size={12} strokeWidth={3} /> : k + 1}
                      </span>
                    );
                  })}
                </div>
                <div className="pd2__legend">
                  <span>
                    <i className="is-used" /> ใช้แล้ว {credits.used}
                  </span>
                  <span>
                    <i className="is-booked" /> จองไว้ {credits.booked}
                  </span>
                  <span>
                    <i /> ว่าง {credits.remaining}
                  </span>
                </div>
                {/* ราคาคอร์ส: ราคาต่อครั้ง × จำนวนครั้ง · วิธีชำระ (เลือกตอนรับชำระครั้งแรก) */}
                {(() => {
                  const c = p.course!;
                  const per = store.serviceById(c.serviceId).price;
                  const paid = store.biz.sales.filter((x) => x.patientId === p.id && !x.void && x.at.slice(0, 10) >= c.startedOn).reduce((n, x) => n + x.payments.reduce((m, y) => m + y.amount, 0), 0);
                  const left = Math.max(0, credits.total - credits.used);
                  return (
                    <div className="cpr">
                      <div className="cpr__grid">
                        <span>
                          <small>ราคาต่อครั้ง</small>
                          <b>{baht(prepaid && paid ? Math.round(paid / credits.total) : per)} ฿</b>
                        </span>
                        <span>
                          <small>ทั้งคอร์ส {credits.total} ครั้ง</small>
                          <b>{baht(prepaid && paid ? paid : per * credits.total)} ฿</b>
                        </span>
                        <span>
                          <small>วิธีชำระ</small>
                          <b className={prepaid || c.billing ? undefined : "is-wait"}>{prepaid ? "จ่ายล่วงหน้าแล้ว" : c.billing === "perVisit" ? "จ่ายรายครั้ง" : "ยังไม่เลือก"}</b>
                        </span>
                      </div>
                      <p className="cpr__note">
                        {prepaid
                          ? paid
                            ? `รับเงินแล้ว ${baht(paid)} บาท · มาครั้งต่อไปไม่ต้องจ่าย (หัตถการเพิ่มจ่ายตามจริง)`
                            : "ชำระล่วงหน้าแล้ว · มาครั้งต่อไปไม่ต้องจ่าย"
                          : c.billing === "perVisit"
                            ? `จ่ายตอนมาแต่ละครั้ง ${baht(per)} บาท · ยังเหลือ ${left} ครั้ง ${baht(left * per)} บาท`
                            : `ตอนรับชำระครั้งแรกจะให้เลือก: จ่ายรายครั้ง ${baht(per)} บาท หรือจ่ายทั้งคอร์ส ${baht(left * per)} บาท (ลดได้)`}
                      </p>
                    </div>
                  );
                })()}
                {over > 0 && (
                  // ใช้แล้ว + จองไว้ ต้องไม่เกินจำนวนครั้งของคอร์ส → ให้เลือกว่าจะเพิ่มครั้งในคอร์ส หรือยกเลิกนัดส่วนเกิน
                  <div className="pd2__over" role="alert">
                    <b>นัดเกินคอร์ส {over} นัด</b>
                    <small>
                      ใช้แล้ว {credits.used} + จองไว้ {credits.booked} จากคอร์ส {credits.total} ครั้ง
                    </small>
                    <div>
                      <button type="button" onClick={growCourse}>
                        เพิ่มคอร์สเป็น {credits.used + credits.booked} ครั้ง
                      </button>
                      <button type="button" className="is-danger" disabled={!extraAppts.length} onClick={() => setCancelExtra(true)}>
                        ยกเลิกนัดส่วนเกิน {over} นัด
                      </button>
                    </div>
                  </div>
                )}
                {planNext && (
                  <button type="button" className="pd2__cancel" onClick={() => setCancelPlan(planNext)}>
                    <CalendarX2 size={14} /> ยกเลิกนัดตามแผน
                  </button>
                )}
              </>
            ) : p.aiPlan && !p.aiPlan.approved ? (
              // ร่างแผนรอแพทย์อนุมัติ → คอร์สเปิดเมื่ออนุมัติ
              (() => {
                const pl = p.aiPlan!;
                const svc = pl.phases[0]?.serviceId;
                const n = store.appointments.filter((a) => a.patientId === p.id && a.status === "waiting" && a.date >= todayISO() && (!svc || a.serviceId === svc)).length;
                return (
                  <div className="hx-draft pd2__draft">
                    <div className="hx-draft__top">
                      <span className="hx-draft__tag">รอแพทย์อนุมัติ</span>
                      <small>{pl.frequency}</small>
                    </div>
                    <b className="hx-draft__title">ร่างคอร์ส {pl.sessions} ครั้ง</b>
                    <small className="hx-draft__svc">{svc ? store.serviceById(svc).name : pl.massageType}</small>
                    <div className="hx-draft__bar" style={{ gridTemplateColumns: `repeat(${pl.sessions}, minmax(0, 1fr))` }}>
                      {Array.from({ length: pl.sessions }, (_, k) => (
                        <i key={k} className={k < n ? "is-booked" : undefined} />
                      ))}
                    </div>
                    <div className="hx-draft__foot">
                      <span>
                        จองไว้ <b>{n}</b> · ว่าง <b>{Math.max(0, pl.sessions - n)}</b>
                      </span>
                      {svc && (
                        <span>
                          ครั้งละ <b>{baht(store.serviceById(svc).price)}</b> · ทั้งคอร์ส <b>{baht(store.serviceById(svc).price * pl.sessions)} ฿</b>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <p className="pd2__muted">ยังไม่มีคอร์ส</p>
            )}
              </section>
              {/* 3 นัด */}
              <section className="pd__card pd2 ptx ptx--appt">
                <h3 className="pd2__h">
                  <span className="pd2__i" style={{ ["--c" as string]: "#2f6fb3" }}>
                    <CalendarDays size={15} />
                  </span>
                  นัดที่จะถึง
                  {upcoming.length > 0 && <em>{upcoming.length} นัด</em>}
                  <button type="button" className="pd2__act" onClick={() => setPlanFor(p.id)}>
                    <CalendarPlus size={14} /> จัดนัด
                  </button>
                </h3>
            {upcoming.length ? (
              <div className="hx-next">
                {upcoming.slice(0, 5).map((v, k) => (
                  <button type="button" key={v.id} className={k === 0 ? "hx-next__item is-first" : "hx-next__item"} onClick={() => openAppt(v.id)}>
                    <span className="hx-next__date">
                      <small>{thaiDateShort(v.date).split(" ")[1]}</small>
                      <b>{Number(v.date.slice(8))}</b>
                    </span>
                    <span className="hx-next__body">
                      <b>
                        {v.start} น. · {store.serviceById(v.serviceId).short}
                      </b>
                      <small>{store.therapistById(v.therapistId).name}</small>
                    </span>
                    {v.date === today && <em>วันนี้</em>}
                    <ChevronRight size={15} className="hx-next__go" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="pd2__muted">ยังไม่มีนัด</p>
            )}
              </section>
            </div>
          </div>


          {/* ── element (wide, folded) ── */}
          <ElementCard p={p} />
        </div>
      </motion.div>
      <CoursePlanDialog key="cpd" patientId={planFor} onClose={() => setPlanFor(null)} />
    </AnimatePresence>
  );
}

/** กราฟเส้นปวดรายครั้ง: เส้นเทาประ = ก่อนนวด · เส้นเขียว = หลังนวด · แถบระหว่างเส้น = ที่ลดได้จากการนวด */
function PainPairs({ pairs }: { pairs: { id: string; date: string; before: number; after?: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 84;
  const px = 8;
  const py = 5;
  const n = pairs.length;
  const x = (i: number) => (n === 1 ? W / 2 : px + (i / (n - 1)) * (W - px * 2));
  const y = (v: number) => py + (1 - v / 10) * (H - py * 2);
  const curve = (pts: [number, number][]) =>
    pts.reduce((d, [x1, y1], i) => {
      if (!i) return `M${x1},${y1}`;
      const [x0, y0] = pts[i - 1];
      const mx = (x0 + x1) / 2;
      return `${d} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }, "");
  const bPts = pairs.map((p, i) => [x(i), y(p.before)] as [number, number]);
  const aPts = pairs.map((p, i) => [x(i), y(p.after ?? p.before)] as [number, number]);
  const bD = curve(bPts);
  const aD = curve(aPts);
  // แถบระหว่างเส้นก่อน–หลัง
  const band = n > 1 ? `${bD} L${aPts[n - 1][0]},${aPts[n - 1][1]} ${curve([...aPts].reverse()).replace(/^M/, "L")} Z` : "";
  const lastA = pairs[n - 1].after;
  const c = lastA !== undefined ? painColor(lastA) : "#2f9a5b";
  return (
    <div className="pst__line">
      <div ref={ref} className="pst__plot">
        {W > 0 && (
          <svg width={W} height={H} aria-hidden>
            <defs>
              <linearGradient id="pst-band" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2f9a5b" stopOpacity="0.22" />
                <stop offset="1" stopColor="#2f9a5b" stopOpacity="0.06" />
              </linearGradient>
            </defs>
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgb(47 64 52 / 8%)" />
            {band && <path d={band} fill="url(#pst-band)" />}
            <path d={bD} fill="none" stroke="#a7b1aa" strokeWidth="1.8" strokeDasharray="4 3" strokeLinecap="round" />
            <path d={aD} fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
            {n === 1 && <line x1={x(0)} x2={x(0)} y1={bPts[0][1]} y2={aPts[0][1]} stroke="#2f9a5b" strokeWidth="3" opacity="0.3" strokeLinecap="round" />}
            <circle cx={bPts[n - 1][0]} cy={bPts[n - 1][1]} r="3.2" fill="#fff" stroke="#a7b1aa" strokeWidth="1.6" />
            {lastA !== undefined && (
              <>
                <circle cx={aPts[n - 1][0]} cy={aPts[n - 1][1]} r="7" fill={c} opacity="0.16" />
                <circle cx={aPts[n - 1][0]} cy={aPts[n - 1][1]} r="3.6" fill="#fff" stroke={c} strokeWidth="2.2" />
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
