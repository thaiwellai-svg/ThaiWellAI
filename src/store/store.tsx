import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import type { AuditEntry, Appointment, AppointmentStatus, BookingRequest, ClinicSettings, Notification, Patient, RequestDecision, Service, Therapist, DayException } from "../data/types";
import { createSeed, DEFAULT_SETTINGS, SERVICES, THERAPISTS } from "../data/seed";
import { todayISO } from "../data/thaiDate";
import { withBirthDate } from "../data/elements";
import { defaultBiz, type Biz } from "../data/biz";
import { beat, BRIDGE_KEY, publishAvailability, sendToApp, takeNewAppEvents, type AppEvent } from "../features/appBridge";
import { slotLoad } from "../features/slotLoad";
import { staffState } from "../data/domain";

interface State {
  version: number;
  seededOn: string;
  patients: Patient[];
  appointments: Appointment[];
  requests: BookingRequest[];
  notifications: Notification[];
  decisions: RequestDecision[];
  settings: ClinicSettings;
  /** therapists with the shifts & services they registered — editable by staff */
  therapists: Therapist[];
  /** services & prices — editable in Settings */
  services: Service[];
  /** audit trail (newest first) */
  audit: AuditEntry[];
  /** stock, packages, commission, day close, waitlist, issued documents */
  biz: Biz;
  /** true = real data: don't replace with fresh demo data when the day changes */
  keepData?: boolean;
}

type Action =
  | { type: "approve"; id: string; patch: Pick<Appointment, "date" | "start" | "therapistId" | "serviceId"> }
  | { type: "reject"; id: string; reason: string; note?: string }
  | { type: "restoreRequest"; request: BookingRequest }
  /** a booking that arrived from the patient app (cloud); ignored if already here */
  | { type: "cloudRequest"; request: BookingRequest }
  | { type: "setStatus"; id: string; status: AppointmentStatus; painAfter?: number }
  | { type: "togglePaid"; id: string }
  | { type: "updateAppointment"; id: string; patch: Partial<Appointment>; log?: string }
  | { type: "restoreAppointment"; appointment: Appointment }
  | { type: "schedule"; items: Omit<Appointment, "id">[] }
  | { type: "removeAppointments"; ids: string[] }
  | { type: "addPatient"; patient: Patient }
  | { type: "updatePatient"; id: string; patch: Partial<Patient> }
  | { type: "updateSettings"; patch: Partial<ClinicSettings> }
  | { type: "updateTherapist"; id: string; patch: Partial<Pick<Therapist, "shifts" | "services">> }
  | { type: "saveService"; service: Service }
  | { type: "saveTherapist"; therapist: Pick<Therapist, "id" | "name" | "role" | "color" | "phone" | "photo"> }
  | { type: "removeTherapist"; id: string }
  | { type: "removeService"; id: string }
  | { type: "setException"; id: string; date: string; exception: DayException | null }
  | { type: "readNotifications" }
  | { type: "readNotification"; id: string }
  | { type: "dismissNotification"; id: string }
  | { type: "voidPayment"; id: string; reason: string; refund: boolean }
  | { type: "restoreBackup"; state: State }
  | { type: "setKeepData"; on: boolean }
  | { type: "biz"; update: (b: Biz) => Biz; log: string; cat?: AuditEntry["cat"]; patientId?: string }
  | { type: "bridgeIn"; event: AppEvent }
  | { type: "reset" };

const VERSION = 25;
const KEY = "thaiwell.backoffice";

function fresh(): State {
  const seed = createSeed();
  return { version: VERSION, seededOn: todayISO(), ...seed, patients: seed.patients.map(withBirthDate), settings: DEFAULT_SETTINGS, therapists: THERAPISTS, services: SERVICES, audit: [], biz: defaultBiz() };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      // Demo data is relative to "today" — reseed when the day rolls over.
      if (s.keepData || (s.version === VERSION && s.seededOn === todayISO())) return {
          ...s,
          // older saves: services lived in code, shifts had no per-block services
          services: s.services ?? SERVICES,
          settings: { ...DEFAULT_SETTINGS, ...s.settings },
          audit: s.audit ?? [],
          biz: { ...defaultBiz(), ...(s.biz ?? {}) },
          patients: s.patients.map(withBirthDate),
          therapists: (s.therapists ?? THERAPISTS).map((t) => ({ ...t, shifts: t.shifts.map((x) => ({ ...x, services: x.services ?? t.services })) })),
        };
      // new demo data (new day or new version) — keep the clinic setup and the user's profile
      if (s.settings) return { ...fresh(), settings: { ...DEFAULT_SETTINGS, ...s.settings }, audit: s.audit ?? [], biz: s.biz ? { ...defaultBiz(), ...s.biz, sales: [], moves: [], closings: [], waitlist: [], docs: [] } : defaultBiz() };
    }
  } catch {
    /* storage unavailable — fall through to seed */
  }
  return fresh();
}

