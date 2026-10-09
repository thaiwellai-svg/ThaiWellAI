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
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, CalendarX2, FileHeart, Send, ShoppingBag, Printer, Activity, PenLine, CalendarPlus, Check, HeartPulse, History, Phone, Stethoscope, RotateCcw, UserX, ClipboardList, UserRound, Ticket, CalendarDays } from "lucide-react";
import { useStore } from "../../store/store";
import { Button, EmptyState, ease, useToast } from "../../design-system";
import { stageMeta, creditInfo, courseUsage, coursePrepaid } from "../../data/domain";
import { patientPhoto } from "../../data/avatars";
import { relativeDay, thaiDate, thaiDateShort, todayISO } from "../../data/thaiDate";
import { PhotoPicker } from "../../features/PhotoPicker";
import { PainMini } from "../../features/RecordCards";
import { AIPlanCard, ElementCard } from "../../features/AIPlan";
import { painColor } from "../../features/widgets";
import "../../features/health.css";
import "../../features/patient-health.css";

/** Donut showing used / booked / free sessions of a treatment plan. */

/** Pain trend chart with axis, points and value labels. */
function PainChart({ points }: { points: { date: string; score: number }[] }) {
  const W = 760;
  const H = 160;
  const pad = { l: 26, r: 14, t: 18, b: 26 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => pad.t + (1 - v / 10) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const area = `${d} L${x(points.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  return (
    <svg className="pchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟความปวด">
      <defs>
        <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4c845a" stopOpacity="0.2" />
          <stop offset="1" stopColor="#4c845a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 5, 10].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--sage-100)" strokeDasharray={v ? "3 4" : undefined} />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      <motion.path d={area} fill="url(#pc-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} />
      <motion.path d={d} fill="none" stroke="#4c845a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: ease.out }} />
      {points.map((p, i) => (
        <g key={p.date + i}>
          <motion.circle cx={x(i)} cy={y(p.score)} r="5" fill="#fff" stroke={painColor(p.score)} strokeWidth="3"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.06 }} />
          <text x={x(i)} y={y(p.score) - 11} textAnchor="middle" className="pchart__v">{p.score}</text>
          <text x={x(i)} y={H - 6} textAnchor="middle">{thaiDateShort(p.date)}</text>
        </g>
      ))}
    </svg>
  );
}

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
  const first = h[0]?.score;
  const last = h[h.length - 1]?.score;
  const lastDone = visits.find((v) => v.status === "done");

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

        {/* Quick stats: ป้าย → ตัวเลข → หน่วย */}
        <div className="pd__stats pst">
          {/* รักษาแล้ว */}
          <div className="pst__c" style={{ ["--tc" as string]: "#2f8a52" }}>
            <span className="pst__ico">
              <Check size={14} strokeWidth={2.5} />
            </span>
            <small>รักษาแล้ว</small>
            <b>
              {doneCount}
              <i>ครั้ง</i>
            </b>
            <span className="pst__sub">{lastDone ? `ล่าสุด ${thaiDateShort(lastDone.date)}` : "ยังไม่เคยรักษา"}</span>
          </div>
          {/* ปวด: กราฟแนวโน้ม (ก่อน/หลังนวดทุกครั้ง เรียงตามเวลา) */}
          {(() => {
            const fromVisits = [...visits]
              .reverse()
              .filter((v) => v.status !== "cancelled" && v.painBefore !== undefined)
              .flatMap((v) => (v.painAfter !== undefined ? [v.painBefore!, v.painAfter] : [v.painBefore!]));
            const series = fromVisits.length >= 2 ? fromVisits.slice(-12) : h.length ? h.slice(-12).map((x) => x.score) : fromVisits;
            const now = series[series.length - 1];
            const change = series.length > 1 ? now - series[0] : 0;
            return (
              <div className="pst__c is-pain" style={{ ["--tc" as string]: now === undefined ? "#6b7a71" : painColor(now) }}>
                <span className="pst__ico">
                  <Activity size={14} />
                </span>
                <small>แนวโน้มปวด</small>
                <b>
                  {now ?? "—"}
                  {now !== undefined && <i>/10 ล่าสุด</i>}
                  {change !== 0 && <em className={change < 0 ? "is-good" : "is-bad"}>{change < 0 ? `ลดลง ${-change}` : `เพิ่ม ${change}`}</em>}
                </b>
                {series.length > 1 ? <PainSpark points={series} /> : <span className="pst__sub">{now === undefined ? "ยังไม่ได้ประเมิน" : "ประเมินครั้งเดียว"}</span>}
              </div>
            );
          })()}
          {/* นัดถัดไป: หัวข้อบน (แบบเดียวกับอีก 2 ใบ) · ล่างเป็นนัดแบบรายการนัดที่จะถึง */}
          <button type="button" className="pst__c is-link" style={{ ["--tc" as string]: "#2f6fb3" }} disabled={!upcoming[0]} onClick={() => upcoming[0] && openAppt(upcoming[0].id)}>
            <span className="pst__ico">
              <CalendarDays size={14} />
            </span>
            <small>นัดถัดไป{upcoming[0] ? ` · ${relativeDay(upcoming[0].date)}` : ""}</small>
            {upcoming[0] ? (
              <span className="pst__appt is-first">
                <span className="hx-next__date">
                  <small>{thaiDateShort(upcoming[0].date).split(" ")[1]}</small>
                  <b>{Number(upcoming[0].date.slice(8))}</b>
                </span>
                <span className="pst__appt-body">
                  <b>
                    {upcoming[0].start} น. · {store.serviceById(upcoming[0].serviceId).short}
                  </b>
                  <small>{store.therapistById(upcoming[0].therapistId).name}</small>
                </span>
              </span>
            ) : (
              <>
                <b>—</b>
                <span className="pst__sub">ยังไม่มีนัดล่วงหน้า</span>
              </>
            )}
          </button>
        </div>

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
              {first !== undefined && last !== undefined && h.length > 1 && (
                <em className={last < first ? "is-good" : "is-bad"}>
                  {first} → {last}
                  {last < first ? ` · ดีขึ้น ${Math.round(((first - last) / first) * 100)}%` : ""}
                </em>
              )}
            </h3>
            {h.length > 1 ? <PainChart points={h} /> : <p className="pd2__muted">ยังไม่มีคะแนนปวด</p>}
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
                  <dl className="ptx__stats">
                    <div>
                      <dt>ประเภท</dt>
                      <dd>{p.aiPlan.massageType}</dd>
                    </div>
                    <div>
                      <dt>จำนวน</dt>
                      <dd>{p.aiPlan.sessions} ครั้ง</dd>
                    </div>
                    <div>
                      <dt>ความถี่</dt>
                      <dd>{p.aiPlan.frequency}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="pd2__muted">ให้ AI ร่างแผนจากอาการ แล้วแพทย์อนุมัติ</p>
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
                  {credits ? <em className={credits.remaining <= 1 ? "is-low" : "is-good"}>เหลือ {credits.remaining} ครั้ง</em> : null}
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
                {/* นับจากนัดจริง: ครั้งไหนนับแล้ว/จองไว้ (นับเมื่อบันทึกการรักษา) */}
                {(credits.used > 0 || credits.booked > 0) && (
                  <details className="pd2__more pd2__visits">
                    <summary>ดูรายครั้ง</summary>
                    <ol>
                      {(p.course.base ?? 0) > 0 && (
                        <li>
                          <b>1–{p.course.base}</b>
                          <span>นับไว้ก่อนใช้ระบบ</span>
                          <em className="is-used">ใช้แล้ว</em>
                        </li>
                      )}
                      {[...credits.usedVisits, ...credits.bookedVisits].map((v) => (
                        <li key={v.id}>
                          <b>{credits.noOf(v.id)}</b>
                          <span>
                            {thaiDateShort(v.date)} · {v.start} น.
                          </span>
                          <em className={credits.usedVisits.includes(v) ? "is-used" : "is-booked"}>{credits.usedVisits.includes(v) ? "รักษาแล้ว" : "จองไว้"}</em>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {/* วิธีชำระของคอร์ส: ชำระรายครั้ง หรือ ชำระล่วงหน้า (หักเครดิตทุกครั้ง) */}
                <div className="pd2__bill" role="radiogroup" aria-label="วิธีชำระคอร์ส">
                  {(
                    [
                      ["perVisit", "ชำระรายครั้ง", "จ่ายทุกครั้งที่มา"],
                      ["prepaid", "ชำระล่วงหน้าแล้ว", "หักเครดิตทุกครั้ง"],
                    ] as const
                  ).map(([k, label, sub]) => {
                    const on = (prepaid ? "prepaid" : "perVisit") === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => !on && store.dispatch({ type: "updatePatient", id: p.id, patch: { course: { ...p.course!, billing: k } }, })}
                      >
                        <b>{label}</b>
                        <small>{sub}</small>
                      </button>
                    );
                  })}
                </div>
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

/** กราฟแนวโน้มปวดเล็ก ๆ (คะแนน 0–10 ตามลำดับเวลา) */
function PainSpark({ points }: { points: number[] }) {
  const W = 100;
  const H = 30;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 6) + 3);
  const y = (v: number) => 3 + (1 - v / 10) * (H - 6);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastV = points[points.length - 1];
  const c = painColor(lastV);
  return (
    <svg className="pst__spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="pst-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.22" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`} fill="url(#pst-spark)" />
      <path d={d} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === points.length - 1 ? 3 : 1.8} fill={i === points.length - 1 ? c : "#fff"} stroke={c} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
