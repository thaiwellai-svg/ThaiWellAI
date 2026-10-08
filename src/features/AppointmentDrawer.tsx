import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScanLine, ArrowRight, Activity, CalendarClock, Hand, History, Leaf, Smartphone, Ban, BotMessageSquare, CalendarX2, ShieldAlert, HeartPulse, Stethoscope, TriangleAlert, BellRing, Check, CircleCheck, ClipboardCheck, Hourglass, Megaphone, Phone, Play, ReceiptText, Send, Ticket, Undo2, UserX } from "lucide-react";
import { LIVE } from "../data/mode";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Avatar, Button, Dialog, Drawer, Field, Input, Textarea, useToast } from "../design-system";
import { bedName, bedsInUse, coursePrepaid, creditInfo, evaluateScreening, stageMeta, stageOf, type Stage } from "../data/domain";
import { baht, timeAgo, thaiDateShort, timeRange, todayISO } from "../data/thaiDate";
import type { Appointment, PaymentMethod } from "../data/types";
import { CreditPips, PainScale } from "./widgets";
import { patientPhoto, therapistPhoto } from "../data/avatars";
import { useLatest } from "./useLatest";
import { AssessHistory } from "./AssessHistory";
import { AppGuideCard } from "./AppGuideCard";
import { PayPanel, METHOD_LABEL, extraLines, makePayment, unpricedProcs } from "./billing";
import { ReceiptDialog } from "./Receipt";
import { MoreMenu } from "./MoreMenu";
import { CoursePayChoice, PrepayCourseDialog } from "./PrepayCourse";
import { VisitSummary } from "./VisitSummary";
import { ClinicalRecord, FindingsField, RecSection } from "./ClinicalRecord";
import { RECORD_DRAFT, RECORD_SAVE, VOICE_FILL, VoiceNote, type VoiceFill } from "./VoiceNote";
import { intakeAlerts, intakeOfVisit, visitAssessment } from "../data/intake";
import { DEFAULT_CALL_VOICE, announce, callText } from "./tts";
import "./visit.css";
import "./visit-head.css";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
import { VisitScreening } from "./ScreeningAlert";
import { CancelDialog } from "./CancelDialog";
import { deductStock } from "./stock";
import { screeningFlags } from "../data/counterScreening";

export { stageOf, type Stage } from "../data/domain";

const STEPS: { key: Stage; label: string; icon: typeof Play }[] = [
  // ใช้งานจริง: ผู้ป่วยต้องเช็กอิน (สแกน QR ที่เคาน์เตอร์ / เช็กอินที่เคาน์เตอร์) ก่อนได้เลขคิว
  ...(LIVE ? [{ key: "checkin" as Stage, label: "เช็กอิน", icon: ScanLine }] : []),
  { key: "waiting", label: "รอรับบริการ", icon: Hourglass },
  { key: "called", label: "เรียกคิว", icon: Megaphone },
  { key: "treating", label: "รับบริการ", icon: Play },
  { key: "assess", label: "บันทึกการรักษา", icon: ClipboardCheck },
  { key: "billing", label: "ชำระเงิน", icon: ReceiptText },
  { key: "done", label: "เสร็จสิ้น", icon: CircleCheck },
];

export const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "");

/** queue number: order of that day's visits */
/** เลขคิวเช็กอินถัดไปของวันนั้น (Q001, Q002, …) */
export function nextCheckinQueue(all: Appointment[], date: string) {
  const last = Math.max(0, ...all.filter((x) => x.date === date && x.checkinQueue).map((x) => Number(x.checkinQueue!.slice(1)) || 0));
  return `Q${String(last + 1).padStart(3, "0")}`;
}