const byCredit = (a: Appointment) => a.payment?.method === "credit" && a.payment.status === "paid";

let uid = Date.now();
const nextId = (p: string) => `${p}${(uid++).toString(36)}`;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "approve": {
      const req = state.requests.find((r) => r.id === action.id);
      if (!req) return state;
      const appt: Appointment = {
        id: nextId("a"),
        patientId: req.patientId,
        status: "waiting",
        type: "booked",
        painBefore: req.painScore,
        paid: false,
        intake: req.intake,
        ...(req.id.startsWith("app-") ? { bridgeRef: req.id } : {}),
        cloudId: req.cloudId,
        ...action.patch,
      };
      const decision: RequestDecision = {
        id: nextId("d"),
        request: req,
        outcome: "approved",
        slot: { date: action.patch.date, start: action.patch.start, therapistId: action.patch.therapistId },
        decidedAt: new Date().toISOString(),
        decidedBy: state.settings.staffName,
      };
      return {
        ...state,
        requests: state.requests.filter((r) => r.id !== action.id),
        appointments: [...state.appointments, appt],
        decisions: [decision, ...state.decisions],
      };
    }
    case "reject": {
      const req = state.requests.find((r) => r.id === action.id);
      if (!req) return state;
      const decision: RequestDecision = {
        id: nextId("d"),
        request: req,
        outcome: "rejected",
        reason: action.reason,
        note: action.note,
        decidedAt: new Date().toISOString(),
        decidedBy: state.settings.staffName,
      };
      return { ...state, requests: state.requests.filter((r) => r.id !== action.id), decisions: [decision, ...state.decisions] };
    }
    case "cloudRequest":
      if (state.requests.some((r) => r.cloudId === action.request.cloudId) || state.appointments.some((a) => a.cloudId === action.request.cloudId) || state.decisions.some((d) => d.request.cloudId === action.request.cloudId)) return state;
      return { ...state, requests: [action.request, ...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) };
    case "restoreRequest":
      // undo of a rejection: bring the request back and drop its decision
      return {
        ...state,
        requests: [action.request, ...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
        decisions: state.decisions.filter((d) => d.request.id !== action.request.id),
      };
    case "setStatus": {
      let patients = state.patients;
      const appointments = state.appointments.map((a) => {
        if (a.id !== action.id) return a;
        // Completing a session consumes one course credit; undoing it refunds.
        const wasDone = a.status === "done";
        const isDone = action.status === "done";
        if (wasDone !== isDone) {
          patients = patients.map((p) =>
            p.id === a.patientId && p.course ? { ...p, course: { ...p.course, used: Math.max(0, p.course.used + (isDone ? 1 : -1)) } } : p,
          );
        }
        return { ...a, status: action.status, painAfter: isDone ? (action.painAfter ?? a.painAfter) : a.painAfter };
      });
      return { ...state, appointments, patients };
    }
    case "updateAppointment":
    case "restoreAppointment": {
      const id = action.type === "updateAppointment" ? action.id : action.appointment.id;
      let patients = state.patients;
      const appointments = state.appointments.map((a) => {
        if (a.id !== id) return a;
        const next: Appointment =
          action.type === "updateAppointment"
            ? { ...a, ...action.patch, log: action.log ? [...(a.log ?? []), { at: new Date().toISOString(), label: action.log }] : a.log }
            : action.appointment;
        // a course credit is used only when the visit is paid *with* the credit; cancelling that receipt (or undo) gives it back
        const wasCredit = byCredit(a);
        const isCredit = byCredit(next);
        if (wasCredit !== isCredit)
          patients = patients.map((p) =>
            p.id === a.patientId && p.course ? { ...p, course: { ...p.course, used: Math.max(0, p.course.used + (isCredit ? 1 : -1)) } } : p,
          );
        return next;
      });
      return { ...state, appointments, patients };
    }
    case "togglePaid":
      return { ...state, appointments: state.appointments.map((a) => (a.id === action.id ? { ...a, paid: !a.paid } : a)) };
    case "schedule":
      return { ...state, appointments: [...state.appointments, ...action.items.map((i) => ({ ...i, id: nextId("a") }))] };
    case "removeAppointments":
      return { ...state, appointments: state.appointments.filter((a) => !action.ids.includes(a.id)) };
    case "addPatient":
      return { ...state, patients: [action.patient, ...state.patients] };
    case "bridgeIn": {
      // จากแอปผู้ป่วย: คำขอจอง (+ ลงทะเบียนผู้ป่วยถ้ายังไม่มี) · แจ้งเตือนทั่วไป
      const e = action.event;
      if (e.type === "booking") {
        if (state.requests.some((r) => r.id === e.request.id)) return state;
        const known = state.patients.some((p) => p.id === e.patient.id);
        const patients = known ? state.patients.map((p) => (p.id === e.patient.id ? { ...p, complaint: e.patient.complaint } : p)) : [e.patient, ...state.patients];
        const svc = state.services.find((x) => x.id === e.request.serviceId);
        const n: Notification = { id: nextId("n"), kind: "request", title: "คำขอจองจากแอป", body: `${e.patient.name} ขอจอง${svc ? svc.name : ""} · ${e.request.date} ${e.request.start} น.`, at: e.at, read: false, link: "/requests", ref: e.request.id };
        return { ...state, patients, requests: [e.request, ...state.requests], notifications: [n, ...state.notifications] };
      }
      const n: Notification = { id: nextId("n"), kind: "alert", title: e.title, body: e.body, at: e.at, read: false, link: e.patientId ? "/patients" : undefined, ref: e.patientId };
      return { ...state, notifications: [n, ...state.notifications] };
    }
    case "updatePatient":
      return { ...state, patients: state.patients.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)) };
    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "updateTherapist":
      return { ...state, therapists: state.therapists.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)) };
    case "saveService": {
      const exists = state.services.some((x) => x.id === action.service.id);
      return {
        ...state,
        services: exists ? state.services.map((x) => (x.id === action.service.id ? action.service : x)) : [...state.services, action.service],
      };
    }
    case "saveTherapist": {
      const p = action.therapist;
      const exists = state.therapists.some((t) => t.id === p.id);
      return {
        ...state,
        therapists: exists
          ? state.therapists.map((t) => (t.id === p.id ? { ...t, ...p } : t))
          : [...state.therapists, { ...p, shifts: [], services: [] }],
      };
    }
    case "removeTherapist":
      return { ...state, therapists: state.therapists.filter((t) => t.id !== action.id) };
    case "removeService":
      return {
        ...state,
        services: state.services.filter((x) => x.id !== action.id),
        // drop it from every therapist's blocks
        therapists: state.therapists.map((t) => {
          const shifts = t.shifts.map((x) => ({ ...x, services: x.services.filter((id) => id !== action.id) }));
          return { ...t, shifts, services: t.services.filter((id) => id !== action.id) };
        }),
      };
    case "setException":
      return {
        ...state,
        therapists: state.therapists.map((t) => {
          if (t.id !== action.id) return t;
          const exceptions = { ...(t.exceptions ?? {}) };
          if (action.exception) exceptions[action.date] = action.exception;
          else delete exceptions[action.date];
          return { ...t, exceptions };
        }),
      };
    case "readNotification":
      return { ...state, notifications: state.notifications.map((n) => (n.id === action.id ? { ...n, read: true } : n)) };
    case "dismissNotification":
      return { ...state, notifications: state.notifications.filter((n) => n.id !== action.id) };
    case "readNotifications":
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };
    case "voidPayment": {
      const a = state.appointments.find((x) => x.id === action.id);
      if (!a?.payment) return state;
      const voided = { at: new Date().toISOString(), by: state.settings.staffName, reason: action.reason, refund: action.refund };
      return reducer(state, {
        type: "updateAppointment",
        id: a.id,
        // receipt moves to the voided list; the visit goes back to "รอชำระเงิน" so it can be paid again
        patch: { paid: false, status: "active", payment: undefined, voidedPayments: [...(a.voidedPayments ?? []), { ...a.payment, status: "void", voided }] },
        log: `ยกเลิกใบเสร็จ ${a.payment.no ?? ""}${action.refund ? " · คืนเงิน" : ""} · ${action.reason}`,
      });
    }
    case "restoreBackup":
      return { ...action.state, keepData: true, audit: action.state.audit ?? [] };
    case "setKeepData":
      return { ...state, keepData: action.on };
    case "biz":
      return { ...state, biz: action.update(state.biz) };
    case "reset":
      // new demo data, but keep the clinic setup and the signed-in user's profile
      return { ...fresh(), settings: state.settings, audit: state.audit };
  }
}

