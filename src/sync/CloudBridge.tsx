import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { queueNumber } from "../features/AppointmentDrawer";
import { todayISO } from "../data/thaiDate";
import type { Appointment, AssessRound, BookingRequest, Intake, Patient, Screening } from "../data/types";
import { AVAILABILITY_KEY } from "../features/appBridge";
import { DEMO } from "../data/mode";
import { defaultAppAvatar } from "../data/avatars";
import { validCheckinCode } from "../features/checkinCode";
import { coursePrepaid, isRecorded } from "../data/domain";
import { ensureDemoCloud, publishCloudAvailability, resetDemoCloud, takeDemoReseed } from "./demo";
import { cloud, logEvent, rank, updateAppt, type CloudAppt, type CloudAssessment, type CloudEvent, type CloudStatus } from "./cloud";
import { pushNotify } from "./notify";

type Store = ReturnType<typeof useStore>;

/**
 * คลินิกเปิดหลายเครื่อง (iPad หลายเครื่อง / เว็บ) → เครื่องเดียวรับข้อมูลจากแอปและส่งกลับ (ไม่ประมวลผลซ้ำ · ไม่ตัดสินจากข้อมูลค้าง)
 * ใช้แถว tw_events id -2 เป็นตัวจอง: เครื่องที่จองไว้ต่ออายุทุก 5 วินาที · เกิน 15 วินาทีไม่ต่อ (ปิดแอป/พักจอ) → เครื่องอื่นรับแทน
 */
const BRIDGE_DEVICE = `cb${Math.random().toString(36).slice(2, 10)}`;
const LEADER_ID = -2;
const LEADER_TTL = 15_000;

/* ---------- ประเมินหลายรอบจากแอป (ประเมินซ้ำก่อนเช็กอิน) + แจ้งอาการเพิ่มหลังเช็กอิน ---------- */
const flagsOf = (sc?: CloudAssessment["screening"]) =>
  [sc?.fever && "มีไข้", sc?.highBP && "ความดันสูง", sc?.pregnant && "ตั้งครรภ์", sc?.recentSurgery && "ผ่าตัดไม่นาน", sc?.contagious && "โรคติดต่อ", sc?.menstruation && "มีประจำเดือน"].filter(Boolean) as string[];
const roundOf = (a: Omit<CloudAssessment, "rounds" | "addenda">, fallbackAt: string): AssessRound => ({
  at: a.at ?? fallbackAt,
  pain: a.pain ?? 5,
  complaint: a.complaint ?? "",
  focusAreas: a.areas ?? [],
  avoidAreas: a.avoid ?? [],
  summary: a.summary,
  flags: flagsOf(a.screening),
  ...(a.previsit ? { previsit: a.previsit } : {}),
});
/** ทุกรอบ เก่า → ใหม่ (รอบสุดท้าย = ที่ผู้ให้บริการใช้) */
const roundsOf = (row: CloudAppt): AssessRound[] => {
  const as = row.assessment ?? {};
  // นัดที่คลินิกลงเอง: ข้อมูลตั้งต้นของคลินิก (ยังไม่มีคะแนนปวด) ไม่ใช่การประเมินของผู้ป่วย
  const real = (a: Omit<CloudAssessment, "rounds" | "addenda">) => typeof a.pain === "number";
  return [...(as.rounds ?? []).filter(real).map((r) => roundOf(r, row.created_at)), ...(real(as) ? [roundOf(as, row.created_at)] : [])];
};
/** ผู้ป่วยคัดกรองข้อห้ามมาจริง (แอปรุ่นเก่าส่ง "ไม่มี" ทุกข้อแม้ไม่ได้ถาม → ถือว่ายังไม่ได้คัดกรอง เว้นแต่มีข้อที่ตอบว่ามี) */
const screenedIn = (as?: CloudAssessment | null) => as?.screened === true || Object.values(as?.screening ?? {}).some((v) => v === true);
const screeningOf = (sc?: CloudAssessment["screening"]): Screening => ({ fever: !!sc?.fever, highBP: !!sc?.highBP, bpSystolic: sc?.bpSystolic, menstruation: !!sc?.menstruation, pregnant: !!sc?.pregnant, recentSurgery: !!sc?.recentSurgery, contagious: !!sc?.contagious });
const intakeOf = (row: CloudAppt, fallbackComplaint: string): Intake => {
  const as = row.assessment ?? {};
  return {
    at: as.at ?? row.created_at,
    // แอปส่งมาแค่นี้ · ข้ออื่น (ยา ผิวหนัง ชา ผ่าตัด แพ้) ไม่ได้ถาม
    asked: ["complaint", "pain", "focusAreas", "avoidAreas", ...(as.conditions ? ["conditions"] : []), ...(as.pressure ? ["pressure"] : []), ...(screenedIn(as) ? ["screening"] : [])],
    goal: "บรรเทาอาการ",
    complaint: as.complaint ?? fallbackComplaint,
    pain: as.pain ?? 5,
    duration: "-",
    focusAreas: as.areas ?? [],
    avoidAreas: as.avoid ?? [],
    conditions: as.conditions ?? [],
    medications: [],
    bloodThinner: false,
    skin: "ปกติ",
    numbness: false,
    fever: !!as.screening?.fever,
    pregnant: as.screening?.pregnant ?? null,
    pressure: (["เบา", "ปานกลาง", "หนัก"].includes(as.pressure ?? "") ? as.pressure : "ปานกลาง") as Intake["pressure"],
  };
};
/** ลายเซ็นบิล (ไม่ขึ้นกับลำดับคีย์ของ jsonb) */
const billKey = (b?: CloudAppt["bill"] | null) => (b ? `${b.status}|${b.amount}|${b.receipt_no ?? ""}|${(b.lines ?? []).map((l) => `${l.name}:${l.amount}`).join(",")}` : "");
/** ลายเซ็นของการประเมิน (เปลี่ยน = มีรอบใหม่ / แจ้งเพิ่ม / ประเมินหลังนวด) */
const assessSig = (row: CloudAppt) => `${row.assessment?.rounds?.length ?? 0}|${row.assessment?.at ?? ""}|${row.assessment?.addenda?.length ?? 0}|${row.assessment?.after?.at ?? ""}`;