export function queueNumber(all: Appointment[], a: Appointment) {
  // เช็กอินแล้ว → เลขคิวตามลำดับที่มาถึง · ใช้งานจริงยังไม่เช็กอิน = ยังไม่มีคิว
  if (a.checkinQueue) return a.checkinQueue;
  if (LIVE) return "";
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
  onVoice,
  voiceOpen,
  startPay,
}: {
  id: string | null;
  onClose: () => void;
  onOpenPatient?: (pid: string) => void;
  inline?: boolean;
  onNext?: (id: string) => void;
  /** inline page: toggle the separate history box */
  onHistory?: () => void;
  historyOpen?: boolean;
  /** opens the voice-summary side panel (visits page) */
  onVoice?: (open?: boolean) => void;
  voiceOpen?: boolean;
  /** เปิดจากปุ่ม "รับชำระ" (หน้าคิดเงิน) → นัดที่เสร็จแล้วแต่ค้างชำระ เปิดหน้าชำระเงินทันที */
  startPay?: boolean;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const shownId = useLatest(id);
  const appt = store.appointments.find((a) => a.id === shownId);

  const [painAfter, setPainAfter] = useState<number | undefined>();
  /** ข้ามการประเมินความปวดหลังนวด (ไม่บังคับ) */
  const [skipPain, setSkipPain] = useState(false);
  const [advice, setAdvice] = useState("");
  // the voice summary (side panel or inline) fills these drafts
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<VoiceFill>).detail;
      if (d.apptId !== id) return;
      if (d.clear) {
        setPainAfter(undefined);
        setAdvice("");
        return;
      }
      if (d.painAfter !== undefined) {
        setPainAfter(d.painAfter);
        setSkipPain(false);
      }
      if (d.skipPain) {
        setPainAfter(undefined);
        setSkipPain(true);
      }
      if (d.advice) setAdvice(d.advice);
    };
    window.addEventListener(VOICE_FILL, on);
    return () => window.removeEventListener(VOICE_FILL, on);
  }, [id]);
  // the chat's summary card can save the record (same as the footer button)
  const saveRecord = useRef<(() => void) | null>(null);
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<VoiceFill>).detail.apptId === id && saveRecord.current?.();
    window.addEventListener(RECORD_SAVE, on);
    return () => window.removeEventListener(RECORD_SAVE, on);
  }, [id]);
  // …and tell the chat what the form holds now
  useEffect(() => {
    if (id) window.dispatchEvent(new CustomEvent<VoiceFill>(RECORD_DRAFT, { detail: { apptId: id, painAfter, advice, skipPain } }));
  }, [id, painAfter, advice, skipPain]);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [useCredit, setUseCredit] = useState(true);
  const [prepayOpen, setPrepayOpen] = useState(false);
  const [logAll, setLogAll] = useState(false);
  // ending far earlier than the service time needs a reason
  const [earlyEnd, setEarlyEnd] = useState<string | null>(null);
  /** จบก่อนเวลา: done = รักษาครบตามแผนแล้ว (เสร็จเร็ว) · stop = หยุดกลางคัน (ต้องมีเหตุผล) */
  const [earlyMode, setEarlyMode] = useState<"done" | "stop">("done");
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
  // reaching the treatment-record step opens the voice-summary panel once per visit
  const [autoVoiceFor, setAutoVoiceFor] = useState<string | null>(null);
  useEffect(() => {
    if (!onVoice || stage !== "assess" || !appt || autoVoiceFor === appt.id) return;
    setAutoVoiceFor(appt.id);
    onVoice(true);
  }, [stage, appt, onVoice, autoVoiceFor]);
  const [cancelling, setCancelling] = useState(false);
  // นัดเสร็จแล้วแต่ยังค้างชำระ → เปิดหน้าชำระเงินในหน้านี้ โดยไม่ย้อนสถานะนัด
  const [payNow, setPayNow] = useState(false);
  useEffect(() => setPayNow(!!startPay), [id, startPay]);
  // a contraindication found at today's screening must be cleared by a Thai traditional doctor before the massage starts
  const [override, setOverride] = useState(false);
  const [overrideBy, setOverrideBy] = useState("");
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
        .filter((a) => a.date === appt.date && a.id !== appt.id && ["checkin", "waiting", "called", "treating", "assess", "billing"].includes(stageOf(a)))
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
  // คอร์สชำระรายครั้ง → จ่ายทุกครั้ง (ไม่มีหักเครดิต) · คอร์สจ่ายล่วงหน้า → หักเครดิตได้
  const prepaid = coursePrepaid(p, store.biz.sales);
  // ครั้งที่ของนัดนี้ในคอร์ส (นับตั้งแต่บันทึกการรักษา) → อยู่ในจำนวนครั้งของคอร์ส = หักเครดิตได้
  const courseNo = credits && p.course?.serviceId === appt.serviceId ? credits.noOf(appt.id) : 0;
  const coveredByCourse = prepaid && !!credits && courseNo > 0 && courseNo <= credits.total;
  const perVisitCourse = !prepaid && !!p.course && p.course.serviceId === appt.serviceId;
  // คอร์สที่ยังไม่เลือกวิธีชำระ → เลือกตอนชำระครั้งแรก (รายครั้ง / ทั้งคอร์สล่วงหน้า)
  const payUndecided = LIVE && !!p.course && !p.course.billing && p.course.serviceId === appt.serviceId && courseNo > 0 && courseNo <= (credits?.total ?? 0) && !store.biz.sales.some((x) => x.patientId === p.id && !x.void);
  const payByCredit = coveredByCourse && useCredit;
  // ค่าบริการ + หัตถการที่ทำเพิ่ม · หักเครดิตคอร์ส = หักเฉพาะค่าบริการ (หัตถการเพิ่มยังต้องจ่าย)
  const extras = extraLines(appt);
  const extraSum = extras.reduce((n, l) => n + l.amount, 0);
  const amount = (payByCredit ? 0 : s.price) + extraSum;
  const unpriced = unpricedProcs(appt).length;
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
      if (how === "device") toast({ message: "ใช้เสียงเรียกคิวของเครื่องแทน", tone: "danger" });
    });
    step({ calledAt: nowIso() }, again ? `เรียกคิว ${queueNo} ซ้ำ` : `เรียกคิว ${queueNo}`);
  };

  const elapsed = appt.startedAt ? Math.max(0, Math.floor((now - Date.parse(appt.startedAt)) / 1000)) : 0;
  const endTreatment = (reason?: string, mode?: "done" | "stop") => {
    const mins = `${Math.max(1, Math.round(elapsed / 60))} นาที`;
    const label =
      mode === "done" ? `เสร็จการรักษาก่อนเวลา · ${mins}${reason ? ` (${reason})` : ""}` : mode === "stop" ? `หยุดการรักษาก่อนเวลา · ${mins} (${reason})` : `จบการรักษา · ${mins}`;
    step({ endedAt: nowIso() }, label);
    setEarlyEnd(null);
  };
  const pct = Math.min(1, elapsed / (s.minutes * 60));
  const usedMin = Math.max(1, Math.round(elapsed / 60));
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const pay = () => {
    // เครดิตคอร์สจ่ายค่าบริการ · มีหัตถการเพิ่ม → จ่ายส่วนนั้นด้วยวิธีที่เลือก
    const m: PaymentMethod = payByCredit && !extraSum ? "credit" : method;
    const payment = makePayment(store.appointments, m, amount, m === "cash" ? cash : undefined);
    payment.items = [{ name: s.name, amount: s.price }, ...extras.map((l) => ({ name: l.name, amount: l.amount }))];
    if (payByCredit && extraSum) payment.credit = true;
    if (m !== "app" && store.settings.autoSendSlip) payment.slipSentAt = new Date().toISOString();
    if (m === "app") step({ status: "done", paid: false, payment }, `ส่งบิล ${baht(amount)} บาท เข้าแอป ThaiWell${payment.credit ? " (หักเครดิตค่าบริการแล้ว เก็บเฉพาะหัตถการเพิ่ม)" : ""}`, "ส่งบิลเข้าแอปแล้ว");
    else {
      step({ status: "done", paid: true, payment }, m === "credit" ? "หักเครดิตคอร์ส 1 ครั้ง" : `${payment.credit ? "หักเครดิตคอร์ส 1 ครั้ง · " : ""}รับชำระ ${METHOD_LABEL[m]} ${baht(amount)} บาท${extraSum ? ` (รวมหัตถการเพิ่ม ${baht(extraSum)})` : ""}`, store.settings.autoSendSlip ? "รับชำระแล้ว · ส่งใบเสร็จเข้าแอปแล้ว" : "รับชำระแล้ว");
      setReceipt(appt.id);
    }
  };

  const scrToday = p.screening && p.screening.at.slice(0, 10) === todayISO() ? p.screening : undefined;
  // เหมือน VisitScreening: คัดกรองที่คลินิกวันนี้ก่อน ถ้ายังไม่ได้วัดใช้แบบคัดกรองตนเองจากแอป
  // แบบคัดกรองของนัดนี้ (ประเมินสำหรับนัดนี้เท่านั้น)
  const va = visitAssessment(appt);
  // ผลประเมินของนัดนี้ (ข้อที่ผู้ป่วยตอบจริง) · คัดกรองข้อห้ามมาจริงไหม
  const vik = intakeOfVisit(appt, p);
  const vHas = (f: string) => !vik?.asked || vik.asked.includes(f);
  const stopFlags = (scrToday ? screeningFlags(scrToday, store.settings.bpThreshold) : va?.screening ? evaluateScreening(va.screening, store.settings) : []).filter((f) => f.level === "stop");
  const stopFromApp = !scrToday && stopFlags.length > 0;
  const stopToday = stopFlags.length > 0;
  const startNow = (note?: string) => step({ status: "active", startedAt: nowIso(), bedId: bed! }, `เริ่มรับบริการ · ${bedName(store.settings, bed!)} · ${t.name}${note ? ` · ${note}` : ""}`);

  // เช็กอินที่เคาน์เตอร์ (ผู้ป่วยไม่ได้ใช้แอป / สแกนไม่ได้) → เลขคิวต่อแถวเดียวกับที่สแกน QR
  const counterCheckin = () => {
    const q = nextCheckinQueue(store.appointments, appt.date);
    step({ checkinQueue: q, checkedInAt: nowIso() }, `เช็กอินที่เคาน์เตอร์ · คิว ${q}`, `${p.name} เช็กอินแล้ว · คิว ${q}`);
  };

  const view: Stage = stage === "done" && payNow && !appt.paid && appt.payment?.status !== "pending" ? "billing" : stage;
  const payLabel = payByCredit && !extraSum ? "หักเครดิต" : method === "app" ? "ส่งบิลเข้าแอป" : "รับชำระ";
  // ทางเลือกที่ไม่ค่อยใช้ (ยกเลิกนัด · ไม่มา) อยู่ในเมนู ⋯
  const moreMenu = (
    <MoreMenu
      className="vs__more"
      items={[
        ...(view !== "called" && appt.date <= todayISO() ? [{ label: "ไม่มา", icon: <UserX size={16} />, onClick: () => step({ status: "absent" }, "ไม่มาตามนัด", `${p.name} ไม่มาตามนัด`) }] : []),
        { label: "ยกเลิกนัด", icon: <CalendarX2 size={16} />, onClick: () => setCancelling(true), danger: true },
      ]}
    />
  );
  let footer: React.ReactNode = null;
  if (view === "checkin")
    footer = (
      <>
        {moreMenu}
        <Button size="lg" fill leading={<ScanLine size={16} />} disabled={appt.date !== todayISO()} onClick={counterCheckin}>
          เช็กอินที่เคาน์เตอร์
        </Button>
      </>
    );
  else if (view === "waiting")
    footer = (
      <>
        {moreMenu}
        <Button size="lg" fill leading={<Megaphone size={16} />} onClick={() => call()}>
          เรียกคิว
        </Button>
      </>
    );
  else if (view === "called")
    footer = (
      <>
        {moreMenu}
        <Button variant="outline" size="lg" leading={<BellRing size={16} />} onClick={() => call(true)}>
          เรียกซ้ำ
        </Button>
        <Button
          size="lg"
          fill
          disabled={!bed}
          leading={<Play size={16} />}
          onClick={() => (stopToday ? setOverride(true) : startNow())}
        >
          {bed ? `เริ่ม · ${bed}` : "เลือกเตียง"}
        </Button>
      </>
    );
  else if (view === "treating")
    footer = (
      <Button size="lg" fill leading={<ClipboardCheck size={16} />} onClick={() => {
          // ยังไม่ครบเวลาบริการ (ขาดเกิน 5 นาที) → ถามว่าเสร็จก่อนเวลา หรือหยุดกลางคัน
          if (elapsed < s.minutes * 60 - 300) {
            setEarlyMode("done");
            setEarlyEnd("");
          } else endTreatment();
        }}>
        จบการรักษา
      </Button>
    );
  const painDone = painAfter !== undefined || skipPain;
  const recordLabel = painAfter !== undefined ? `บันทึกการรักษา · ปวด ${appt.painBefore} → ${painAfter}` : "บันทึกการรักษา · ไม่ได้ประเมินปวดหลังนวด";
  if (view === "assess" && painDone && appt.diagnoses?.length && appt.procedures?.length)
    saveRecord.current = () => {
      step({ painAfter, recordedAt: new Date().toISOString(), advice: advice.trim() || undefined }, recordLabel);
      deductStock(store, appt.id, appt.serviceId, store.settings.staffName);
    };
  else saveRecord.current = null;
  if (view === "assess")
    footer = (
      <Button size="lg" fill disabled={!painDone || !(appt.diagnoses?.length && appt.procedures?.length)} leading={<Check size={16} />} onClick={() => {
          step({ painAfter, recordedAt: new Date().toISOString(), advice: advice.trim() || undefined }, recordLabel);
          deductStock(store, appt.id, appt.serviceId, store.settings.staffName);
        }}>
        บันทึก
      </Button>
    );
  else if (view === "billing")
    footer = (
      <>
        {payNow && (
          <Button variant="outline" size="lg" onClick={() => setPayNow(false)}>
            ไว้ทีหลัง
          </Button>
        )}
        <Button size="lg" fill disabled={payUndecided || unpriced > 0 || (amount > 0 && method === "cash" && cash < amount)} leading={payByCredit ? <Ticket size={16} /> : method === "app" ? <Send size={16} /> : <Check size={16} />} onClick={pay}>
          {payLabel}
        </Button>
      </>
    );
  else if (view === "done" && appt.payment?.status === "pending")
    footer = (
      <Button size="lg" fill leading={<Check size={16} />} onClick={() => step(
            { paid: true, payment: { ...appt.payment!, status: "paid", at: nowIso(), slipSentAt: store.settings.autoSendSlip ? nowIso() : undefined } },
            store.settings.autoSendSlip ? "ผู้ป่วยชำระในแอปแล้ว · ส่งใบเสร็จแล้ว" : "ผู้ป่วยชำระในแอปแล้ว",
          )}>
        ได้รับเงินแล้ว
      </Button>
    );
  else if (view === "done" && !appt.paid)
    footer = (
      <Button size="lg" fill leading={<ReceiptText size={16} />} onClick={() => setPayNow(true)}>
        รับชำระ
      </Button>
    );
  else if (view === "done")
    footer = (
      <Button variant="outline" size="lg" fill leading={<ReceiptText size={16} />} onClick={() => setReceipt(appt.id)}>
        ใบเสร็จ
      </Button>
    );
  else if (view === "absent" || view === "cancelled")
    footer = (
      <Button variant="outline" size="lg" fill leading={<Undo2 size={16} />} onClick={() => step({ status: "waiting", calledAt: undefined, cancel: undefined }, view === "cancelled" ? "เลิกยกเลิกนัด" : "ย้อนเป็นรอรับบริการ", "ย้อนเป็นรอรับบริการแล้ว")}>
        ย้อนกลับ
      </Button>
    );

  const stepIdx = STEPS.findIndex((x) => x.key === view);
  // ไทม์ไลน์: ตัดข้อความที่ระบบสร้างเอง · รวมเหตุการณ์ซ้ำติดกัน (เช่น เรียกคิวซ้ำ ×5)
  const timeline: { text: string; title: string; detail: string; at: string; from: string; n: number; Icon: typeof Play }[] = [];
  for (const l of appt.log ?? []) {
    const text = l.label
      .replace(/^แจ้งจากแอป:\s*ผู้ป่วยอัปเดตผลประเมิน\s*·\s*[^·]+·\s*/, "ประเมินซ้ำในแอป: ")
      .replace(/แอป ThaiWell AI/g, "แอป ThaiWell")
      .replace(/^(เรียกคิว \S+) ซ้ำ$/, "$1");
    const prev = timeline[timeline.length - 1];
    if (prev && prev.text === text) {
      prev.n++;
      prev.at = l.at;
      continue;
    }
    const Icon = /เช็กอิน/.test(text) ? ScanLine : /เรียกคิว/.test(text) ? Megaphone : /เริ่ม/.test(text) ? Play : /บันทึก|วินิจฉัย|หัตถการ/.test(text) ? ClipboardCheck : /ชำระ|บิล|ใบเสร็จ|เครดิต/.test(text) ? ReceiptText : /เลื่อน/.test(text) ? CalendarClock : /ยกเลิก|ไม่มา/.test(text) ? CalendarX2 : /แอป/.test(text) ? Smartphone : /จบ|เสร็จ/.test(text) ? CircleCheck : Hourglass;
    // 2 บรรทัด: หัวข้อ (เกิดอะไร) · รายละเอียด
    // คำนำที่รู้จักก่อน · ไม่งั้นแยกที่ ":" (ไม่ใช่เวลา 08:00) หรือ "·" แรก
    const m = /^(เลื่อนนัด|เรียกคิว|ยกเลิกนัด|เริ่มรับบริการ|จบการรักษา|ส่งบิล|รับชำระ)\s+(.+)$/.exec(text) ?? /^(.+?)\s*(?:(?<!\d):(?!\d)|·)\s*(.+)$/.exec(text);
    timeline.push({ text, title: m ? m[1].trim() : text, detail: m ? m[2].trim() : "", at: l.at, from: l.at, n: 1, Icon });
  }
  // when each step happened — shown right under the stepper instead of a separate log
  const stepTime: Partial<Record<Stage, string>> = {
    checkin: appt.checkedInAt,
    called: appt.calledAt,
    treating: appt.startedAt,
    assess: appt.endedAt,
    billing: appt.painAfter !== undefined || appt.recordedAt ? appt.log?.find((l) => (l.label.startsWith("บันทึกการรักษา") || l.label.startsWith("ประเมินผล")))?.at : undefined,
    done: appt.payment?.at,
  };

  return (
    <>
      <Frame
        inline={inline}
        open={id !== null}
        onClose={onClose}
        leading={<Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" ring={stageMeta(appt).color} pulse={view === "treating"} />}
        title={p.name}
        subtitle={`${p.hn} · ${p.gender} ${p.age} ปี`}
        footer={
          <>
            {/* โทร · ข้อมูลสุขภาพ · ⋯ แล้วปุ่มหลักของขั้น */}
            {p.phone && (
              <a className="vs__call vs__tool" href={`tel:${p.phone}`} aria-label={`โทร ${p.phone}`}>
                <Phone size={17} />
              </a>
            )}
            {(onHistory || onOpenPatient) && (
              <button
                type="button"
                className={clsx("vs__hbtn vs__tool", onHistory && historyOpen && "is-on")}
                aria-pressed={!!(onHistory && historyOpen)}
                onClick={() => (onHistory ? onHistory() : onOpenPatient!(p.id))}
                aria-label="ข้อมูลสุขภาพ"
                title={onHistory && historyOpen ? "ซ่อนข้อมูลสุขภาพ" : "ดูข้อมูลสุขภาพ"}
              >
                <HeartPulse size={17} />
              </button>
            )}
            {footer}
          </>
        }
      >
        <div className="vs">
          {/* กล่องคิว: ชั้นบน คิว + เวลา · ชั้นล่าง บริการ | ผู้บำบัด | ค่าบริการ */}
          <section className="vs__summary vq2">
            <div className="vq2__top">
              <div className="vs__q">
                <small>คิว</small>
                {queueNo ? <b>{queueNo}</b> : <b className="is-wait">{view === "checkin" ? "รอเช็กอิน" : "—"}</b>}
              </div>
              <div className="vs__when">
                <b>{timeRange(appt.start, s.minutes)} น.</b>
                <small>
                  {thaiDateShort(appt.date)} {Number(appt.date.slice(0, 4)) + 543} · {appt.type === "walkin" ? "วอล์กอิน" : "นัดล่วงหน้า"} · {s.minutes} นาที
                </small>
              </div>
              <div className="vq2__meta">
              <span>
                <i className="vq2__ico">
                  <Leaf size={15} />
                </i>
                <span>
                  <small>บริการ</small>
                  <b>{s.name}</b>
                </span>
              </span>
              <span>
                {therapistPhoto(t) ? <img className="vq2__photo" src={therapistPhoto(t)} alt="" /> : <i className="vq2__ico">{t.name.replace(/^(นศ\.พท\.|พท\.ป\.?|คุณ)\s*/, "").slice(0, 1)}</i>}
                <span>
                  <small>ผู้บำบัด</small>
                  <b>{t.name}</b>
                </span>
              </span>
              {/* ค่าบริการไม่แสดงจนกว่าจะบันทึกการรักษา (อาจเพิ่มหัตถการ/บริการ) · ยอดจริงอยู่ในขั้นชำระเงิน */}
              </div>
            </div>
          </section>


          {/* ขั้นตอน: แท็บเม็ดยาต่อกัน · ผ่านแล้วเขียวเต็ม · ตอนนี้กรอบเขียว */}
          {stepIdx >= 0 && (
            <ol className="vst" style={{ ["--n" as string]: STEPS.length, ["--p" as string]: stepIdx / Math.max(1, STEPS.length - 1) }}>
              {STEPS.map((x, i) => (
                <li key={x.key} className={clsx(i < stepIdx && "is-done", i === stepIdx && "is-now")} aria-current={i === stepIdx ? "step" : undefined} title={`${x.label}${stepTime[x.key] ? ` ${clock(stepTime[x.key])}` : ""}`}>
                  <i className="vst__dot">{i < stepIdx ? <Check size={11} strokeWidth={3.2} /> : <x.icon size={11} strokeWidth={2.4} />}</i>
                  <small>{x.label}</small>
                  <time>{stepTime[x.key] ? clock(stepTime[x.key]) : "\u00a0"}</time>
                </li>
              ))}
            </ol>
          )}

          {stepIdx >= 0 ? null : (
            view === "cancelled" ? (
              <div className="cxb">
                <CalendarX2 size={18} />
                <div>
                  <b>ยกเลิกนัดแล้ว · {appt.cancel ? (appt.cancel.by === "patient" ? "ผู้ป่วยแจ้งยกเลิก" : "คลินิกยกเลิก") : "ยกเลิก"}</b>
                  {appt.cancel && (
                    <>
                      <small>
                        {appt.cancel.reason}
                        {appt.cancel.note ? ` (${appt.cancel.note})` : ""}
                      </small>
                      <small>
                        โดย {appt.cancel.staff} · {new Date(appt.cancel.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} น.
                      </small>
                    </>
                  )}
                </div>
              </div>
            ) : (
            <div className="alert alert--stop">
              <UserX size={16} />
              <div>
                <b>ไม่มาตามนัด</b>
                ผู้ป่วยมาแล้ว กด “ย้อนกลับ”
              </div>
            </div>
            )
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.section key={view} className="vs__panel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              {view === "checkin" && (
                <>
                  <StepHead n={1} title="รอเช็กอิน" hint={appt.date === todayISO() ? "ผู้ป่วยสแกน QR ในแอป หรือกด “เช็กอินที่เคาน์เตอร์”" : "เช็กอินได้ในวันนัด"} />
                </>
              )}
              {(view === "waiting" || view === "called") && (
                <>
                  <StepHead
                    n={view === "waiting" ? 1 : 2}
                    title={view === "waiting" ? "รอเรียกคิว" : "เลือกเตียง"}
                    hint={view === "waiting" ? `กด “เรียกคิว” เพื่อประกาศเสียงคิว ${queueNo}` : `เรียกคิวแล้ว ${clock(appt.calledAt)} น. · เลือกเตียงแล้วกด “เริ่ม”`}
                  />
                  {view === "called" && <BedPicker date={appt.date} self={appt.id} value={bed} onChange={setBed} />}
                </>
              )}
              {view === "treating" && (
                <>
                  <StepHead n={3} title="กำลังรับบริการ" hint={`${appt.bedId ? bedName(store.settings, appt.bedId) + " · " : ""}ครบเวลาแล้วกด “จบการรักษา”`} />
                  <div className="vs__timer">
                    <b>{mmss}</b>
                    <small>
                      จาก {s.minutes} นาที · เริ่ม {clock(appt.startedAt)} น. · <b className="vs__timer-end">เสร็จ {clock(new Date(Date.parse(appt.startedAt!) + s.minutes * 60_000).toISOString())} น.</b>
                    </small>
                    <i>
                      <motion.i animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.6 }} />
                    </i>
                  </div>
                </>
              )}
              {/* ข้อมูลก่อนนวด (หลังสิ่งที่ต้องทำในขั้นนี้): คัดกรอง · แจ้งเพิ่ม · แนวทางการรักษา — การ์ดแบบเดียวกัน */}
              {(view === "checkin" || view === "waiting" || view === "called" || view === "treating") && (
                <div className="vs__pre">
                  {/* เริ่มนวดแล้ว = คัดกรองเพิ่มไม่ได้ (คัดกรองก่อนเริ่มเท่านั้น) */}
                  {view !== "treating" && <VisitScreening p={p} app={vHas("screening") ? va?.screening : undefined} assessedAt={va?.at} pending={!va && !!appt.cloudId} date={appt.date} onScreen={() => navigate(`/patients/${p.id}/screen`)} />}
                  <AssessHistory rounds={appt.assessRounds} addenda={appt.addenda} />
                  {view !== "checkin" && <AppGuideCard guide={appt.appGuide} areas={appt.intake?.focusAreas} compact />}
                </div>
              )}
              {view === "assess" && (
                <>
                  <StepHead
                    n={4}
                    title="บันทึกการรักษา"
                    hint="ใส่วินิจฉัยและหัตถการ แล้วกด “บันทึก”"
                    action={
                      onVoice && (
                        <button type="button" className={clsx("vs__assist", voiceOpen && "is-on")} aria-pressed={!!voiceOpen} onClick={() => onVoice()} title="คุยกับ AI ให้ช่วยกรอก">
                          <BotMessageSquare size={17} />
                          ผู้ช่วยบันทึก
                        </button>
                      )
                    }
                  />
                  <div className="rs-stack">
                    <FindingsField appt={appt} n={1} />
                    <ClinicalRecord appt={appt} embedded />
                    <RecSection n={4} title="ความปวดหลังนวด" hint="ไม่บังคับ · ให้ผู้ป่วยเลือก หรือข้าม" done={painDone}>
                      <PainScale
                        value={painAfter}
                        onChange={(v) => {
                          setPainAfter(v);
                          setSkipPain(false);
                        }}
                      />
                      <button
                        type="button"
                        className={clsx("vs__skip", skipPain && "is-on")}
                        aria-pressed={skipPain}
                        onClick={() => {
                          setSkipPain(!skipPain);
                          setPainAfter(undefined);
                        }}
                      >
                        {skipPain ? "✓ ข้ามแล้ว (ไม่ได้ประเมิน)" : "ข้าม (ไม่ประเมิน)"}
                      </button>
                      {painAfter !== undefined && (
                        <p className={clsx("vs__delta", painAfter < appt.painBefore && "is-good")}>
                          {painAfter < appt.painBefore
                            ? `ปวด ${appt.painBefore} → ${painAfter} · ลดลง ${Math.round(((appt.painBefore - painAfter) / Math.max(1, appt.painBefore)) * 100)}%`
                            : painAfter === appt.painBefore
                              ? `ปวดเท่าเดิม (${appt.painBefore}/10)`
                              : `ปวด ${appt.painBefore} → ${painAfter} · ปวดมากขึ้น ควรแจ้งแพทย์`}
                        </p>
                      )}
                    </RecSection>
                    <RecSection n={5} title="คำแนะนำถึงผู้ป่วย" hint="ไม่บังคับ · ส่งเข้าแอป ThaiWell" done={!!advice.trim()}>
                      <Textarea value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="เช่น ประคบร้อนที่บ่าวันละ 15 นาที" />
                    </RecSection>
                  </div>
                </>
              )}
              {view === "billing" && (
                <>
                <StepHead n={5} title="ชำระเงิน" hint={payUndecided ? "เลือกวิธีชำระคอร์สก่อน" : `เลือกวิธีชำระ แล้วกด “${payLabel}”`} />
                {payUndecided ? (
                  <>
                    <CoursePayChoice p={p} left={credits!.total - courseNo + 1} price={s.price} onPrepay={() => setPrepayOpen(true)} />
                    <PrepayCourseDialog p={p} left={credits!.total - courseNo + 1} price={s.price} open={prepayOpen} onClose={() => setPrepayOpen(false)} />
                  </>
                ) : (
                <PayPanel
                  serviceName={s.name}
                  price={s.price}
                  extras={extras}
                  unpriced={unpriced}
                  course={coveredByCourse ? { name: p.course!.name, left: credits!.total - courseNo + 1, total: credits!.total } : null}
                  useCredit={useCredit}
                  setUseCredit={setUseCredit}
                  method={method}
                  setMethod={setMethod}
                  received={received}
                  setReceived={setReceived}
                  patientName={p.name}
                  courseNote={
                    perVisitCourse && credits && courseNo > 0
                      ? `คอร์ส${p.course!.name} · ชำระรายครั้ง (ครั้งที่ ${courseNo}/${credits.total})`
                      : p.course && prepaid && p.course.serviceId !== appt.serviceId
                        ? `คอร์ส${p.course.name}ใช้กับบริการนี้ไม่ได้`
                        : p.course && prepaid && courseNo > (credits?.total ?? 0)
                          ? `เกินคอร์ส (ครั้งที่ ${courseNo}/${credits?.total}) · ชำระรายครั้ง`
                          : undefined
                  }
                />
                )}
                </>
              )}
              {view === "done" && (
                <>
                  <StepHead n={6} title="สรุปการรักษา" hint={appt.paid ? `ชำระแล้ว${appt.payment?.at ? ` ${hm(appt.payment.at)} น.` : ""}${appt.payment?.no ? ` · ${appt.payment.no}` : ""}` : appt.payment?.status === "pending" ? "รอผู้ป่วยชำระในแอป" : "ยังค้างชำระ"} />
                  <VisitSummary appt={appt} courseNo={courseNo} courseTotal={credits?.total} courseLeft={credits?.remaining} amount={appt.payment?.amount ?? s.price + extraSum} />
                  {onNext && next && appt.paid && (
                    <button type="button" className="vs__next" onClick={() => onNext(next.id)}>
                      <span>
                        <small>คนถัดไป</small>
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

          {view === "billing" && <ClinicalRecord appt={appt} locked />}

          {/* ขั้นชำระเงิน: เครดิตคอร์สแสดงในตัวเลือกหักเครดิตแล้ว */}
          {credits && !(view === "billing" && coveredByCourse) && <CreditPips info={credits} name={p.course!.name} />}

          <section className="vs__ctx">
            {view === "assess" && !onVoice && <VoiceNote appt={appt} />}
            {(() => {
              const ik = intakeOfVisit(appt, p);
              const al = ik ? intakeAlerts(ik, store.settings.bpThreshold) : [];
              // ปวดก่อนนวดของนัดนี้: จากผลประเมิน (แอป) / คัดกรองวันนี้ · ยังไม่มี = ค่าเริ่มต้นตอนลงนัด (ไม่แสดงเป็นคะแนนจริง)
              const pb = appt.painBefore;
              const pbKnown = !!ik || (p.screening?.at?.slice(0, 10) === appt.date && p.screening.pain != null) || !!appt.startedAt;
              // ยังไม่มีคะแนนของนัดนี้ → อ้างอิงคะแนนล่าสุดที่รู้ (หลังนวดครั้งก่อน)
              const prevDone = !pbKnown
                ? store.appointments
                    .filter((x) => x.patientId === p.id && x.id !== appt.id && x.painAfter !== undefined && `${x.date}${x.start}` < `${appt.date}${appt.start}`)
                    .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0]
                : undefined;
              const tc = pb >= 7 ? "#d8392a" : pb >= 4 ? "#e08a1e" : "#2f9a5b";
              return (
                <div className="vcc">
                  <div className="vcc__head">
                    <span className="vcc__icon">
                      <Stethoscope size={15} />
                    </span>
                    <b>ผลประเมินก่อนนวด</b>
                    {/* ผลประเมินของนัดวันนี้ (ไม่ใช่ข้อมูลรวมของผู้ป่วย) */}
                    {ik ? <small>{timeAgo(ik.at)}</small> : appt.cloudId ? <small className="vcc__none">ยังไม่ได้ประเมิน</small> : null}
                  </div>
                  <p className="vcc__text">
                    “{ik?.complaint ?? p.complaint}”
                    {!ik && appt.cloudId && p.complaint ? <small className="vcc__prev"> (จากครั้งก่อน)</small> : null}
                  </p>
                  {ik && ik.duration?.trim() && ik.duration.trim() !== "-" && (
                    <span className="vcc__sub vcc__since">
                      เป็นมา {ik.duration.replace(/^ประมาณ\s*/, "")}
                      {ik.goal && (!ik.asked || ik.asked.includes("goal")) ? ` · ต้องการ${ik.goal}` : ""}
                    </span>
                  )}

                  <div className="vcc__facts">
                    <div style={{ ["--tc" as string]: tc }}>
                      <span className="vcc__ti">
                        <Activity size={14} />
                      </span>
                      <small>ปวดก่อนนวด</small>
                      <b>
                        {pbKnown ? pb : "—"}
                        <i>/10</i>
                      </b>
                      <span className="vcc__bar">
                        {Array.from({ length: 10 }, (_, k) => (
                          <em key={k} className={pbKnown && k < pb ? "on" : undefined} />
                        ))}
                      </span>
                      {!pbKnown && (
                        <span className="vcc__sub">
                          {prevDone ? `ครั้งก่อนหลังนวด ${prevDone.painAfter}/10 · ` : ""}คัดกรองเพื่อวัดวันนี้
                        </span>
                      )}
                    </div>
                    {/* แรงนวดที่ผู้ป่วยต้องการ (ไม่ได้ถาม = ไม่ได้ประเมิน) */}
                    <div style={{ ["--pc" as string]: ik && (!ik.asked || ik.asked.includes("pressure")) ? (ik.pressure === "หนัก" ? "#d8392a" : ik.pressure === "ปานกลาง" ? "#e08a1e" : "#2f9a5b") : "var(--color-text-muted)" }}>
                      <span className="vcc__ti" style={{ ["--tc" as string]: "var(--pc)" }}>
                        <Hand size={14} />
                      </span>
                      <small>แรงนวด</small>
                      <b className="vcc__dur" style={{ color: "var(--pc)" }}>{ik && (!ik.asked || ik.asked.includes("pressure")) ? ik.pressure : "—"}</b>
                      {ik && (!ik.asked || ik.asked.includes("pressure")) && (
                        <span className="vcc__steps">
                          {(["เบา", "ปานกลาง", "หนัก"] as const).map((lv, k) => (
                            <em key={lv} className={k <= ["เบา", "ปานกลาง", "หนัก"].indexOf(ik.pressure) ? "on" : undefined} />
                          ))}
                        </span>
                      )}
                      {!(ik && (!ik.asked || ik.asked.includes("pressure"))) && <span className="vcc__sub">ไม่ได้ประเมิน</span>}
                    </div>
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
            <section className="vs__log vtl">
              <div className="vtl__head">
                <span className="vcc__icon">
                  <History size={15} />
                </span>
                <span>
                  <b>ไทม์ไลน์นัดนี้</b>
                  <small>
                    {timeline.length} รายการ · ล่าสุด {clock(appt.log![appt.log!.length - 1].at)} น.
                  </small>
                </span>
              </div>
              <ol>
                {/* ล่าสุดอยู่บน */}
                {(logAll ? timeline : timeline.slice(-6)).slice().reverse().map((l, i) => (
                  <li key={i} className={i === 0 ? "is-last" : undefined}>
                    <time>
                      {clock(l.at)}
                      {l.n > 1 && <small>ตั้งแต่ {clock(l.from)}</small>}
                    </time>
                    <span className="vtl__txt">
                      <b>
                        <l.Icon size={14} />
                        {l.title}
                        {l.n > 1 && <em className="vtl__n">×{l.n}</em>}
                      </b>
                      {l.detail && <small>{l.detail}</small>}
                    </span>
                  </li>
                ))}
              </ol>
              {timeline.length > 6 && (
                <button type="button" className="vtl__more" onClick={() => setLogAll((v) => !v)}>
                  {logAll ? "ย่อ" : `ดูทั้งหมด ${timeline.length} รายการ`}
                </button>
              )}
            </section>
          )}
        </div>
      </Frame>
      <Dialog
        open={earlyEnd !== null}
        onClose={() => setEarlyEnd(null)}
        className="early-dialog"
        leading={
          <span className="st-head__icon">
            <Hourglass size={20} strokeWidth={1.9} />
          </span>
        }
        title="จบการรักษาก่อนเวลา"
        subtitle={`${p.name} · ${s.name}`}
        footer={
          <>
            <Button variant="outline" size="lg" fill onClick={() => setEarlyEnd(null)}>
              ทำต่อ
            </Button>
            <Button
              size="lg"
              fill
              variant={earlyMode === "stop" ? "danger" : "primary"}
              leading={earlyMode === "stop" ? <Ban size={16} /> : <CircleCheck size={16} />}
              disabled={earlyMode === "stop" && !earlyEnd?.trim()}
              onClick={() => endTreatment(earlyEnd?.trim() || undefined, earlyMode)}
            >
              {earlyMode === "stop" ? "ยืนยันหยุดการรักษา" : "ยืนยันเสร็จการรักษา"}
            </Button>
          </>
        }
      >
        <div className="early">
          {/* เวลาที่ใช้ไปเทียบกับเวลาบริการ */}
          <div className="early__time">
            <div>
              <b>{usedMin}</b>
              <small>/ {s.minutes} นาที</small>
            </div>
            <span className="early__bar" style={{ ["--p" as string]: `${Math.round(pct * 100)}%` }}>
              <i />
            </span>
            <small>เร็วกว่ากำหนด {Math.max(0, s.minutes - usedMin)} นาที</small>
          </div>
          <div className="early__modes" role="radiogroup" aria-label="ผลการรักษา">
            <button
              type="button"
              role="radio"
              aria-checked={earlyMode === "done"}
              aria-pressed={earlyMode === "done"}
              className={clsx("early__mode is-done", earlyMode === "done" && "is-on")}
              onClick={() => {
                setEarlyMode("done");
                setEarlyEnd("");
              }}
            >
              <CircleCheck size={22} />
              <span>
                <b>เสร็จก่อนเวลา</b>
                <small>รักษาครบแล้ว นับเป็นครั้งปกติ</small>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={earlyMode === "stop"}
              aria-pressed={earlyMode === "stop"}
              className={clsx("early__mode is-stop", earlyMode === "stop" && "is-on")}
              onClick={() => {
                setEarlyMode("stop");
                setEarlyEnd("");
              }}
            >
              <Ban size={22} />
              <span>
                <b>หยุดกลางคัน</b>
                <small>ยังไม่ครบ ต้องระบุเหตุผล</small>
              </span>
            </button>
          </div>
          <div className="early__reason">
            <small>{earlyMode === "stop" ? "เหตุผลที่หยุด (จำเป็น)" : "หมายเหตุ (ไม่บังคับ)"}</small>
            <div className="early__chips">
              {(earlyMode === "stop" ? ["ผู้ป่วยขอหยุด", "มีอาการผิดปกติ", "ผู้ป่วยมีธุระด่วน", "กดเริ่มผิดเวลา"] : ["อาการดีขึ้นแล้ว", "นวดครบทุกจุดแล้ว", "ผู้ป่วยพอใจ"]).map((r) => (
                <button key={r} type="button" aria-pressed={earlyEnd === r} onClick={() => setEarlyEnd(earlyEnd === r ? "" : r)}>
                  {r}
                </button>
              ))}
            </div>
            <Textarea value={earlyEnd ?? ""} onChange={(e) => setEarlyEnd(e.target.value)} placeholder={earlyMode === "stop" ? "หรือพิมพ์เหตุผล…" : "หรือพิมพ์หมายเหตุ…"} rows={2} />
          </div>
        </div>
      </Dialog>
      <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
      <CancelDialog appt={cancelling ? appt : null} onClose={() => setCancelling(false)} />
      <Dialog
        open={override}
        onClose={() => setOverride(false)}
        title={stopFromApp ? "พบข้อห้าม (คัดกรองในแอป)" : "พบข้อห้าม (คัดกรองวันนี้)"}
        subtitle={`${p.name} · ${stopFlags.map((f) => f.label).join(" · ")}`}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setOverride(false)}>
              ยังไม่เริ่ม
            </Button>
            <Button
              size="md"
              disabled={!overrideBy.trim()}
              onClick={() => {
                setOverride(false);
                startNow(`เริ่มแม้พบข้อห้าม (${stopFlags.map((f) => f.label).join(", ")}) · ประเมินโดย ${overrideBy.trim()}`);
                setOverrideBy("");
              }}
            >
              แพทย์ประเมินแล้ว · เริ่ม
            </Button>
          </>
        }
      >
        <div className="alert alert--stop">
          <ShieldAlert size={16} />
          <div>
            <b>ให้แพทย์แผนไทยประเมินก่อนนวด</b>
            {stopFromApp ? "คัดกรองซ้ำที่คลินิก หรือใส่ชื่อแพทย์ที่อนุญาตให้นวด" : "ใส่ชื่อแพทย์ที่อนุญาตให้นวด · บันทึกในประวัติของนัด"}
          </div>
        </div>
        <Field label="แพทย์ผู้ประเมิน">
          <Input value={overrideBy} onChange={(e) => setOverrideBy(e.target.value)} placeholder="ชื่อ-นามสกุล แพทย์ผู้ประเมิน" />
        </Field>
      </Dialog>
    </>
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

/** step header with a short hint, a checklist, or an action */
function StepHead({ title, hint, todo, action }: { n?: number; title: string; hint?: string; todo?: { done: boolean; label: string }[]; action?: React.ReactNode }) {
  return (
    <div className="vs__stephead">
      {action ? (
        <div className="vs__stephead-row">
          <h3>{title}</h3>
          {action}
        </div>
      ) : (
        <h3>{title}</h3>
      )}
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
