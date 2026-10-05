import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, HeartPulse, Stethoscope, TriangleAlert, X, BellRing, Check, CircleCheck, ClipboardCheck, Hourglass, Megaphone, Phone, Play, ReceiptText, Send, Ticket, Undo2, UserX } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Avatar, Badge, Button, Dialog, Drawer, IconButton, Textarea, useToast } from "../design-system";
import { bedName, bedsInUse, creditInfo, stageMeta, stageOf, type Stage } from "../data/domain";
import { baht, timeAgo, thaiDateLong, thaiDateShort, timeRange, todayISO } from "../data/thaiDate";
import type { Appointment, PaymentMethod } from "../data/types";
import { CreditPips, PainScale } from "./widgets";
import { patientPhoto, therapistPhoto } from "../data/avatars";
import { useLatest } from "./useLatest";
import { PayPanel, METHOD_LABEL, makePayment } from "./billing";
import { ReceiptDialog } from "./Receipt";
import { ClinicalRecord, RecSection } from "./ClinicalRecord";
import { intakeAlerts, intakeOfVisit } from "../data/intake";
import { DEFAULT_CALL_VOICE, announce, callText } from "./tts";
import "./visit.css";

export { stageOf, type Stage } from "../data/domain";

const STEPS: { key: Stage; label: string; icon: typeof Play }[] = [
  { key: "waiting", label: "รอรับบริการ", icon: Hourglass },
  { key: "called", label: "เรียกคิว", icon: Megaphone },
  { key: "treating", label: "รับบริการ", icon: Play },
  { key: "assess", label: "บันทึกการรักษา", icon: ClipboardCheck },
  { key: "billing", label: "ชำระเงิน", icon: ReceiptText },
  { key: "done", label: "เสร็จสิ้น", icon: CircleCheck },
];

export const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "");

/** queue number: order of that day's visits */
export function queueNumber(all: Appointment[], a: Appointment) {
  const day = all.filter((x) => x.date === a.date).sort((x, y) => x.start.localeCompare(y.start) || x.id.localeCompare(y.id));
  return `A${String(day.findIndex((x) => x.id === a.id) + 1).padStart(3, "0")}`;
}