/** what the clinic has done with a linked booking, as the shared status + the data the app needs */
function derive(store: Store, a: Appointment): { status: CloudStatus; patch: Partial<CloudAppt>; kind: string; summary: string } {
  const s = store.serviceById(a.serviceId);
  const t = store.therapistById(a.therapistId);
  const pay = a.payment;
  // รายการในบิล: ค่าบริการ + หัตถการเพิ่ม (หักเครดิตคอร์ส = ค่าบริการ 0)
  const lines = (pay?.items ?? [{ name: s.name, amount: s.price }]).map((l, i) => (i === 0 && pay && (pay.method === "credit" || pay.credit) ? { name: `${l.name} (หักเครดิตคอร์ส)`, amount: 0 } : l));
  if (a.status === "cancelled") return { status: "cancelled", patch: { note: a.cancel?.reason }, kind: "booking.cancelled", summary: `คลินิกยกเลิกนัด · ${a.cancel?.reason ?? ""}` };
  if (a.status === "absent") return { status: "no_show", patch: {}, kind: "booking.no_show", summary: "บันทึกว่าไม่มาตามนัด" };
  if (pay?.status === "paid")
    return {
      status: "paid",
      patch: { bill: { amount: pay.amount, items: lines.map((l) => l.name), lines, status: "paid", method: pay.method, receipt_no: pay.no, paid_at: pay.at, via: pay.method === "app" ? "app" : "clinic" } },
      kind: "bill.paid",
      summary: `ชำระที่คลินิก ${pay.amount} บาท · ส่งใบเสร็จ ${pay.no ?? ""} เข้าแอป`,
    };
  if (pay?.status === "pending") return { status: "billed", patch: { bill: { amount: pay.amount, items: lines.map((l) => l.name), lines, status: "pending", via: "app", receipt_no: pay.no } }, kind: "bill.sent", summary: `ส่งบิล ${pay.amount} บาท ไปเรียกเก็บในแอป` };
  if (isRecorded(a) && a.endedAt)
    return {
      status: "recorded",
      patch: {
        record: {
          findings: a.findings,
          diagnoses: a.diagnoses?.map((d) => d.name),
          procedures: a.procedures?.map((x) => [x.name, x.area, x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")),
          painBefore: a.painBefore,
          painAfter: a.painAfter,
          advice: a.advice,
          therapist: t.name,
        },
      },
      kind: "record.sent",
      summary: `ส่งผลการรักษา · ${a.painAfter !== undefined ? `ปวด ${a.painBefore} → ${a.painAfter}` : "ไม่ได้ประเมินความปวดหลังนวด"}${a.advice ? " · พร้อมคำแนะนำ" : ""}`,
    };
  if (a.startedAt) return { status: "in_service", patch: {}, kind: "service.started", summary: `เริ่มรับบริการ · ${t.name}` };
  if (!a.calledAt && a.checkinQueue) return { status: "checked_in", patch: { queue_no: a.checkinQueue }, kind: "queue.issued", summary: `เช็กอินที่คลินิก · คิว ${a.checkinQueue}` };
  if (a.calledAt) {
    const q = queueNumber(store.appointments, a);
    return { status: "called", patch: q ? { queue_no: q } : {}, kind: "queue.called", summary: q ? `เรียกคิว ${q} เข้ารับบริการ` : "เรียกเข้ารับบริการ" };
  }
  return { status: "confirmed", patch: { date: a.date, start: a.start, therapist: t.name, service: s.name }, kind: "booking.confirmed", summary: `ยืนยันนัด ${a.date} ${a.start} น. · ${t.name}` };
}

/**
 * Keeps this back-office and the patient app in step through the shared cloud:
 * in  — bookings from the app become requests; app check-ins get a queue number; payments made in the app close the bill
 * out — confirm / reject, call, start, record, bill and payment go back to the app (and to the Flow Monitor)
 */
export function CloudBridge() {
  const store = useStore();
  const toast = useToast();
  const ref = useRef(store);
  ref.current = store;
  /** เครื่องนี้เป็นเครื่องที่รับ/ส่งข้อมูลกับแอปอยู่ (สาธิต = เครื่องเดียวเสมอ) */
  const leader = useRef(DEMO);
  const reloadOpen = useRef<() => void>(() => {});
  // last status each side knows about, so neither side moves a booking backwards or echoes its own change
  const known = useRef(new Map<string, string>());
  const planSent = useRef(new Set<string>());
  /** วัน|เวลา|ผู้บำบัด ของนัดที่ยืนยันแล้ว ตามที่อยู่ใน cloud — เปลี่ยนในหลังบ้าน (เลื่อนนัด) → ส่งไปแอป · cloud เปลี่ยน → รับมา */
  const slotSig = useRef(new Map<string, string>());
  const visitNoSig = useRef(new Map<string, string>());
  /** นัดจากแอปที่กำลังสร้างกลับในเครื่องนี้ (กันซ้ำระหว่าง realtime กับรอบตรวจซ้ำ) */
  const adopting = useRef(new Set<string>());
  /** เลขคิวเช็กอินล่าสุดของแต่ละวัน (กันออกเลขซ้ำเมื่อเช็กอินพร้อมกันหลายคน) */
  const lastQueue = useRef(new Map<string, number>());
  const issuing = useRef(new Set<string>());
  /** ยอด/เลขใบเสร็จของบิลที่ส่งไปแอปแล้ว (แก้บิลระหว่างรอชำระ → ส่งใหม่) */
  const billSig = useRef(new Map<string, string>());
  /** ลายเซ็นการประเมิน/แจ้งเพิ่มล่าสุดที่เห็น (รอบตรวจซ้ำ: เปลี่ยน → รับใหม่) */
  const asSig = useRef(new Map<string, string>());
  /** นัดที่คลินิกลงเองให้ผู้ป่วยที่ใช้แอป (กำลังสร้างแถวใน cloud) · คอร์สที่ส่งไปแอปล่าสุด */
  const creating = useRef(new Set<string>());
  const courseSig = useRef(new Map<string, string>());
  // nothing is pushed until the cloud's current state has been read
  const [ready, setReady] = useState(false);

  /** avatar ที่ผู้ใช้เปลี่ยนในแอป → รูปในคลินิก (รูปถ่ายจริงที่เจ้าหน้าที่ถ่ายไว้ไม่ถูกแทน) */
  const syncPhoto = (p: Patient, cp?: CloudAppt["tw_patients"]) => {
    // ยังไม่มีรูปเลย → รูปตั้งต้นตามเพศแบบในแอป
    const avatar = cp?.profile?.avatar ?? (!p.photo && cp ? defaultAppAvatar(cp.gender ?? undefined) : undefined);
    if (!p.id || !avatar || p.photo === avatar || (p.photo && !p.photo.startsWith("avatar:"))) return;
    ref.current.dispatch({ type: "updatePatient", id: p.id, patch: { photo: avatar } });
  };
  /** the local patient for an app account (registered on first booking) */
  const patientFor = (row: CloudAppt): Patient => {
    const st = ref.current;
    const cp = row.tw_patients;
    const digits = cp?.phone?.replace(/\D/g, "") ?? "";
    // ผู้ป่วยเดิมของคลินิก: บัญชีแอปเดียวกัน → เลขบัตรประชาชนตรงกัน → เบอร์โทรตรงกัน
    const found =
      st.patients.find((p) => p.cloudId === row.patient_id) ??
      (cp?.citizen_id ? st.patients.find((p) => p.citizenId?.replace(/\D/g, "") === cp.citizen_id) : undefined) ??
      (digits.length >= 9 ? st.patients.find((p) => p.phone.replace(/\D/g, "") === digits) : undefined);
    if (found) {
      syncPhoto(found, cp);
      if (!found.cloudId) st.dispatch({ type: "updatePatient", id: found.id, patch: { cloudId: row.patient_id, ...(cp?.citizen_id && !found.citizenId ? { citizenId: cp.citizen_id } : {}) } });
      // ผู้ป่วยเดิมของคลินิก → HN เดิมไปแสดงในแอป
      if (cp && cp.clinic_hn !== found.hn) void cloud.from("tw_patients").update({ clinic_hn: found.hn }).eq("id", row.patient_id).then(() => undefined);
      return found;
    }
    const p: Patient = {
      id: `pc${Date.now().toString(36)}`,
      // HN ถัดจากเลขที่มากที่สุด (ลบผู้ป่วยแล้วไม่ออกเลขซ้ำ)
      hn: `HN${String(Math.max(641_000 + st.patients.length, ...st.patients.map((x) => Number(x.hn.replace(/\D/g, "")) || 0)) + 1).padStart(7, "0")}`,
      name: cp?.name ?? "ผู้ใช้แอป",
      gender: cp?.gender === "ชาย" ? "ชาย" : "หญิง",
      age: cp?.age ?? 30,
      phone: cp?.phone ?? "",
      conditions: row.assessment?.conditions ?? [],
      complaint: row.assessment?.complaint ?? "",
      painHistory: [],
      registeredOn: todayISO(),
      cloudId: row.patient_id,
      // ยืนยันตัวตนด้วยบัตรประชาชนในแอปแล้ว
      ...(cp?.citizen_id ? { citizenId: cp.citizen_id } : {}),
      ...(cp?.birth_date ? { birthDate: cp.birth_date } : {}),
      ...(cp?.address ? { address: cp.address } : {}),
      ...(cp?.email ? { email: cp.email } : {}),
      // รูปโปรไฟล์ = avatar ที่ผู้ใช้เลือกในแอป · ไม่ได้เลือก = รูปตั้งต้นตามเพศ (ตรงกับในแอป)
      photo: cp?.profile?.avatar ?? defaultAppAvatar(cp?.gender ?? undefined),
    };
    st.dispatch({ type: "addPatient", patient: p });
    void cloud.from("tw_patients").update({ clinic_hn: p.hn }).eq("id", row.patient_id).then(() => undefined);
    return p;
  };

  /** บริการที่ผู้ป่วยเลือก: รหัสจากแอป → ชื่อตรงกัน → ชื่อที่ยาวที่สุดที่อยู่ในป้าย ("นวดไทยร่วมประคบสมุนไพร" ไม่ใช่ "ประคบสมุนไพร") */
  /**
   * ข้อความผลประเมินจากแอป → นัดของผู้ป่วยวันนี้ (หรือนัดถัดไปที่ใกล้ที่สุด)
   * ก่อนเช็กอิน = รอบประเมินของนัดนั้น (คะแนนปวดจากข้อความ) · เช็กอินแล้ว = แจ้งเพิ่มของนัดนั้น
   */
  const attachNoteAssessment = (patientId: string, at: string, text: string) => {
    const st = ref.current;
    const today = todayISO();
    // ประเมินหลังนวด (แอปรุ่นเก่าส่งเป็นข้อความ "ปวด X → Y") → ครั้งล่าสุดที่บันทึกโดยข้ามคะแนนหลังนวด
    if (/หลังนวด/.test(text)) {
      const y = /→\s*(\d{1,2})/.exec(text);
      const v = st.appointments
        .filter((a) => a.patientId === patientId && a.painAfter === undefined && (a.recordedAt || a.endedAt))
        .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0];
      if (y && v) st.dispatch({ type: "updateAppointment", id: v.id, patch: { painAfter: Math.min(10, Number(y[1])) }, log: `ผู้ป่วยประเมินความปวดหลังนวดในแอป · ${v.painBefore} → ${y[1]}` });
      return;
    }
    const appt = st.appointments
      .filter((a) => a.patientId === patientId && a.date >= today && a.status !== "cancelled" && a.status !== "absent" && a.status !== "done" && !a.endedAt)
      .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
    if (!appt) return;
    const m = /ปวด\s*(?:\d+\s*→\s*)?(\d{1,2})\s*\/\s*10/.exec(text);
    const pain = m ? Math.min(10, Number(m[1])) : undefined;
    const started = !!appt.checkinQueue || !!appt.calledAt || !!appt.startedAt || appt.status === "active";
    if (started || pain === undefined) {
      if (appt.addenda?.some((x) => x.at === at)) return;
      st.dispatch({ type: "updateAppointment", id: appt.id, patch: { addenda: [...(appt.addenda ?? []), { at, text }] }, log: `แจ้งจากแอป: ${text}` });
      return;
    }
    if (appt.assessRounds?.some((r) => r.at === at)) return;
    const round: AssessRound = { at, pain, complaint: appt.intake?.complaint ?? st.patientById(patientId).complaint, focusAreas: appt.intake?.focusAreas ?? [], avoidAreas: appt.intake?.avoidAreas ?? [], summary: text };
    st.dispatch({ type: "updateAppointment", id: appt.id, patch: { painBefore: pain, assessRounds: [...(appt.assessRounds ?? []), round] }, log: `ผู้ป่วยประเมินก่อนนวดในแอป · ปวด ${pain}/10` });
    const p = st.patients.find((x) => x.id === patientId);
    if (p) st.dispatch({ type: "updatePatient", id: p.id, patch: { painHistory: [...p.painHistory.filter((h) => h.date !== appt.date), { date: appt.date, score: pain }] } });
  };

  /**
   * คำขอจองจากแอปที่ซ้ำกับนัดตามคอร์สวันเดียวกัน (บริการเดียวกัน) → ผลประเมินของคำขอใส่ให้นัดตามคอร์สนั้น
   * (แอปรุ่นเก่าไม่รู้จักนัดตามคอร์ส ผู้ป่วยจึงจองใหม่ทุกครั้งที่ประเมิน) · คืน id นัดที่ผูก
   */
  const linkCourseVisit = (row: CloudAppt, patientId: string, serviceId: string, date: string): string | undefined => {
    const st = ref.current;
    const v = st.appointments.find((a) => a.patientId === patientId && a.date === date && a.serviceId === serviceId && a.cloudId?.startsWith("cl-") && a.status === "waiting" && !a.endedAt);
    if (!v || !row.assessment || typeof row.assessment.pain !== "number") return v?.id;
    const as = row.assessment;
    const round: AssessRound = { ...roundOf(as, row.created_at), at: as.at ?? row.created_at };
    if (v.assessRounds?.some((r) => r.at === round.at)) return v.id;
    const started = !!v.checkinQueue || !!v.calledAt || !!v.startedAt;
    if (started) {
      st.dispatch({ type: "updateAppointment", id: v.id, patch: { addenda: [...(v.addenda ?? []), { at: round.at, text: `ประเมินในแอป (ส่งมาเป็นคำขอจอง) · ${as.summary ?? `ปวด ${as.pain}/10`}` }] }, log: "ผลประเมินจากคำขอจองที่ซ้ำกับนัดตามคอร์ส (หลังเช็กอิน)" });
    } else {
      st.dispatch({ type: "updateAppointment", id: v.id, patch: { intake: intakeOf(row, v.intake?.complaint ?? ""), painBefore: as.pain, screening: screenedIn(as) ? screeningOf(as.screening) : undefined, assessRounds: [...(v.assessRounds ?? []).filter((r) => !/^นัด(ตามคอร์ส|จากคลินิก)/.test(r.summary ?? "")), round], ...(as.guide ? { appGuide: as.guide } : {}) }, log: `ผลประเมินจากแอปของนัดตามคอร์สนี้ · ปวด ${as.pain}/10` });
      syncHealth(patientId, row, date);
    }
    return v.id;
  };

  /** ผลประเมินล่าสุดจากแอป → ข้อมูลสุขภาพของผู้ป่วย (อาการสำคัญ · ระดับปวดของวันนัด · โรคประจำตัว) */
  const syncHealth = (patientId: string, row: CloudAppt, date: string) => {
    const st = ref.current;
    const p = st.patients.find((x) => x.id === patientId);
    const as = row.assessment;
    if (!p || !as) return;
    const patch: Partial<Patient> = {};
    if (as.complaint && as.complaint !== p.complaint) patch.complaint = as.complaint;
    if (typeof as.pain === "number" && !p.painHistory.some((h) => h.date === date && h.score === as.pain))
      patch.painHistory = [...p.painHistory.filter((h) => h.date !== date), { date, score: as.pain }];
    const cond = (as.conditions ?? []).filter((c) => c && !p.conditions.includes(c));
    if (cond.length) patch.conditions = [...p.conditions.filter((c) => !/^ไม่มี/.test(c)), ...cond];
    if (Object.keys(patch).length) st.dispatch({ type: "updatePatient", id: p.id, patch });
  };

  const serviceFor = (name?: string | null, id?: string) => {
    const st = ref.current;
    if (id && st.services.some((s) => s.id === id)) return id;
    if (!name) return st.services[1]?.id ?? st.services[0].id;
    const label = name.split(" · ")[0].trim();
    const exact = st.services.find((s) => s.name === label);
    if (exact) return exact.id;
    const hits = st.services.filter((s) => label.includes(s.name) || s.name.includes(label) || (s.short && label.includes(s.short))).sort((a, b) => b.name.length - a.name.length);
    return (hits[0] ?? st.services[1] ?? st.services[0]).id;
  };
  /** ผู้บำบัดที่ผู้ป่วยเลือก: รหัสจากแอป → ชื่อตรงกัน · ไม่ระบุ = คนแรก */
  const therapistFor = (row: CloudAppt) => {
    const st = ref.current;
    const id = row.assessment?.therapistId;
    return (
      (id ? st.therapists.find((t) => t.id === id) : undefined) ??
      st.therapists.find((t) => row.therapist && (t.name === row.therapist || row.therapist.includes(t.name) || t.name.includes(row.therapist))) ??
      st.therapists[0]
    )?.id ?? "";
  };

  const inbound = (row: CloudAppt) => {
    if (!leader.current) return;
    const st = ref.current;
    known.current.set(row.id, row.status);
    if (row.plan?.summary) planSent.current.add(`${row.id}|${row.plan.summary}|${row.plan.course ? `${row.plan.course.used}/${row.plan.course.total}` : ""}`);
    if (row.status === "billed" && row.bill) billSig.current.set(row.id, billKey(row.bill));
    const local = st.appointments.find((a) => a.cloudId === row.id);
    const prevSig = asSig.current.get(row.id);
    asSig.current.set(row.id, assessSig(row));
    if (row.status === "requested") {
      // ผู้ป่วยประเมินใหม่ระหว่างรออนุมัติ → คำขอใช้ผลรอบล่าสุด (เก็บทุกรอบไว้ดูย้อนหลัง)
      const open = st.requests.find((r) => r.cloudId === row.id);
      // คำขอที่ค้างอยู่แล้ว (มาก่อนมีการผูก) → ผูกกับนัดตามคอร์สวันเดียวกัน
      if (open && !open.courseVisitId) {
        const vid = linkCourseVisit(row, open.patientId, open.serviceId, open.date);
        if (vid) st.dispatch({ type: "updateRequest", id: open.id, patch: { courseVisitId: vid } });
      }
      if (open) {
        const rounds = roundsOf(row);
        if (rounds.length && (rounds.length > (open.assessRounds?.length ?? 1) || rounds[rounds.length - 1].at !== open.assessRounds?.[open.assessRounds.length - 1]?.at)) {
          const as = row.assessment ?? {};
          const who = st.patientById(open.patientId).name;
          syncHealth(open.patientId, row, open.date);
          st.dispatch({ type: "updateRequest", id: open.id, patch: { intake: intakeOf(row, open.intake?.complaint ?? ""), painScore: as.pain ?? open.painScore, screening: screeningOf(as.screening), assessRounds: rounds, note: as.summary ?? open.note, ...(as.guide ? { appGuide: as.guide } : {}) }, log: `${who} ประเมินใหม่ในแอป (รอบที่ ${rounds.length})` });
          if (prevSig !== undefined) {
            toast({ message: `${who} ประเมินใหม่ในแอป · ปวด ${as.pain ?? "-"}/10` });
            void pushNotify("ผู้ป่วยประเมินใหม่", `${who} · รอบที่ ${rounds.length} · ปวด ${as.pain ?? "-"}/10`, "/requests");
          }
        }
        return;
      }
      if (local) return;
      const p = patientFor(row);
      const as = row.assessment ?? {};
      const intake = intakeOf(row, p.complaint);
      syncHealth(p.id, row, row.date ?? todayISO());
      const req: BookingRequest = {
        id: `rq-${row.id}`,
        cloudId: row.id,
        patientId: p.id,
        serviceId: serviceFor(row.service, as.serviceId),
        therapistId: therapistFor(row),
        date: row.date ?? todayISO(),
        start: row.start ?? "10:00",
        painScore: as.pain ?? 5,
        screening: screeningOf(as.screening),
        intake,
        assessRounds: roundsOf(row),
        appGuide: as.guide,
        note: as.summary ?? as.complaint,
        submittedAt: row.created_at,
      };
      // ซ้ำกับนัดตามคอร์สวันเดียวกัน → ผลประเมินไปที่นัดตามคอร์ส + บอกในคำขอ
      const vid = linkCourseVisit(row, p.id, req.serviceId, req.date);
      if (vid) req.courseVisitId = vid;
      st.dispatch({ type: "cloudRequest", request: req });
      toast({ message: `คำขอจองใหม่จากแอป · ${p.name}` });
      void pushNotify("คำขอจองใหม่จากแอป", `${p.name} · ${st.serviceById(req.serviceId).name} ${req.date} ${req.start} น.`, "/requests");
      return;
    }
    if (!local) {
      // นัดจากแอปที่ยืนยันแล้วใน cloud แต่ไม่มีในเครื่องนี้ (ข้อมูลในเครื่องถูกรีเซ็ต / อนุมัติจากอีกเครื่อง)
      // → สร้างกลับจาก cloud เพื่อให้เรียกคิว บันทึก ส่งบิล ไปถึงแอปได้ต่อ
      // (นัดที่คลินิกลงเองมีอยู่ในเครื่องแล้ว — แถว cloud สร้างตามหลัง ไม่ดึงซ้ำ)
      if (["confirmed", "checked_in"].includes(row.status) && row.date && row.start && row.assessment?.source !== "clinic" && !st.requests.some((r) => r.cloudId === row.id) && !adopting.current.has(row.id)) {
        adopting.current.add(row.id);
        const p = patientFor(row);
        st.dispatch({
          type: "schedule",
          items: [{ patientId: p.id, serviceId: serviceFor(row.service, row.assessment?.serviceId), therapistId: therapistFor(row), date: row.date, start: row.start, status: "waiting", type: "booked", painBefore: row.assessment?.pain ?? 5, paid: false, cloudId: row.id, ...(row.assessment?.guide ? { appGuide: row.assessment.guide } : {}), note: "นัดจากแอป ThaiWell (ดึงจาก cloud)", log: [{ at: new Date().toISOString(), label: row.queue_no ? `เช็กอินจากแอป · คิว ${row.queue_no}` : "นัดจากแอป ThaiWell" }] }],
        });
        known.current.set(row.id, row.status);
        slotSig.current.set(row.id, `${row.date}|${row.start}|${row.therapist ?? ""}`);
        return;
      }
      // cancelled in the app before the clinic answered → the pending request goes away
      const req = st.requests.find((r) => r.cloudId === row.id);
      if (req && row.status === "cancelled") {
        st.dispatch({ type: "reject", id: req.id, reason: row.note ?? "ผู้ป่วยยกเลิกจากแอป" });
        void pushNotify("ผู้ป่วยยกเลิกคำขอจอง", `${st.patientById(req.patientId).name} · ${req.date} ${req.start} น.`, "/requests");
      }
      return;
    }
    // นัดที่ยืนยันแล้วและยังไม่เริ่ม: วัน/เวลา/ผู้บำบัดใน cloud คือค่าที่ทั้งสองระบบใช้ร่วมกัน
    if (row.status === "confirmed" && row.date && row.start) {
      const sig = `${row.date}|${row.start}|${row.therapist ?? ""}`;
      if (slotSig.current.get(row.id) !== sig) {
        slotSig.current.set(row.id, sig);
        const t = st.therapists.find((x) => x.name === row.therapist);
        if (local.status === "waiting" && !local.calledAt && (local.date !== row.date || local.start !== row.start || (t && t.id !== local.therapistId)))
          st.dispatch({ type: "updateAppointment", id: local.id, patch: { date: row.date, start: row.start, ...(t ? { therapistId: t.id } : {}) }, log: `ตรงกับนัดในแอป ${row.date} ${row.start} น.` });
      }
    }
    syncPhoto(st.patientById(local.patientId), row.tw_patients);
    // คลินิกข้ามคะแนนหลังนวด → ผู้ป่วยประเมินเองในแอปทีหลัง → ใส่ให้นัดนี้
    const after = row.assessment?.after;
    if (after && typeof after.pain === "number" && local.painAfter === undefined && (local.recordedAt || local.endedAt)) {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { painAfter: after.pain }, log: `ผู้ป่วยประเมินความปวดหลังนวดในแอป · ปวด ${local.painBefore} → ${after.pain}` });
      toast({ message: `${st.patientById(local.patientId).name} ประเมินหลังนวดในแอป · ปวด ${after.pain}/10` });
    }
    {
      const who = st.patientById(local.patientId).name;
      // ประเมินใหม่ก่อนเช็กอิน → ผู้ให้บริการใช้ผลรอบล่าสุด · เช็กอินแล้ว/เริ่มรับบริการ = ล็อก (ไม่รับรอบใหม่)
      const rounds = roundsOf(row);
      const lastAt = rounds[rounds.length - 1]?.at;
      // รับผลประเมินของนัดนี้ได้จนกว่าจะเริ่มนวด (เช็กอิน/เรียกคิวแล้วยังรับ · บอกไว้ในประวัติ)
      const before = !local.startedAt && !local.endedAt && local.status === "waiting";
      const late = !!local.checkinQueue || !!local.calledAt;
      // รอบปลอมจากข้อมูลตั้งต้นของนัดที่คลินิกลงเอง (บันทึกไว้ก่อนมีตัวกรอง) → ลบออก ไม่ให้แสดงเป็นผลประเมิน
      const isStub = (r: AssessRound) => /^นัด(ตามคอร์ส|จากคลินิก)/.test(r.summary ?? "");
      const keep = (local.assessRounds ?? []).filter((r) => !isStub(r));
      if (local.assessRounds && keep.length !== local.assessRounds.length) st.dispatch({ type: "updateAppointment", id: local.id, patch: { assessRounds: keep } });
      // รอบล่าสุดที่รับไว้แล้ว (นัดจากคำขอจอง = รอบตอนจอง)
      const seenAt = keep.length ? keep[keep.length - 1].at : local.intake?.at;
      if (row.assessment && before && lastAt && lastAt !== seenAt) {
        const as = row.assessment;
        syncHealth(local.patientId, row, local.date);
        st.dispatch({ type: "updateAppointment", id: local.id, patch: { intake: intakeOf(row, local.intake?.complaint ?? ""), painBefore: as.pain ?? local.painBefore, screening: screenedIn(as) ? screeningOf(as.screening) : undefined, assessRounds: rounds, ...(as.guide ? { appGuide: as.guide } : {}) }, log: `ผู้ป่วยประเมินใหม่ในแอป (รอบที่ ${rounds.length})${late ? " · หลังเช็กอิน" : ""} · ปวด ${as.pain ?? "-"}/10` });
        if (prevSig !== undefined) {
          toast({ message: `${who} ประเมินใหม่ก่อนนวด · ปวด ${as.pain ?? "-"}/10` });
          void pushNotify("ผู้ป่วยประเมินใหม่ก่อนนวด", `${who} · รอบที่ ${rounds.length} · ปวด ${as.pain ?? "-"}/10`, "/visits");
        }
      } else if (row.assessment && (!local.assessRounds || (row.assessment.guide && !local.appGuide)))
        st.dispatch({ type: "updateAppointment", id: local.id, patch: { assessRounds: local.assessRounds ? keep : rounds, ...(row.assessment.guide ? { appGuide: row.assessment.guide } : {}) } });
      // แจ้งอาการเพิ่มหลังเช็กอิน (ไม่แก้ผลประเมิน) → แสดงแยกให้เห็นชัด + เตือนเจ้าหน้าที่
      const add = row.assessment?.addenda ?? [];
      if (add.length > (local.addenda?.length ?? 0)) {
        const fresh = add.slice(local.addenda?.length ?? 0);
        st.dispatch({ type: "updateAppointment", id: local.id, patch: { addenda: add }, log: `แจ้งอาการเพิ่มหลังเช็กอิน: ${fresh.map((x) => x.text).join(" · ")}` });
        if (prevSig !== undefined) {
          toast({ message: `${who} แจ้งอาการเพิ่ม: ${fresh[fresh.length - 1].text}` });
          void pushNotify("แจ้งอาการเพิ่มหลังเช็กอิน", `${who} · ${fresh[fresh.length - 1].text}`, "/visits");
          st.dispatch({ type: "bridgeIn", event: { id: `add-${row.id}-${add.length}`, at: fresh[fresh.length - 1].at, type: "note", title: "แจ้งอาการเพิ่มหลังเช็กอิน", body: `${who} · ${fresh.map((x) => x.text).join(" · ")}`, patientId: local.patientId } });
        }
      }
    }
    // นัดที่อนุมัติก่อนมีการเก็บแบบคัดกรอง → เติมจากที่ผู้ป่วยตอบในแอป
    const sc = screenedIn(row.assessment) ? row.assessment?.screening : undefined;
    if (!local.screening && sc)
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { screening: { fever: !!sc.fever, highBP: !!sc.highBP, bpSystolic: sc.bpSystolic, menstruation: !!sc.menstruation, pregnant: !!sc.pregnant, recentSurgery: !!sc.recentSurgery, contagious: !!sc.contagious } } });
    const who = st.patientById(local.patientId).name;
    // เช็กอินต้องสแกน QR ที่เคาน์เตอร์ (เปลี่ยนทุก 30 วินาที = มาถึงคลินิกจริง) · รหัสผิด/หมดอายุ/ไม่ใช่วันนัด → ส่งกลับให้สแกนใหม่
    // (เช็กอินที่เคาน์เตอร์ = เจ้าหน้าที่ออกคิวให้แล้ว → ไม่ต้องตรวจ QR)
    // (มีเลขคิวแล้ว = คลินิกออกคิวให้แล้ว ไม่ใช่การเช็กอินจากแอปที่ต้องตรวจ QR)
    if (row.status === "checked_in" && !DEMO && !row.queue_no && !local.checkinQueue && !local.log?.some((l) => l.label.startsWith("เช็กอินจากแอป"))) {
      const token = /^checkin:([A-Za-z0-9]+)/.exec(row.note ?? "")?.[1]?.toUpperCase();
      const secret = st.settings.checkinSecret;
      const reason = local.date !== todayISO() ? "นัดนี้ไม่ใช่วันนี้" : !token ? "ต้องสแกน QR เช็กอินที่เคาน์เตอร์" : !secret || !validCheckinCode(secret, token) ? "รหัส QR หมดอายุหรือไม่ถูกต้อง" : null;
      if (reason) {
        known.current.set(row.id, "confirmed");
        void updateAppt(row.id, { status: "confirmed", note: `checkin-rejected: ${reason} · สแกน QR ที่เคาน์เตอร์อีกครั้ง` });
        void logEvent("clinic", "checkin.rejected", row, row.tw_patients?.name, `เช็กอินไม่ผ่าน · ${reason}`);
        return;
      }
    }
    if (row.status === "checked_in" && !local.checkinQueue && !local.log?.some((l) => l.label.startsWith("เช็กอินจากแอป")) && !issuing.current.has(row.id)) {
      // เลขคิวรันตามลำดับคนมาเช็กอินของวันนี้ (Q001, Q002, …) · ถ้าเครื่องอื่นของคลินิกออกให้ไปแล้ว ใช้ของเดิม
      issuing.current.add(row.id);
      const day = todayISO();
      const last = Math.max(lastQueue.current.get(day) ?? 0, ...st.appointments.filter((x) => x.date === day && x.checkinQueue).map((x) => Number(x.checkinQueue!.slice(1)) || 0));
      const q = row.queue_no?.startsWith("Q") ? row.queue_no : `Q${String(last + 1).padStart(3, "0")}`;
      lastQueue.current.set(day, Math.max(last, Number(q.slice(1)) || 0));
      void (async () => {
        let issued = q;
        if (!row.queue_no) {
          // ออกเลขได้ครั้งเดียว (กันสองเครื่องออกซ้ำ)
          const { data } = await cloud.from("tw_appointments").update({ queue_no: q }).eq("id", row.id).is("queue_no", null).select("queue_no");
          if (!data?.length) {
            const { data: cur } = await cloud.from("tw_appointments").select("queue_no").eq("id", row.id).single();
            issued = (cur?.queue_no as string) ?? q;
          } else void logEvent("clinic", "queue.issued", row, row.tw_patients?.name, `เช็กอินแล้ว ออกเลขคิว ${q} ส่งไปแสดงในแอป`);
        }
        issuing.current.delete(row.id);
        // เครื่องอื่นของคลินิกออกเลขให้แล้ว → ข้อมูลนัดตามมาเอง (ไม่บันทึกซ้ำ)
        if (issued !== q && !row.queue_no) return;
        ref.current.dispatch({ type: "updateAppointment", id: local.id, patch: { checkinQueue: issued, checkedInAt: new Date().toISOString() }, log: `เช็กอินจากแอป · คิว ${issued}` });
        if (issued === q) {
          toast({ message: `${who} เช็กอินแล้ว · คิว ${issued}` });
          void pushNotify("เช็กอินจากแอป", `${who} มาถึงแล้ว · คิว ${issued}`, "/visits");
        }
      })();
    }
    if (row.bill?.status === "paid" && row.bill.via === "app" && local.payment?.status === "pending") {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { payment: { ...local.payment, status: "paid", at: row.bill.paid_at ?? new Date().toISOString() }, paid: true, status: "done" }, log: "ชำระเงินผ่านแอปแล้ว" });
      known.current.set(row.id, "paid");
      toast({ message: `${who} ชำระผ่านแอปแล้ว ${row.bill.amount} บาท` });
      void pushNotify("ชำระผ่านแอปแล้ว", `${who} · ${row.bill.amount} บาท`, "/billing");
    }
    if (row.status === "cancelled" && local.status !== "cancelled" && !local.startedAt) {
      st.dispatch({ type: "updateAppointment", id: local.id, patch: { status: "cancelled", cancel: { at: new Date().toISOString(), by: "patient", reason: row.note ?? "ยกเลิกจากแอป", staff: "แอป ThaiWell" } }, log: "ผู้ป่วยยกเลิกนัดจากแอป" });
      void pushNotify("ผู้ป่วยยกเลิกนัดจากแอป", `${who} · ${local.date} ${local.start} น.`, "/appointments");
    }
  };

  // first load + live updates
  useEffect(() => {
    let alive = true;
    const join = "*, tw_patients(*)";
    // ข้อมูลสาธิตชุดเดียวกับแอป: รีเซ็ตที่ขอไว้ → ใส่ใหม่ทั้งหมด · ครั้งแรก → ใส่ส่วนที่ยังไม่มี
    // ข้อมูลสาธิต (เฉพาะโหมดสาธิต/ทดสอบ) · ใช้งานจริงไม่แตะ cloud
    void (!DEMO ? Promise.resolve() : takeDemoReseed() ? resetDemoCloud(ref.current) : ensureDemoCloud(ref.current))
      .catch(() => undefined)
      .then(() => {
        // โหลดนัดที่ยังไม่จบทั้งหมด (ตอนเปิด และตอนเครื่องนี้ได้รับหน้าที่แทนเครื่องอื่น)
        reloadOpen.current = () =>
          void cloud
            .from("tw_appointments")
            .select(join)
            .not("status", "in", "(closed,rejected,cancelled)")
            .order("created_at")
            .then(({ data }) => {
              if (!alive) return;
              (data as CloudAppt[] | null)?.forEach(inbound);
              setReady(true);
            });
        if (leader.current) reloadOpen.current();
        else setReady(true);
      });
    // จองหน้าที่รับ/ส่งข้อมูลกับแอป (ใช้งานจริงเปิดหลายเครื่องได้)
    const claim = async () => {
      if (DEMO) return;
      // อ่านไม่ได้ (เน็ตหลุด/เปลี่ยนหน้า) → คงสถานะเดิม รอบถัดไปลองใหม่
      const { data, error } = await Promise.resolve(cloud.from("tw_events").select("payload").eq("id", LEADER_ID).maybeSingle()).catch((e: unknown) => ({ data: null, error: e }));
      if (error) return;
      const cur = (data?.payload ?? null) as { device?: string; at?: string } | null;
      const free = !cur?.device || cur.device === BRIDGE_DEVICE || Date.now() - Date.parse(cur.at ?? "") > LEADER_TTL;
      const was = leader.current;
      if (free && !document.hidden) {
        const { error: e } = await Promise.resolve(cloud.from("tw_events").upsert({ id: LEADER_ID, source: "system", kind: "bridge.leader", summary: "เครื่องที่รับ/ส่งข้อมูลกับแอป", payload: { device: BRIDGE_DEVICE, at: new Date().toISOString() } })).catch((x: unknown) => ({ error: x }));
        if (e) return;
        leader.current = true;
      } else leader.current = false;
      if (leader.current && !was) reloadOpen.current();
    };
    void claim();
    const lead = window.setInterval(() => void claim(), 5000);
    // เวลาว่างจริงของคลินิก → แอปบนมือถือใช้จองรอบที่ว่างจริง
    const avail = window.setInterval(() => {
      try {
        void publishCloudAvailability(localStorage.getItem(AVAILABILITY_KEY)).catch(() => undefined);
      } catch {
        /* storage unavailable */
      }
    }, 3000);
    const ch = cloud
      .channel("tw-clinic")
      // ผู้ใช้เปลี่ยนรูปโปรไฟล์ในแอป (ไม่ต้องรอจองครั้งถัดไป)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tw_patients" }, (ev) => {
        const cp = ev.new as NonNullable<CloudAppt["tw_patients"]>;
        const p = ref.current.patients.find((x) => x.cloudId === cp?.id);
        if (p && leader.current) syncPhoto(p, cp);
        // แอปถูกล้าง/สร้างบัญชีใหม่ (HN หาย) → ลืมว่าเคยส่งแล้ว ให้ส่ง HN + คอร์ส + ประวัติไปใหม่
        if (p && cp && cp.clinic_hn !== p.hn) courseSig.current.delete(cp.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tw_appointments" }, async (ev) => {
        const id = (ev.new as CloudAppt)?.id;
        if (!id) return;
        const { data } = await cloud.from("tw_appointments").select(join).eq("id", id).single();
        if (data) inbound(data as CloudAppt);
      })
      // notes the app sends outside a booking (pre-visit self-check, how the patient felt afterwards, complaints) become notifications
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tw_events", filter: "kind=eq.app.note" }, (ev) => {
        const row = ev.new as CloudEvent;
        const p = (row.payload ?? {}) as { title?: string; body?: string; patientId?: string };
        if (row.source !== "app" || !p.title || !leader.current) return;
        const local = p.patientId ? ref.current.patients.find((x) => x.cloudId === p.patientId) : undefined;
        ref.current.dispatch({ type: "bridgeIn", event: { id: `ev${row.id}`, at: row.at, type: "note", title: p.title, body: p.body ?? row.summary ?? "", patientId: local?.id } });
        void pushNotify(p.title, p.body ?? row.summary ?? "", local ? "/patients" : undefined);
        // ผลประเมินที่มาเป็นข้อความ (แอปรุ่นเก่า / ไม่พบนัด) → ผูกกับนัดของวันนั้น ให้แสดงตามวันที่มารักษา
        if (local && /ประเมิน/.test(p.title)) attachNoteAssessment(local.id, row.at, `${p.title} · ${p.body ?? ""}`);
      })
      .subscribe();
    // สำรอง: realtime หลุดได้ (iPad พักหน้าจอ / Wi-Fi) → ตรวจการจองที่ยังไม่จบทุก 5 วินาที
    const poll = window.setInterval(async () => {
      if (!leader.current) return;
      const open = [...known.current].filter(([, st]) => !["paid", "closed", "rejected", "cancelled", "no_show"].includes(st)).map(([id]) => id);
      // บันทึกโดยข้ามคะแนนหลังนวด (14 วันล่าสุด) → รอผู้ป่วยประเมินหลังนวดในแอป
      const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
      for (const a of ref.current.appointments) if (a.cloudId && a.recordedAt && a.painAfter === undefined && a.date >= since && !open.includes(a.cloudId)) open.push(a.cloudId);
      if (!open.length) return;
      const { data } = await cloud.from("tw_appointments").select(join).in("id", open);
      (data as CloudAppt[] | null)?.forEach((r) => {
        if (r.status !== known.current.get(r.id) || r.status === "checked_in" || assessSig(r) !== asSig.current.get(r.id)) inbound(r);
      });
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(lead);
      window.clearInterval(poll);
      window.clearInterval(avail);
      void cloud.removeChannel(ch);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // นัดที่คลินิกลงเอง (นัดตามคอร์ส / จัดตารางนัด / นัดหน้าร้าน) ของผู้ป่วยที่ใช้แอป → ส่งไปแสดงในแอปของเจ้าของ
  // เป็นแถวใน cloud แบบเดียวกับนัดจากแอป → เช็กอิน เรียกคิว ผลการรักษา บิล ไปถึงแอปทางเดิมทั้งหมด
  useEffect(() => {
    if (!ready || DEMO || !leader.current) return;
    const today = todayISO();
    for (const a of store.appointments) {
      if (a.cloudId || a.status !== "waiting" || a.startedAt || a.date < today) continue;
      const p = store.patientById(a.patientId);
      if (!p.cloudId) continue;
      const id = `cl-${a.id}`;
      if (creating.current.has(id)) continue;
      creating.current.add(id);
      const s = store.serviceById(a.serviceId);
      const t = store.therapistById(a.therapistId);
      // ครั้งที่เท่าไหร่ของคอร์ส (นัดของบริการตามคอร์ส ตั้งแต่เปิดคอร์ส เรียงตามวัน)
      const c = p.course && p.course.serviceId === a.serviceId ? p.course : undefined;
      const no = c
        ? store.appointments.filter((x) => x.patientId === p.id && x.serviceId === c.serviceId && x.status !== "cancelled" && x.status !== "absent" && x.date >= c.startedOn && `${x.date}${x.start}` <= `${a.date}${a.start}`).length
        : 0;
      const course = c ? { name: c.name, no, total: c.total } : undefined;
      void Promise.resolve(
        cloud.from("tw_appointments").upsert(
          {
            id,
            patient_id: p.cloudId,
            status: "confirmed",
            service: s.name,
            date: a.date,
            start: a.start,
            therapist: t.name,
            assessment: { source: "clinic", serviceId: s.id, therapistId: t.id, ...(course ? { course } : {}), summary: course ? `นัดตามคอร์ส ${course.name} ครั้งที่ ${no}/${course.total}` : "นัดจากคลินิก" },
          },
          { onConflict: "id", ignoreDuplicates: true },
        ),
      ).then(({ error }) => {
        if (error) return void creating.current.delete(id);
        known.current.set(id, "confirmed");
        slotSig.current.set(id, `${a.date}|${a.start}|${t.name}`);
        ref.current.dispatch({ type: "updateAppointment", id: a.id, patch: { cloudId: id }, log: "ส่งนัดไปแสดงในแอป ThaiWell ของผู้ป่วย" });
        void logEvent("clinic", "booking.clinic", { id }, p.name, `คลินิกลงนัด ${a.date} ${a.start} น. · ${s.name}${course ? ` · คอร์ส ครั้งที่ ${no}/${course.total}` : ""}`);
      });
    }
  }, [ready, store.appointments]); // eslint-disable-line react-hooks/exhaustive-deps

  // นัดที่ส่งไปแอปก่อนเปิดคอร์ส (จองนัดตามแผนก่อนแพทย์อนุมัติ) / คอร์สเปลี่ยน → ใส่ "ครั้งที่ n/ทั้งหมด" ให้นัดในแอปตามจริง
  // รวมกับ assessment เดิมของแถว (ไม่ทับผลประเมินที่ผู้ป่วยส่งมา)
  useEffect(() => {
    if (!ready || DEMO || !leader.current) return;
    for (const p of store.patients) {
      const c = p.course;
      if (!p.cloudId || !c) continue;
      const mine = store.appointments
        .filter((x) => x.patientId === p.id && x.serviceId === c.serviceId && x.status !== "cancelled" && x.status !== "absent" && x.date >= c.startedOn)
        .sort((x, y) => `${x.date}${x.start}`.localeCompare(`${y.date}${y.start}`));
      mine.forEach((a, i) => {
        if (!a.cloudId || a.status !== "waiting" || a.startedAt) return;
        const course = { name: c.name, no: i + 1, total: c.total };
        const sig = `${course.name}|${course.no}/${course.total}`;
        if (visitNoSig.current.get(a.cloudId) === sig) return;
        visitNoSig.current.set(a.cloudId, sig);
        const id = a.cloudId;
        void Promise.resolve(cloud.from("tw_appointments").select("assessment").eq("id", id).maybeSingle()).then(({ data, error }) => {
          if (error || !data) return void visitNoSig.current.delete(id);
          const as = (data.assessment ?? {}) as Record<string, unknown> & { course?: { name: string; no: number; total: number } };
          if (as.course && `${as.course.name}|${as.course.no}/${as.course.total}` === sig) return;
          const next = { ...as, course, ...(as.source === "clinic" ? { summary: `นัดตามคอร์ส ${course.name} ครั้งที่ ${course.no}/${course.total}` } : {}) };
          void cloud.from("tw_appointments").update({ assessment: next }).eq("id", id).then(({ error: e }) => e && visitNoSig.current.delete(id));
        });
      });
    }
  }, [ready, store.patients, store.appointments]); // eslint-disable-line react-hooks/exhaustive-deps

  // HN + คอร์สของผู้ป่วยที่ใช้แอป (ชื่อ จำนวนครั้ง ใช้ไป หมดอายุ) → แสดงในแอปของเจ้าของ
  useEffect(() => {
    if (!ready || DEMO || !leader.current) return;
    for (const p of store.patients) {
      if (!p.cloudId) continue;
      const c = p.course;
      const course = c ? { name: c.name, service: store.serviceById(c.serviceId).name, total: c.total, used: c.used, startedOn: c.startedOn, expiresOn: c.expiresOn, billing: coursePrepaid(p, store.biz.sales) ? "prepaid" : "perVisit" } : null;
      // ประวัติการรักษาที่คลินิก (นวดเสร็จแล้ว ล่าสุดก่อน) → แอปของเจ้าของ
      const visits = store.appointments
        .filter((a) => a.patientId === p.id && (a.status === "done" || (a.endedAt && isRecorded(a))))
        .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))
        .slice(0, 30)
        .map((a) => ({
          id: a.id,
          date: a.date,
          start: a.start,
          service: store.serviceById(a.serviceId).name,
          therapist: store.therapistById(a.therapistId).name,
          painBefore: a.painBefore,
          painAfter: a.painAfter,
          findings: a.findings,
          diagnoses: a.diagnoses?.map((d) => d.name),
          procedures: a.procedures?.map((x) => [x.name, x.area, x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")),
          advice: a.advice,
        }));
      const sig = JSON.stringify(course) + JSON.stringify(visits);
      if (courseSig.current.get(p.cloudId) === `${p.hn}|${sig}`) continue;
      courseSig.current.set(p.cloudId, `${p.hn}|${sig}`);
      const cid = p.cloudId;
      const hn = p.hn;
      void (async () => {
        const { data } = await cloud.from("tw_patients").select("profile,clinic_hn").eq("id", cid).maybeSingle();
        if (!data) return;
        const prof = (data.profile ?? {}) as { course?: unknown; visits?: unknown };
        const sameCourse = JSON.stringify(prof.course ?? null) + JSON.stringify(prof.visits ?? []) === sig;
        // HN ของคลินิกไปแสดงในโปรไฟล์แอปด้วย
        if (sameCourse && data.clinic_hn === hn) return;
        await cloud.from("tw_patients").update({ clinic_hn: hn, ...(sameCourse ? {} : { profile: { ...prof, course, visits } }) }).eq("id", cid);
      })();
    }
  }, [ready, store.patients, store.appointments]); // eslint-disable-line react-hooks/exhaustive-deps

  // clinic → app: push every forward step of a linked booking
  useEffect(() => {
    if (!ready || !leader.current) return;
    for (const a of store.appointments) {
      if (!a.cloudId) continue;
      const was = known.current.get(a.cloudId);
      if (!was) continue; // finished / unknown in the cloud — leave it
      const d = derive(store, a);
      // เลื่อนนัดในหลังบ้าน (ยังไม่ถึงคิว) → แจ้งแอปวัน/เวลา/ผู้บำบัดใหม่
      if (was === "confirmed" && d.status === "confirmed") {
        const t = store.therapistById(a.therapistId).name;
        const sig = `${a.date}|${a.start}|${t}`;
        const prev = slotSig.current.get(a.cloudId);
        if (prev && prev !== sig) {
          slotSig.current.set(a.cloudId, sig);
          const name = store.patientById(a.patientId).name;
          void updateAppt(a.cloudId, { date: a.date, start: a.start, therapist: t }).then(() => logEvent("clinic", "booking.moved", { id: a.cloudId! }, name, `เลื่อนนัดเป็น ${a.date} ${a.start} น. · ${t}`));
        }
        continue;
      }
      const name = store.patientById(a.patientId).name;
      // แก้ยอดบิลระหว่างรอชำระ → แอปได้ยอดใหม่
      if (was === "billed" && d.status === "billed") {
        const sig = billKey(d.patch.bill);
        if (billSig.current.get(a.cloudId) !== sig) {
          const first = !billSig.current.has(a.cloudId);
          billSig.current.set(a.cloudId, sig);
          if (!first) void updateAppt(a.cloudId, d.patch).then(() => logEvent("clinic", "bill.updated", { id: a.cloudId! }, name, `แก้บิลเป็น ${d.patch.bill?.amount ?? 0} บาท`));
        }
        continue;
      }
      const back = d.status === "cancelled" || d.status === "no_show";
      // เลิกยกเลิก / เลิกบันทึกไม่มา → นัดกลับมาในแอป
      const revive = (was === "cancelled" || was === "no_show") && !back;
      // ยกเลิกใบเสร็จ → บิลเดิมในแอปถูกยกเลิก (รอชำระใหม่)
      const voided = (was === "paid" || was === "billed") && d.status === "recorded";
      if (was === d.status || (!back && !revive && !voided && rank(d.status) <= rank(was))) continue;
      known.current.set(a.cloudId, d.status);
      if (d.patch.bill) billSig.current.set(a.cloudId, billKey(d.patch.bill));
      void updateAppt(a.cloudId, { status: d.status, ...d.patch, ...(voided ? { bill: null } : {}), ...(revive ? { note: null } : {}) })
        .then(() => logEvent("clinic", voided ? "bill.voided" : revive ? "booking.restored" : d.kind, { id: a.cloudId! }, name, voided ? "ยกเลิกใบเสร็จ · รอชำระใหม่" : revive ? `คืนนัด ${a.date} ${a.start} น.` : d.summary))
        .catch(() => known.current.set(a.cloudId!, was ?? "requested"));
    }
    for (const dec of store.decisions) {
      const id = dec.request.cloudId;
      if (!id || dec.outcome !== "rejected" || known.current.get(id) !== "requested") continue;
      known.current.set(id, "rejected");
      void updateAppt(id, { status: "rejected", note: dec.reason }).then(() => logEvent("clinic", "booking.rejected", { id }, store.patientById(dec.request.patientId).name, `ปฏิเสธคำขอจอง · ${dec.reason ?? ""}`));
    }
    // an approved treatment plan goes to the patient's app
    for (const p of store.patients) {
      if (!p.cloudId || !p.aiPlan?.approved) continue;
      const appt = [...store.appointments].reverse().find((a) => a.patientId === p.id && a.cloudId && known.current.has(a.cloudId));
      const course = p.course ? { name: p.course.name, total: p.course.total, used: p.course.used } : undefined;
      const key = `${appt?.cloudId}|${p.aiPlan.summary}|${course ? `${course.used}/${course.total}` : ""}`;
      if (!appt?.cloudId || planSent.current.has(key)) continue;
      planSent.current.add(key);
      const pl = p.aiPlan;
      void updateAppt(appt.cloudId, { plan: { summary: pl.summary, sessions: pl.sessions, frequency: pl.frequency, phases: pl.phases.map((x) => ({ title: x.title, weeks: x.weeks, focus: x.focus })), homeCare: pl.homeCare, ...(course ? { course } : {}) } }).then(() =>
        logEvent("clinic", "plan.shared", { id: appt.cloudId! }, p.name, `ส่งแผนการรักษา ${pl.sessions} ครั้ง (${pl.frequency}) ไปแสดงในแอป`),
      );
    }
  }, [ready, store.appointments, store.decisions, store.patients]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