/** human-readable line for the audit trail (null = not worth recording) */
function describe(prev: State, action: Action): Omit<AuditEntry, "id" | "at" | "by"> | null {
  const appt = (id: string) => prev.appointments.find((a) => a.id === id);
  const SETTING: Record<string, string> = { clinicName: "ชื่อคลินิก", promptpayId: "พร้อมเพย์", autoSendSlip: "ส่งสลิปอัตโนมัติ", rooms: "ห้องและเตียง", staffName: "ชื่อผู้ใช้", staffRole: "ตำแหน่ง", openTime: "เวลาเปิด", closeTime: "เวลาปิด", closedWeekdays: "วันเปิดทำการ", bedsPerSlot: "จำนวนเตียงต่อรอบ", requireApproval: "การอนุมัติคำขอ", callVoice: "เสียงเรียกคิว", bpThreshold: "เกณฑ์ความดัน" };
  switch (action.type) {
    case "cloudRequest":
      return { cat: "นัดหมาย", text: "รับคำขอจองจากแอป ThaiWell AI", patientId: action.request.patientId };
    case "approve": {
      const r = prev.requests.find((x) => x.id === action.id);
      return { cat: "นัดหมาย", text: `อนุมัติคำขอจอง ${action.patch.date} ${action.patch.start}`, patientId: r?.patientId };
    }
    case "reject": {
      const r = prev.requests.find((x) => x.id === action.id);
      return { cat: "นัดหมาย", text: `ปฏิเสธคำขอจอง · ${action.reason}`, patientId: r?.patientId };
    }
    case "setStatus":
      return { cat: "นัดหมาย", text: `เปลี่ยนสถานะนัดเป็น ${action.status}`, patientId: appt(action.id)?.patientId };
    case "togglePaid":
      return { cat: "การเงิน", text: "สลับสถานะชำระเงิน", patientId: appt(action.id)?.patientId };
    case "updateAppointment": {
      const a = appt(action.id);
      const keys = Object.keys(action.patch);
      const cat = keys.some((k) => k === "payment" || k === "paid") ? "การเงิน" : keys.some((k) => ["diagnoses", "procedures", "painAfter", "advice"].includes(k)) ? "เวชระเบียน" : "นัดหมาย";
      const text =
        action.log ??
        (keys.includes("diagnoses") ? "แก้ไขการวินิจฉัย" : keys.includes("procedures") ? "แก้ไขหัตถการ" : keys.includes("date") || keys.includes("start") ? "เลื่อนนัด" : "แก้ไขข้อมูลการรับบริการ");
      return { cat, text, patientId: a?.patientId };
    }
    case "restoreAppointment":
      return { cat: "นัดหมาย", text: "เลิกทำการเปลี่ยนแปลงล่าสุด", patientId: action.appointment.patientId };
    case "schedule":
      return { cat: "นัดหมาย", text: `สร้างนัด ${action.items.length} รายการ`, patientId: action.items[0]?.patientId };
    case "removeAppointments":
      return { cat: "นัดหมาย", text: `ลบนัด ${action.ids.length} รายการ`, patientId: appt(action.ids[0])?.patientId };
    case "addPatient":
      return { cat: "ผู้ป่วย", text: `ลงทะเบียนผู้ป่วยใหม่ ${action.patient.hn}`, patientId: action.patient.id };
    case "bridgeIn":
      return action.event.type === "booking"
        ? { cat: "นัดหมาย", text: `รับคำขอจองจากแอป ${action.event.request.date} ${action.event.request.start}`, patientId: action.event.patient.id }
        : { cat: "ระบบ", text: `แจ้งจากแอป: ${action.event.title}` };
    case "updatePatient": {
      const k = Object.keys(action.patch);
      const NAMES: Record<string, string> = { photo: "รูปโปรไฟล์", course: "คอร์ส", aiPlan: "แผนการรักษา AI", documents: "เอกสารแนบ", birthMonth: "เดือนเกิด", complaint: "อาการสำคัญ", conditions: "โรคประจำตัว", allergies: "การแพ้", phone: "เบอร์โทร" };
      return { cat: "ผู้ป่วย", text: `แก้ไข ${k.map((x) => NAMES[x] ?? x).join(", ")}`, patientId: action.id };
    }
    case "updateSettings":
      return { cat: "ตั้งค่า", text: `แก้ไข ${Object.keys(action.patch).map((k) => SETTING[k] ?? k).join(", ")}` };
    case "updateTherapist":
      return { cat: "ตั้งค่า", text: `แก้ไขตารางงาน ${prev.therapists.find((t) => t.id === action.id)?.name ?? ""}` };
    case "saveService":
      return { cat: "ตั้งค่า", text: `บันทึกบริการ ${action.service.name} · ${action.service.price} บาท` };
    case "removeService":
      return { cat: "ตั้งค่า", text: `ลบบริการ ${prev.services.find((x) => x.id === action.id)?.name ?? ""}` };
    case "saveTherapist":
      return { cat: "ตั้งค่า", text: `บันทึกข้อมูลผู้บำบัด ${action.therapist.name}` };
    case "removeTherapist":
      return { cat: "ตั้งค่า", text: `ลบผู้บำบัด ${prev.therapists.find((t) => t.id === action.id)?.name ?? ""}` };
    case "setException":
      return { cat: "ตั้งค่า", text: `${action.exception ? (action.exception.kind === "leave" ? "บันทึกวันลา" : "ปรับเวลางาน") : "ล้างการปรับเวลา"} ${prev.therapists.find((t) => t.id === action.id)?.name ?? ""} ${action.date}` };
    case "voidPayment": {
      const a = appt(action.id);
      return { cat: "การเงิน", text: `ยกเลิกใบเสร็จ ${a?.payment?.no ?? ""}${action.refund ? " · คืนเงิน " + (a?.payment?.amount ?? 0) + " บาท" : ""} · ${action.reason}`, patientId: a?.patientId };
    }
    case "restoreBackup":
      return { cat: "ระบบ", text: "กู้คืนข้อมูลจากไฟล์สำรอง" };
    case "setKeepData":
      return { cat: "ระบบ", text: action.on ? "เปิดใช้ข้อมูลจริง (ไม่รีเซ็ตรายวัน)" : "กลับไปใช้ข้อมูลตัวอย่างรายวัน" };
    case "biz":
      return { cat: action.cat ?? "การเงิน", text: action.log, patientId: action.patientId };
    case "reset":
      return { cat: "ระบบ", text: "รีเซ็ตข้อมูลตัวอย่าง" };
    default:
      return null;
  }
}