export function AppointmentDrawer({
  id,
  onClose,
  onOpenPatient,
  inline,
  onNext,
  onHistory,
  historyOpen,
}: {
  id: string | null;
  onClose: () => void;
  onOpenPatient?: (pid: string) => void;
  inline?: boolean;
  onNext?: (id: string) => void;
  /** inline page: toggle the separate history box */
  onHistory?: () => void;
  historyOpen?: boolean;
}) {
  const store = useStore();
  const toast = useToast();
  const shownId = useLatest(id);
  const appt = store.appointments.find((a) => a.id === shownId);

  const [painAfter, setPainAfter] = useState<number | undefined>();
  const [advice, setAdvice] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [useCredit, setUseCredit] = useState(true);
  // ending far earlier than the service time needs a reason
  const [earlyEnd, setEarlyEnd] = useState<string | null>(null);
  const [received, setReceived] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [bed, setBed] = useState<string | null>(null);

  useEffect(() => {
    setPainAfter(undefined);
    setAdvice("");
    setMethod("cash");
    setUseCredit(true);
    setReceived("");
    setBed(null);
  }, [id]);

  const stage = appt ? stageOf(appt) : "waiting";
  useEffect(() => {
    if (stage !== "treating") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [stage]);

  // the next visit that still needs work today (for "ต่อคนถัดไป")
  const next = useMemo(() => {
    if (!appt) return null;
    return (
      store.appointments
        .filter((a) => a.date === appt.date && a.id !== appt.id && ["waiting", "called", "treating", "assess", "billing"].includes(stageOf(a)))
        .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
    );
  }, [store.appointments, appt]);
  const queueNo = useMemo(() => (appt ? queueNumber(store.appointments, appt) : ""), [store.appointments, appt]);

  if (!appt) return null;
  const p = store.patientById(appt.patientId);
  const s = store.serviceById(appt.serviceId);
  const t = store.therapistById(appt.therapistId);
  const credits = creditInfo(p, store.appointments);
  // a course only pays for its own service
  const coveredByCourse = !!p.course && p.course.serviceId === appt.serviceId && !!credits && credits.total - credits.used > 0;
  const payByCredit = coveredByCourse && useCredit;
  const amount = payByCredit ? 0 : s.price;
  const cash = Number(received) || 0;

  const nowIso = () => new Date().toISOString();
  /** apply a patch, log it, and offer undo */
  const step = (patch: Partial<Appointment>, label: string, msg = label) => {
    const prev = appt;
    store.dispatch({ type: "updateAppointment", id: appt.id, patch, log: label });
    toast({ message: msg, action: { label: "เลิกทำ", onClick: () => store.dispatch({ type: "restoreAppointment", appointment: prev }) } });
  };

  const call = (again = false) => {
    void announce(callText(queueNo, p.name), store.settings.callVoice ?? DEFAULT_CALL_VOICE).then((how) => {
      if (how === "device") toast({ message: "เชื่อมต่อเสียงเรียกคิวไม่ได้ · ใช้เสียงของเครื่องแทน", tone: "danger" });
    });
    step({ calledAt: nowIso() }, again ? `เรียกคิว ${queueNo} ซ้ำ` : `เรียกคิว ${queueNo}`);
  };

  const elapsed = appt.startedAt ? Math.max(0, Math.floor((now - Date.parse(appt.startedAt)) / 1000)) : 0;
  const endTreatment = (reason?: string) => {
    step({ endedAt: nowIso() }, `จบการรักษา · ${Math.max(1, Math.round(elapsed / 60))} นาที${reason ? ` (ก่อนเวลา: ${reason})` : ""}`);
    setEarlyEnd(null);
  };
  const pct = Math.min(1, elapsed / (s.minutes * 60));
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const pay = () => {
    const m: PaymentMethod = payByCredit ? "credit" : method;
    const payment = makePayment(store.appointments, m, amount, m === "cash" ? cash : undefined);
    if (m !== "app" && store.settings.autoSendSlip) payment.slipSentAt = new Date().toISOString();
    if (m === "app") step({ status: "done", paid: false, payment }, `ส่งบิล ${baht(amount)} บาท ไปแอป ThaiWell AI`, `ส่งบิลให้ ${p.name} ในแอปแล้ว`);
    else {
      step({ status: "done", paid: true, payment }, m === "credit" ? "หักเครดิตคอร์ส 1 ครั้ง" : `รับชำระ ${METHOD_LABEL[m]} ${baht(amount)} บาท`, store.settings.autoSendSlip ? "ชำระเงินเรียบร้อย · ส่งสลิปเข้าแอป ThaiWell AI แล้ว" : "ชำระเงินเรียบร้อย · เสร็จการรักษา");
      setReceipt(appt.id);
    }
  };

  let footer: React.ReactNode = null;
  if (stage === "waiting")
    footer = (
      <>
        <Button variant="outline" size="lg" leading={<UserX size={16} />} onClick={() => step({ status: "absent" }, "ไม่มาตามนัด", `บันทึก ${p.name} ไม่มาตามนัด`)}>
          ไม่มา
        </Button>
        <Button size="lg" fill leading={<Megaphone size={16} />} onClick={() => call()}>
          เรียกคิว
        </Button>
      </>
    );
  else if (stage === "called")
    footer = (
      <>
        <Button variant="outline" size="lg" leading={<BellRing size={16} />} onClick={() => call(true)}>
          เรียกซ้ำ
        </Button>
        <Button
          size="lg"
          fill
          disabled={!bed}
          leading={<Play size={16} />}
          onClick={() => step({ status: "active", startedAt: nowIso(), bedId: bed! }, `เริ่มรับบริการ · ${bedName(store.settings, bed!)} · ${t.name}`)}
        >
          {bed ? `เริ่ม · ${bed}` : "เลือกเตียง"}
        </Button>
      </>
    );
  else if (stage === "treating")
    footer = (
      <Button size="lg" fill leading={<ClipboardCheck size={16} />} onClick={() => (elapsed < s.minutes * 30 ? setEarlyEnd("") : endTreatment())}>
        จบการรักษา
      </Button>
    );
  else if (stage === "assess")
    footer = (
      <Button size="lg" fill disabled={painAfter === undefined || !(appt.diagnoses?.length && appt.procedures?.length)} leading={<Check size={16} />} onClick={() => step({ painAfter, advice: advice.trim() || undefined }, `บันทึกการรักษา · Pain ${appt.painBefore} → ${painAfter}`)}>
        บันทึก
      </Button>
    );
  else if (stage === "billing")
    footer = (
      <Button size="lg" fill disabled={!payByCredit && method === "cash" && cash < amount} leading={payByCredit ? <Ticket size={16} /> : method === "app" ? <Send size={16} /> : <Check size={16} />} onClick={pay}>
        {payByCredit ? "หักเครดิต" : method === "app" ? "ส่งบิล" : method === "promptpay" ? "รับเงินแล้ว" : "รับเงิน"}
      </Button>
    );
  else if (stage === "done" && appt.payment?.status === "pending")
    footer = (
      <Button size="lg" fill leading={<Check size={16} />} onClick={() => step(
            { paid: true, payment: { ...appt.payment!, status: "paid", at: nowIso(), slipSentAt: store.settings.autoSendSlip ? nowIso() : undefined } },
            store.settings.autoSendSlip ? "ผู้ป่วยชำระผ่านแอปแล้ว · ส่งสลิปอัตโนมัติ" : "ผู้ป่วยชำระผ่านแอปแล้ว",
          )}>
        ได้รับเงินแล้ว
      </Button>
    );
  else if (stage === "done" && !appt.paid)
    footer = (
      <Button size="lg" fill leading={<ReceiptText size={16} />} onClick={() => step({ status: "active", endedAt: appt.endedAt ?? nowIso(), painAfter: appt.painAfter ?? appt.painBefore }, "เปิดบิลชำระเงิน")}>
        รับชำระเงิน
      </Button>
    );
  else if (stage === "done")
    footer = (
      <Button variant="outline" size="lg" fill leading={<ReceiptText size={16} />} onClick={() => setReceipt(appt.id)}>
        สลิป
      </Button>
    );
  else if (stage === "absent" || stage === "cancelled")
    footer = (
      <Button variant="outline" size="lg" fill leading={<Undo2 size={16} />} onClick={() => step({ status: "waiting", calledAt: undefined }, "ย้อนเป็นรอรับบริการ")}>
        ย้อนกลับ
      </Button>
    );

  const stepIdx = STEPS.findIndex((x) => x.key === stage);
  // when each step happened — shown right under the stepper instead of a separate log
  const stepTime: Partial<Record<Stage, string>> = {
    called: appt.calledAt,
    treating: appt.startedAt,
    assess: appt.endedAt,
    billing: appt.painAfter !== undefined ? appt.log?.find((l) => (l.label.startsWith("บันทึกการรักษา") || l.label.startsWith("ประเมินผล")))?.at : undefined,
    done: appt.payment?.at,
  };

  return (
    <>
      <Frame
        inline={inline}
        open={id !== null}
        onClose={onClose}
        leading={<Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" ring={stageMeta(appt).color} pulse={stage === "treating"} />}
        title={p.name}
        subtitle={`${p.hn} · ${p.gender} ${p.age} ปี · ${appt.type === "walkin" ? "Walk-in" : "นัดล่วงหน้า"}`}
        footer={footer}
      >
        <div className="vs">
          <section className="vs__summary">
            <div className="vs__q">
              <small>คิว</small>
              <b>{queueNo}</b>
            </div>
            <div className="vs__when">
              <b>{timeRange(appt.start, s.minutes)} น.</b>
              <small>{thaiDateLong(appt.date)}</small>
            </div>
            {p.phone && (
              <a className="vs__call" href={`tel:${p.phone}`} aria-label={`โทร ${p.phone}`}>
                <Phone size={16} />
              </a>
            )}
            {(onHistory || onOpenPatient) && (
              <button
                type="button"
                className={clsx("vs__hbtn", onHistory && historyOpen && "is-on")}
                aria-pressed={!!(onHistory && historyOpen)}
                onClick={() => (onHistory ? onHistory() : onOpenPatient!(p.id))}
                aria-label="ข้อมูลสุขภาพ"
                title={onHistory && historyOpen ? "ซ่อนข้อมูลสุขภาพ" : "ดูข้อมูลสุขภาพ"}
              >
                <HeartPulse size={16} />
              </button>
            )}
          </section>
          <div className="vs__facts">
            <span>
              <small>บริการ</small>
              <b>{s.name}</b>
            </span>
            <span className="vs__who">
              <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
              <span>
                <small>ผู้บำบัด</small>
                <b>{t.name}</b>
              </span>
            </span>
            <span>
              <small>ค่าบริการ</small>
              <b>{baht(s.price)} ฿</b>
            </span>
          </div>

          {stepIdx >= 0 ? (
            <ol className="vs__steps">
              {STEPS.map((x, i) => (
                <li key={x.key} className={clsx(i < stepIdx && "is-done", i === stepIdx && "is-now")}>
                  <span className="vs__dot">{i < stepIdx ? <Check size={13} strokeWidth={3} /> : <x.icon size={13} strokeWidth={2.2} />}</span>
                  <small>{x.label}</small>
                  {stepTime[x.key] && <time>{clock(stepTime[x.key])}</time>}
                </li>
              ))}
            </ol>
          ) : (
            <div className="alert alert--stop">
              <UserX size={16} />
              <div>
                <b>{stage === "absent" ? "ไม่มารับบริการ" : "ยกเลิกนัด"}</b>
                ย้อนกลับได้ถ้าผู้ป่วยมาถึงแล้ว
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.section key={stage} className="vs__panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              {(stage === "waiting" || stage === "called") && (
                <>
                  <StepHead
                    n={stage === "waiting" ? 1 : 2}
                    title={stage === "waiting" ? "เรียกคิวผู้ป่วย" : `เลือกเตียงแล้วเริ่มรับบริการ`}
                    hint={stage === "waiting" ? `ผู้ป่วยมาถึงแล้ว กด “เรียกคิว” ระบบจะประกาศเสียงเรียก ${queueNo}` : `เรียกคิวแล้ว ${clock(appt.calledAt)} น. · เลือกเตียงที่ผู้ป่วยเข้ารับบริการ`}
                  />
                  {stage === "called" && <BedPicker date={appt.date} self={appt.id} value={bed} onChange={setBed} />}
                  <PainLine v={appt.painBefore} />
                </>
              )}
              {stage === "treating" && (
                <>
                  <StepHead n={3} title="กำลังรับบริการ" hint={`${appt.bedId ? bedName(store.settings, appt.bedId) + " · " : ""}ครบเวลาแล้วกด “จบการรักษา” เพื่อไปบันทึกการรักษา`} />
                  <div className="vs__timer">
                    <b>{mmss}</b>
                    <small>
                      จาก {s.minutes} นาที · เริ่ม {clock(appt.startedAt)} น.
                    </small>
                    <i>
                      <motion.i animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.6 }} />
                    </i>
                  </div>
                </>
              )}
              {stage === "assess" && (
                <>
                  <StepHead n={4} title="บันทึกการรักษา" todo={[
                    { done: painAfter !== undefined, label: "Pain Score หลังนวด" },
                    { done: !!appt.diagnoses?.length, label: "วินิจฉัย" },
                    { done: !!appt.procedures?.length, label: "หัตถการ" },
                  ]} />
                  <div className="rs-stack">
                    <RecSection n={1} title="ความปวดหลังนวด" hint={`ก่อนนวด ${appt.painBefore}/10 · ให้ผู้ป่วยเลือก`} done={painAfter !== undefined}>
                      <PainScale value={painAfter} onChange={setPainAfter} />
                      {painAfter !== undefined && (
                        <p className={clsx("vs__delta", painAfter < appt.painBefore && "is-good")}>
                          {painAfter < appt.painBefore
                            ? `ลดลง ${appt.painBefore - painAfter} ระดับ (${Math.round(((appt.painBefore - painAfter) / Math.max(1, appt.painBefore)) * 100)}%)`
                            : painAfter === appt.painBefore
                              ? "เท่าเดิม"
                              : "ปวดมากขึ้น — ควรแจ้งแพทย์"}
                        </p>
                      )}
                    </RecSection>
                    <ClinicalRecord appt={appt} embedded />
                    <RecSection n={4} title="คำแนะนำถึงผู้ป่วย" hint="ไม่บังคับ · ส่งไปแอป ThaiWell AI" done={!!advice.trim()}>
                      <Textarea value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="เช่น ประคบร้อนที่บ่าวันละ 15 นาที · ท่าฤาษีดัดตนแก้ลมปลายปัตคาด" />
                    </RecSection>
                  </div>
                </>
              )}
              {stage === "billing" && (
                <>
                <StepHead n={5} title="ชำระเงิน" hint="เลือกวิธีชำระ แล้วกดยืนยันที่ปุ่มมุมขวาบน" />
                <PayPanel
                  serviceName={s.name}
                  price={s.price}
                  course={coveredByCourse ? { name: p.course!.name, left: credits!.total - credits!.used, total: credits!.total } : null}
                  useCredit={useCredit}
                  setUseCredit={setUseCredit}
                  method={method}
                  setMethod={setMethod}
                  received={received}
                  setReceived={setReceived}
                  patientName={p.name}
                  courseNote={p.course && !coveredByCourse && credits && credits.total - credits.used > 0 ? `คอร์ส${p.course.name}ใช้กับบริการนี้ไม่ได้ · ชำระรายครั้ง` : undefined}
                />
                </>
              )}
              {stage === "done" && (
                <>
                  <StepHead n={6} title="เสร็จการรักษา" hint={appt.paid ? "เรียบร้อยทุกขั้นแล้ว" : "รักษาเสร็จแล้ว แต่ยังค้างชำระ"} />
                  <div className="vs__result">
                    <span>
                      <small>Pain Score</small>
                      <b>
                        {appt.painBefore} → {appt.painAfter ?? "–"}
                      </b>
                    </span>
                    <span>
                      <small>การชำระเงิน</small>
                      {appt.payment ? (
                        <Badge tone={appt.payment.status === "paid" ? "success" : "warning"} compact>
                          {appt.payment.status === "paid" ? METHOD_LABEL[appt.payment.method] : "รอชำระในแอป"}
                        </Badge>
                      ) : (
                        <Badge tone={appt.paid ? "success" : "danger"} compact>
                          {appt.paid ? "ชำระแล้ว" : "ค้างชำระ"}
                        </Badge>
                      )}
                    </span>
                    <span>
                      <small>ยอด</small>
                      <b>{baht(appt.payment?.amount ?? s.price)} ฿</b>
                    </span>
                  </div>
                  {appt.advice && <p className="vs__advice">“{appt.advice}”</p>}
                  {onNext && next && appt.paid && (
                    <button type="button" className="vs__next" onClick={() => onNext(next.id)}>
                      <span>
                        <small>ต่อคนถัดไป</small>
                        <b>
                          {next.start} · {store.patientById(next.patientId).name}
                        </b>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                </>
              )}
            </motion.section>
          </AnimatePresence>

          {(stage === "billing" || stage === "done") && <ClinicalRecord appt={appt} locked />}

          {credits && <CreditPips info={credits} name={p.course!.name} />}

          <section className="vs__ctx">
            {(() => {
              const ik = intakeOfVisit(appt, p);
              const al = ik ? intakeAlerts(ik, store.settings.bpThreshold) : [];
              const pb = appt.painBefore;
              const tc = pb >= 7 ? "#d8392a" : pb >= 4 ? "#e08a1e" : "#2f9a5b";
              return (
                <div className="vcc">
                  <div className="vcc__head">
                    <span className="vcc__icon">
                      <Stethoscope size={15} />
                    </span>
                    <b>อาการสำคัญ</b>
                    {ik && <small>จากแอป · {timeAgo(ik.at)}</small>}
                  </div>
                  <p className="vcc__text">{ik?.complaint ?? p.complaint}</p>

                  <div className="vcc__facts">
                    <div style={{ ["--tc" as string]: tc }}>
                      <small>Pain ก่อนนวด</small>
                      <b>
                        {pb}
                        <i>/10</i>
                      </b>
                      <span className="vcc__bar">
                        {Array.from({ length: 10 }, (_, k) => (
                          <em key={k} className={k < pb ? "on" : undefined} />
                        ))}
                      </span>
                    </div>
                    {ik ? (
                      <div>
                        <small>เป็นมา</small>
                        <b className="vcc__dur">{ik.duration.replace(/^ประมาณ\s*/, "")}</b>
                        <span className="vcc__sub">ต้องการ{ik.goal}</span>
                      </div>
                    ) : (
                      <div>
                        <small>มาแบบ</small>
                        <b className="vcc__dur">{appt.type === "booked" ? "นัดล่วงหน้า" : "Walk-in"}</b>
                        <span className="vcc__sub">ไม่มีแบบประเมินจากแอป</span>
                      </div>
                    )}
                  </div>

                  {ik && (ik.focusAreas.length > 0 || ik.avoidAreas.length > 0) && (
                    <div className="vcc__row">
                      <small>ตำแหน่ง</small>
                      <span>
                        {ik.focusAreas.map((x) => (
                          <em key={x} className="is-focus">
                            {x}
                          </em>
                        ))}
                        {ik.avoidAreas.map((x) => (
                          <em key={x} className="is-avoid" title="ไม่ต้องการให้นวด">
                            <Ban size={11} /> {x}
                          </em>
                        ))}
                      </span>
                    </div>
                  )}
                  <div className="vcc__row">
                    <small>โรคประจำตัว</small>
                    <span>
                      {p.conditions.length ? (
                        p.conditions.map((c) => (
                          <em key={c} className="is-cond">
                            {c}
                          </em>
                        ))
                      ) : (
                        <em>ไม่มี</em>
                      )}
                    </span>
                  </div>

                  {(p.allergies?.length ?? 0) > 0 && (
                    <div className="vcc__row">
                      <small>แพ้</small>
                      <span>
                        {p.allergies!.map((x) => (
                          <em key={x} className="is-allergy">
                            <TriangleAlert size={11} /> {x}
                          </em>
                        ))}
                      </span>
                    </div>
                  )}
                  {al.length > 0 && (
                    <ul className="vcc__alerts">
                      {al.map((x) => (
                        <li key={x.label} className={`is-${x.level}`}>
                          <TriangleAlert size={13} /> {x.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </section>

          {(appt.log?.length ?? 0) > 0 && (
            <section className="vs__log">
              <h3 className="sec__title">บันทึกการรับบริการ</h3>
              <ol>
                {appt.log!.map((l, i) => (
                  <li key={i}>
                    <time>{clock(l.at)}</time>
                    <span>{l.label}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </Frame>
      <Dialog
        open={earlyEnd !== null}
        onClose={() => setEarlyEnd(null)}
        title="จบการรักษาก่อนเวลา?"
        subtitle={`รับบริการไปแล้ว ${Math.max(1, Math.round(elapsed / 60))} จาก ${s.minutes} นาที`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEarlyEnd(null)}>
              ทำต่อ
            </Button>
            <Button variant="danger" disabled={!earlyEnd?.trim()} onClick={() => endTreatment(earlyEnd!.trim())}>
              ยืนยันจบการรักษา
            </Button>
          </>
        }
      >
        <p className="early__hint">เวลาที่ใช้น้อยกว่าครึ่งของบริการ ระบุเหตุผลเพื่อบันทึกไว้ในประวัติการรับบริการ</p>
        <div className="early__chips">
          {["ผู้ป่วยขอหยุด", "มีอาการผิดปกติ", "ผู้ป่วยมีธุระด่วน", "กดเริ่มผิดเวลา"].map((r) => (
            <button key={r} type="button" aria-pressed={earlyEnd === r} onClick={() => setEarlyEnd(r)}>
              {r}
            </button>
          ))}
        </div>
        <Textarea value={earlyEnd ?? ""} onChange={(e) => setEarlyEnd(e.target.value)} placeholder="หรือพิมพ์เหตุผล…" />
      </Dialog>
      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}

function PainLine({ v }: { v: number }) {
  return (
    <div className="vs__pain">
      <small>Pain Score ก่อนรับบริการ</small>
      <div>
        <b>
          {v}
          <small>/10</small>
        </b>
        <i>
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className={i < v ? `is-on p${i}` : undefined} />
          ))}
        </i>
      </div>
    </div>
  );
}

/** rooms → beds; beds with a session in progress are taken */
function BedPicker({ date, self, value, onChange }: { date: string; self: string; value: string | null; onChange: (id: string) => void }) {
  const store = useStore();
  const used = bedsInUse(store.appointments, date, self);
  return (
    <div className="vs__rooms">
      {(store.settings.rooms ?? []).map((r) => (
        <div key={r.id} className="vs__room">
          <small>{r.name}</small>
          <div>
            {r.beds.map((b) => {
              const who = used.get(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className="vs__bedbtn"
                  aria-pressed={value === b.id}
                  disabled={!!who}
                  title={who ? `ใช้อยู่: ${store.patientById(who.patientId).name}` : b.name}
                  onClick={() => onChange(b.id)}
                >
                  <b>{b.id}</b>
                  <small>{who ? "ไม่ว่าง" : "ว่าง"}</small>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** the visit UI either slides in as a drawer, or sits inline as the big pane of the รับบริการ page */
function Frame(props: { inline?: boolean; open: boolean; onClose: () => void; leading: React.ReactNode; title: string; subtitle: string; footer: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  const { inline, children, aside, ...rest } = props;
  if (!inline) return <Drawer {...rest}>{children}</Drawer>;
  return (
    <div className="vsp">
      <header className="vsp__head">
        {props.leading}
        <div className="vsp__id">
          <h2>{props.title}</h2>
          <p>{props.subtitle}</p>
        </div>
        {props.footer && <div className="vsp__actions">{props.footer}</div>}
      </header>
      <div className="vsp__main">
        <div className="vsp__body scroll-y scroll-y--light">{children}</div>
        <AnimatePresence>
          {aside && (
            <motion.aside className="vsp__aside" initial={{ width: 0, opacity: 0 }} animate={{ width: 380, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
              {aside}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** "ขั้นที่ n/6" header with a short hint or a checklist of what this step needs */
function StepHead({ n, title, hint, todo }: { n: number; title: string; hint?: string; todo?: { done: boolean; label: string }[] }) {
  return (
    <div className="vs__stephead">
      <span className="vs__stepno">
        ขั้นที่ {n}
        <small>/6</small>
      </span>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {todo && (
        <ul className="vs__todo">
          {todo.map((t) => (
            <li key={t.label} className={t.done ? "is-done" : undefined}>
              <i>{t.done ? <Check size={11} strokeWidth={3.2} /> : null}</i>
              {t.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** past visits as rows — to read alongside while recording this one */
export function HistoryPanel({ patientId, current, onClose }: { patientId: string; current: string; onClose: () => void }) {
  const store = useStore();
  const visits = store.appointments
    .filter((a) => a.patientId === patientId && a.id !== current && a.status !== "cancelled")
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const done = visits.filter((a) => a.status === "done");
  const avgDrop = done.filter((a) => a.painAfter !== undefined).reduce((n, a, _, arr) => n + (a.painBefore - a.painAfter!) / arr.length, 0);
  return (
    <div className="hp">
      <div className="hp__head">
        <div>
          <b>ประวัติการรับบริการ</b>
          <small>
            {done.length} ครั้ง{done.length ? ` · Pain ลดเฉลี่ย ${avgDrop.toFixed(1)}` : ""}
          </small>
        </div>
        <IconButton label="ปิด" variant="soft" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="hp__list scroll-y scroll-y--light">
        {visits.map((a) => {
          const s = store.serviceById(a.serviceId);
          const t = store.therapistById(a.therapistId);
          const meta = stageMeta(a);
          return (
            <div key={a.id} className={clsx("hp__row", a.date >= todayISO() && "is-upcoming")}>
              <div className="hp__date">
                <b>{thaiDateShort(a.date)}</b>
                <small>{a.start} น.</small>
              </div>
              <div className="hp__body">
                <div className="hp__top">
                  <b>{s.short}</b>
                  <span className={`hp__tag is-${meta.tone}`}>{meta.label}</span>
                </div>
                <small>
                  {t.name}
                  {a.bedId ? ` · เตียง ${a.bedId}` : ""}
                </small>
                {a.painAfter !== undefined && (
                  <span className="hp__pain">
                    Pain {a.painBefore} → <b>{a.painAfter}</b>
                  </span>
                )}
                {(a.diagnoses?.length ?? 0) > 0 && (
                  <p>
                    <em>วินิจฉัย</em> {a.diagnoses!.map((d) => d.name).join(" · ")}
                  </p>
                )}
                {(a.procedures?.length ?? 0) > 0 && (
                  <p>
                    <em>หัตถการ</em> {a.procedures!.map((x) => x.name + (x.area ? ` (${x.area})` : "")).join(" · ")}
                  </p>
                )}
                {a.advice && <p className="hp__advice">“{a.advice}”</p>}
              </div>
            </div>
          );
        })}
        {visits.length === 0 && <p className="tw-meta">ยังไม่มีประวัติ — มารับบริการครั้งแรก</p>}
      </div>
    </div>
  );
}