/** every change goes through here so the audit trail can't be skipped */
function auditedReducer(state: State, action: Action): State {
  const next = reducer(state, action);
  if (next === state) return state;
  const d = describe(state, action);
  if (!d) return next;
  const entry: AuditEntry = { id: `log${(uid++).toString(36)}`, at: new Date().toISOString(), by: state.settings.staffName, ...(d.patientId ? d : { cat: d.cat, text: d.text }) };
  return { ...next, audit: [entry, ...(next.audit ?? [])].slice(0, 3000) };
}

interface Store extends State {
  dispatch: Dispatch<Action>;
  patientById: (id: string) => Patient;
  serviceById: (id: string) => Service;
  therapistById: (id: string) => Therapist;
  nextId: typeof nextId;
}


const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(auditedReducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }, [state]);

  /* ---------- สะพานไปแอปผู้ป่วย (ต้นแบบ · localStorage เบราว์เซอร์เดียวกัน) ---------- */
  // รับ: คำขอจอง/แจ้งเตือนจากแอป — ตอนเปิด · เมื่อแท็บแอปเขียน (storage event) · สำรองทุก 2 วินาที
  useEffect(() => {
    const pull = () => takeNewAppEvents().forEach((event) => dispatch({ type: "bridgeIn", event }));
    beat();
    pull();
    const onStorage = (e: StorageEvent) => e.key === BRIDGE_KEY && pull();
    window.addEventListener("storage", onStorage);
    const t = setInterval(() => {
      beat();
      pull();
    }, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);
  // ประกาศเวลาว่างจริง 7 วันข้างหน้า (สูตรเดียวกับหน้าอนุมัติ: เตียงว่าง + ผู้บำบัดเข้าเวร รับบริการนั้น ยังไม่มีคิว)
  useEffect(() => {
    const days: Record<string, Record<string, Record<string, string[]>>> = {};
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const beds = slotLoad(state.appointments, date, state.settings);
      const now = new Date();
      const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      for (const slot of beds) {
        if (slot.free <= 0 || (i === 0 && slot.time <= nowHM)) continue;
        for (const svc of state.services) {
          const free = state.therapists.filter((t) => staffState(t, { date, start: slot.time, serviceId: svc.id }, state.appointments) === "free").map((t) => t.id);
          if (!free.length) continue;
          ((days[date] ??= {})[slot.time] ??= {})[svc.id] = free;
        }
      }
    }
    publishAvailability({ at: new Date().toISOString(), clinicName: state.settings.clinicName, therapists: state.therapists.map((t) => ({ id: t.id, name: t.name, role: t.role })), days });
  }, [state.appointments, state.therapists, state.services, state.settings]);
  // ส่ง: ผลการพิจารณาคำขอจากแอป · นวดเสร็จ (คะแนนหลังนวด) · ยกเลิก/ไม่มา
  useEffect(() => {
    for (const d of state.decisions) {
      if (!d.request.id.startsWith("app-")) continue;
      if (d.outcome === "approved" && d.slot) {
        const t = state.therapists.find((x) => x.id === d.slot!.therapistId);
        const svc = state.services.find((x) => x.id === d.request.serviceId);
        sendToApp(`approved:${d.request.id}`, { type: "approved", ref: d.request.id, date: d.slot.date, start: d.slot.start, therapist: t?.name ?? "", service: svc?.id ?? d.request.serviceId });
      } else if (d.outcome === "rejected") sendToApp(`rejected:${d.request.id}`, { type: "rejected", ref: d.request.id, reason: d.reason ?? "" });
    }
    for (const a of state.appointments) {
      if (!a.patientId.startsWith("app-p-")) continue;
      // บันทึกคะแนนหลังนวดแล้ว (ขั้นบันทึกการรักษา — ก่อนชำระเงิน) หรือปิดนัด → นวดเสร็จ
      const finished = a.painAfter !== undefined || a.status === "done";
      if (a.bridgeRef) {
        if (finished) sendToApp(`done:${a.bridgeRef}`, { type: "completed", ref: a.bridgeRef, painBefore: a.painBefore, painAfter: a.painAfter });
        else if (a.status === "cancelled" || a.status === "absent") sendToApp(`${a.status}:${a.bridgeRef}`, { type: a.status, ref: a.bridgeRef });
      } else if (finished) {
        // ครั้งต่อ ๆ ไปตามแผนของคลินิก
        sendToApp(`visit:${a.id}`, { type: "visit", patientId: a.patientId, apptId: a.id, date: a.date, painBefore: a.painBefore, painAfter: a.painAfter ?? a.painBefore });
      }
    }
    // แผนการรักษา: นัดถัดไปที่ยังไม่ถึง (รอรับบริการ) ของผู้ป่วยจากแอป · ส่งใหม่เมื่อเปลี่ยน
    const today = todayISO();
    const appPatients = state.patients.filter((p) => p.id.startsWith("app-p-"));
    for (const p of appPatients) {
      const up = state.appointments
        .filter((a) => a.patientId === p.id && a.status === "waiting" && a.painAfter === undefined && a.date >= today && !a.bridgeRef)
        .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
      const first = up[0];
      const next = first ? { date: first.date, start: first.start, therapist: state.therapists.find((t) => t.id === first.therapistId)?.name ?? "" } : null;
      const course = p.course ? { name: p.course.name, total: p.course.total, used: p.course.used } : undefined;
      if (!next && !course) continue;
      sendToApp(`plan:${p.id}:${JSON.stringify([next, up.length, course])}`, { type: "plan", patientId: p.id, next, upcoming: up.length, course });
    }
  }, [state.decisions, state.appointments, state.therapists, state.services, state.patients]);

  const patientMap = useMemo(() => new Map(state.patients.map((p) => [p.id, p])), [state.patients]);
  const patientById = useCallback((id: string) => patientMap.get(id) ?? state.patients[0], [patientMap, state.patients]);

  const serviceById = useCallback(
    (id: string) => state.services.find((x) => x.id === id) ?? SERVICES.find((x) => x.id === id) ?? state.services[0] ?? SERVICES[0],
    [state.services],
  );
  const therapistById = useCallback(
    (id: string) => state.therapists.find((t) => t.id === id) ?? state.therapists[0],
    [state.therapists],
  );

  const value = useMemo<Store>(
    () => ({ ...state, dispatch, patientById, serviceById, therapistById, nextId }),
    [state, patientById, serviceById, therapistById],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export type { State as StoreState };

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}
