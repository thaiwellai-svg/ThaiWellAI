import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import type { AuditEntry, Appointment, AppointmentStatus, BookingRequest, ClinicSettings, Notification, Patient, RequestDecision, Service, Therapist, DayException } from "../data/types";
import { createSeed, DEFAULT_SETTINGS, SERVICES, THERAPISTS } from "../data/seed";
import { todayISO } from "../data/thaiDate";
import { withBirthDate } from "../data/elements";
import { defaultBiz, type Biz } from "../data/biz";
import { DEMO } from "../data/mode";
import { beat, BRIDGE_KEY, publishAvailability, sendToApp, takeNewAppEvents, type AppEvent } from "../features/appBridge";
import { slotLoad } from "../features/slotLoad";
import { staffState } from "../data/domain";

export interface State {
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
  | { type: "reset" }
  /** ข้อมูลจากฐานข้อมูล (ตอนเข้าสู่ระบบ) */
  | { type: "hydrate"; state: State }
  /** อีกเครื่องแก้ข้อมูล (realtime) */
  | { type: "remote"; update: (s: State) => State };

const VERSION = 26;
const KEY = "thaiwell.backoffice";

const MISSING_PATIENT: Patient = { id: "", hn: "-", name: "ไม่พบข้อมูลผู้ป่วย", gender: "หญิง", age: 0, phone: "", conditions: [], complaint: "", painHistory: [], registeredOn: "" };
const MISSING_THERAPIST: Therapist = { id: "", name: "ยังไม่ระบุผู้บำบัด", role: "", color: "#8a8f87", shifts: [], services: [] };


/** ใช้งานจริง: เริ่มจากว่าง — มีแค่บริการตั้งต้น (แก้ได้ในตั้งค่า) และค่าตั้งต้นของคลินิก */
export function emptyLive(): State {
  const b = defaultBiz();
  return {
    version: VERSION,
    seededOn: todayISO(),
    patients: [],
    appointments: [],
    requests: [],
    notifications: [],
    decisions: [],
    settings: { ...DEFAULT_SETTINGS, staffName: "เจ้าหน้าที่คลินิก", staffRole: "เจ้าหน้าที่ประจำคลินิก" },
    therapists: [],
    services: SERVICES,
    audit: [],
    biz: { ...b, items: [], usage: {}, packages: [], rates: {} },
    keepData: true,
  };
}

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

const byCredit = (a: Appointment) => (a.payment?.method === "credit" || !!a.payment?.credit) && a.payment.status === "paid";

let uid = Date.now();
const nextId = (p: string) => `${p}${(uid++).toString(36)}`;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "remote":
      return action.update(state);
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
        screening: req.screening,
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
    case "cloudRequest": {
      if (state.requests.some((r) => r.cloudId === action.request.cloudId) || state.appointments.some((a) => a.cloudId === action.request.cloudId) || state.decisions.some((d) => d.request.cloudId === action.request.cloudId)) return state;
      // the bell shows it too, like a request that came over the browser bridge
      const p = state.patients.find((x) => x.id === action.request.patientId);
      const svc = state.services.find((x) => x.id === action.request.serviceId);
      const n: Notification = { id: nextId("n"), kind: "request", title: "คำขอจองจากแอป", body: `${p?.name ?? "ผู้ใช้แอป"} ขอจอง${svc?.name ?? ""} · ${action.request.date} ${action.request.start} น.`, at: action.request.submittedAt, read: false, link: "/requests", ref: action.request.id };
      return { ...state, requests: [action.request, ...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), notifications: [n, ...state.notifications] };
    }
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
      // จากแอปผู้ป่วย: คำขอจอง (+ ลงทะเบียนผู้ป่วยถ้ายังไม่มี) · เช็กอิน · ประเมินก่อน/หลังนวด · ยกเลิก · จ่ายบิล · แจ้งเตือนทั่วไป
      const e = action.event;
      const now = new Date().toISOString();
      const notify = (title: string, body: string, kind: Notification["kind"], ref?: string, link = "/appointments"): Notification => ({ id: nextId("n"), kind, title, body, at: e.at, read: false, link, ref });
      if (e.type === "booking") {
        if (state.requests.some((r) => r.id === e.request.id)) return state;
        const known = state.patients.some((p) => p.id === e.patient.id);
        const patients = known ? state.patients.map((p) => (p.id === e.patient.id ? { ...p, complaint: e.patient.complaint } : p)) : [e.patient, ...state.patients];
        const svc = state.services.find((x) => x.id === e.request.serviceId);
        const n = notify("คำขอจองจากแอป", `${e.patient.name} ขอจอง${svc ? svc.name : ""} · ${e.request.date} ${e.request.start} น.`, "request", e.request.id, "/requests");
        return { ...state, patients, requests: [e.request, ...state.requests], notifications: [n, ...state.notifications] };
      }
      if (e.type === "note") return { ...state, notifications: [notify(e.title, e.body, "alert", e.patientId, e.patientId ? "/patients" : ""), ...state.notifications] };
      // นัดที่แอปหมายถึง: id นัด หรือคำขอที่อนุมัติแล้ว (bridgeRef)
      const appt = state.appointments.find((a) => (e.apptId && a.id === e.apptId) || (e.ref && a.bridgeRef === e.ref));
      const pname = (pid?: string) => state.patients.find((p) => p.id === pid)?.name ?? "ผู้ป่วย";
      const patchAppt = (patch: Partial<Appointment>, label: string) =>
        state.appointments.map((a) => (a.id === appt!.id ? { ...a, ...patch, log: [...(a.log ?? []), { at: now, label }] } : a));
      if (e.type === "cancel") {
        // ยังเป็นคำขอ (ยังไม่อนุมัติ) → ปิดคำขอ · อนุมัติแล้ว → ยกเลิกนัด
        const req = !appt && e.ref ? state.requests.find((r) => r.id === e.ref) : undefined;
        if (req) {
          const decision: RequestDecision = { id: nextId("d"), request: req, outcome: "rejected", reason: `ผู้ป่วยยกเลิกจากแอป${e.reason ? ` · ${e.reason}` : ""}`, decidedAt: now, decidedBy: "แอป ThaiWell AI" };
          return { ...state, requests: state.requests.filter((r) => r.id !== req.id), decisions: [decision, ...state.decisions], notifications: [notify("ผู้ป่วยยกเลิกคำขอจอง", `${pname(req.patientId)} · ${req.date} ${req.start} น.`, "info", req.id, "/requests"), ...state.notifications] };
        }
        if (!appt || appt.status === "cancelled" || appt.startedAt) return state;
        return {
          ...state,
          appointments: patchAppt({ status: "cancelled", cancel: { at: now, by: "patient", reason: e.reason || "ยกเลิกจากแอป", staff: "แอป ThaiWell AI" } }, "ผู้ป่วยยกเลิกนัดจากแอป"),
          notifications: [notify("ผู้ป่วยยกเลิกนัดจากแอป", `${pname(appt.patientId)} · ${appt.date} ${appt.start} น.`, "info", appt.id), ...state.notifications],
        };
      }
      if (!appt) return state;
      if (e.type === "checkin") {
        if (appt.log?.some((l) => l.label.startsWith("เช็กอินจากแอป"))) return state;
        return { ...state, appointments: patchAppt({}, "เช็กอินจากแอป"), notifications: [notify("ผู้ป่วยเช็กอินจากแอป", `${pname(appt.patientId)} · นัด ${appt.start} น.`, "info", appt.id), ...state.notifications] };
      }
      if (e.type === "preVisit") {
        const extra = [e.adverse && e.adverse !== "ไม่มี" ? `หลังนวดครั้งก่อน${e.adverse}` : "", e.risk && e.risk !== "ไม่มี" ? e.risk : ""].filter(Boolean).join(" · ");
        return {
          ...state,
          appointments: patchAppt(appt.startedAt ? {} : { painBefore: e.pain }, `ประเมินก่อนนวดจากแอป · ปวด ${e.pain}/10${extra ? ` · ${extra}` : ""}`),
          notifications: [notify(e.red ? "ประเมินก่อนนวด: ควรพบแพทย์ก่อน" : "ประเมินก่อนนวดจากแอป", `${pname(appt.patientId)} · ปวด ${e.pain}/10${extra ? ` · ${extra}` : ""}`, e.red ? "alert" : "info", appt.id), ...state.notifications],
        };
      }
      if (e.type === "selfPost") {
        const extra = e.adverse?.filter((x) => x !== "ไม่มี").join(", ");
        return {
          ...state,
          appointments: patchAppt({}, `ประเมินหลังนวดจากแอป · ปวด ${e.pain}/10${extra ? ` · ${extra}` : ""}`),
          notifications: [notify(extra ? "อาการผิดปกติหลังนวด (แอป)" : "ประเมินหลังนวดจากแอป", `${pname(appt.patientId)} · ปวด ${e.pain}/10${extra ? ` · ${extra}` : ""}`, extra ? "alert" : "info", appt.id), ...state.notifications],
        };
      }
      if (e.type === "pay") {
        if (appt.payment?.status !== "pending") return state;
        return {
          ...state,
          appointments: patchAppt({ payment: { ...appt.payment, status: "paid", method: "app", at: now, no: appt.payment.no ?? `RC-APP-${Date.now().toString().slice(-6)}` }, paid: true, status: "done" }, "ชำระเงินผ่านแอปแล้ว"),
          notifications: [notify("ชำระเงินผ่านแอปแล้ว", `${pname(appt.patientId)} · ${appt.payment.amount} บาท`, "info", appt.id, "/billing"), ...state.notifications],
        };
      }
      return state;
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
          : // ผู้บำบัดใหม่: เข้าเวรตามเวลาเปิดคลินิก (วันที่เปิด) รับทุกบริการ — ปรับได้ที่หน้าจัดตารางงาน
            [
              ...state.therapists,
              {
                ...p,
                shifts: [{ days: [0, 1, 2, 3, 4, 5, 6].filter((d) => !state.settings.closedWeekdays.includes(d)), start: state.settings.openTime, end: state.settings.closeTime, services: state.services.map((x) => x.id) }],
                services: state.services.map((x) => x.id),
              },
            ],
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
    case "bridgeIn": {
      const e = action.event;
      if (e.type === "booking") return { cat: "นัดหมาย", text: `รับคำขอจองจากแอป ${e.request.date} ${e.request.start}`, patientId: e.patient.id };
      if (e.type === "note") return { cat: "ระบบ", text: `แจ้งจากแอป: ${e.title}` };
      const label: Record<string, string> = { checkin: "ผู้ป่วยเช็กอินจากแอป", preVisit: "รับผลประเมินก่อนนวดจากแอป", selfPost: "รับผลประเมินหลังนวดจากแอป", cancel: "ผู้ป่วยยกเลิกจากแอป", pay: "ชำระเงินผ่านแอป" };
      return { cat: e.type === "pay" ? "การเงิน" : "นัดหมาย", text: label[e.type] ?? "แอป" };
    }
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
  // ใช้งานจริง: เริ่มว่าง แล้วรับข้อมูลจากฐานข้อมูลหลังเข้าสู่ระบบ (DbSync) · สาธิต/ทดสอบ: ข้อมูลจำลองในเครื่อง
  const [state, dispatch] = useReducer(auditedReducer, undefined, () => (DEMO ? load() : emptyLive()));

  useEffect(() => {
    if (!DEMO) return;
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
    const st = state.settings;
    publishAvailability({
      at: new Date().toISOString(),
      clinicName: st.clinicName,
      clinic: { name: st.clinicName, address: st.clinicAddress, phone: st.clinicPhone, lat: st.clinicLat, lng: st.clinicLng },
      queue: (() => {
        const today = todayISO();
        const checked = state.appointments.filter((a) => a.date === today && a.checkinQueue);
        const serving = [...checked].filter((a) => a.calledAt).sort((a, b) => b.calledAt!.localeCompare(a.calledAt!))[0]?.checkinQueue;
        const waiting = checked.filter((a) => !a.calledAt && a.status === "waiting").map((a) => a.checkinQueue!).sort();
        return { date: today, serving, waiting };
      })(),
      // avatar ที่เลือก (ไม่ส่งรูปถ่าย — ใหญ่เกินไป) → แอปแสดงภาพเดียวกัน
      therapists: state.therapists.map((t) => ({ id: t.id, name: t.name, role: t.role, photo: t.photo?.startsWith("avatar:") ? t.photo : undefined })),
      days,
    });
  }, [state.appointments, state.therapists, state.services, state.settings]);
  // ส่ง: ผลการพิจารณาคำขอจากแอป · นวดเสร็จ (คะแนนหลังนวด) · ยกเลิก/ไม่มา
  useEffect(() => {
    for (const d of state.decisions) {
      if (!d.request.id.startsWith("app-")) continue;
      if (d.outcome === "approved" && d.slot) {
        const t = state.therapists.find((x) => x.id === d.slot!.therapistId);
        const svc = state.services.find((x) => x.id === d.request.serviceId);
        const appt = state.appointments.find((a) => a.bridgeRef === d.request.id);
        sendToApp(`approved:${d.request.id}`, { type: "approved", ref: d.request.id, apptId: appt?.id, date: d.slot.date, start: d.slot.start, therapist: t?.name ?? "", service: svc?.id ?? d.request.serviceId });
      } else if (d.outcome === "rejected") sendToApp(`rejected:${d.request.id}`, { type: "rejected", ref: d.request.id, reason: d.reason ?? "" });
    }
    const tName = (id: string) => state.therapists.find((t) => t.id === id)?.name ?? "";
    // เลขคิวแบบเดียวกับหน้านัด (ลำดับในวันนั้น)
    const queueOf = (a: Appointment) => {
      const day = state.appointments.filter((x) => x.date === a.date).sort((x, y) => x.start.localeCompare(y.start) || x.id.localeCompare(y.id));
      return `A${String(day.findIndex((x) => x.id === a.id) + 1).padStart(3, "0")}`;
    };
    for (const a of state.appointments) {
      if (!a.patientId.startsWith("app-p-")) continue;
      const base = { patientId: a.patientId, apptId: a.id, ref: a.bridgeRef };
      // วันนัด: เช็กอิน (เลขคิว) · เรียกคิว · เริ่มรับบริการ
      if (a.log?.some((l) => l.label.startsWith("เช็กอินจากแอป"))) sendToApp(`checkin:${a.id}`, { type: "status", ...base, state: "checked_in", queue: queueOf(a) });
      if (a.calledAt) sendToApp(`called:${a.id}`, { type: "status", ...base, state: "called", queue: queueOf(a) });
      if (a.startedAt) sendToApp(`started:${a.id}`, { type: "status", ...base, state: "in_service" });
      // บันทึกการรักษา (คะแนนหลังนวดที่ผู้ป่วยเลือก + วินิจฉัย หัตถการ คำแนะนำ) — ตั้งแต่ขั้นบันทึก ไม่ต้องรอชำระเงิน
      const finished = a.painAfter !== undefined || a.status === "done";
      const rec = {
        findings: a.findings,
        diagnoses: a.diagnoses?.map((d) => d.name),
        procedures: a.procedures?.map((x) => [x.name, x.area, x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")),
        advice: a.advice,
        therapist: tName(a.therapistId),
      };
      if (a.bridgeRef) {
        // คลินิกย้ายนัด (วัน/เวลา/ผู้บำบัด) ก่อนรับบริการ → แจ้งแอป (ครั้งแรกตรงกับที่อนุมัติ แอปไม่แจ้งซ้ำ)
        if (a.status === "waiting" && !a.startedAt) sendToApp(`slot:${a.id}:${a.date} ${a.start} ${a.therapistId}`, { type: "moved", ref: a.bridgeRef, apptId: a.id, date: a.date, start: a.start, therapist: tName(a.therapistId) });
        if (finished) sendToApp(`done:${a.bridgeRef}`, { type: "completed", ref: a.bridgeRef, apptId: a.id, painBefore: a.painBefore, painAfter: a.painAfter, ...rec });
        else if (a.status === "cancelled" || a.status === "absent") sendToApp(`${a.status}:${a.bridgeRef}`, { type: a.status, ref: a.bridgeRef });
      } else if (finished) {
        // ครั้งต่อ ๆ ไปตามแผนของคลินิก
        sendToApp(`visit:${a.id}`, { type: "visit", patientId: a.patientId, apptId: a.id, date: a.date, painBefore: a.painBefore, painAfter: a.painAfter ?? a.painBefore, ...rec });
      }
      // บิลจริงของคลินิก: ส่งเรียกเก็บในแอป · ชำระแล้ว (ใบเสร็จ)
      const pay = a.payment;
      if (pay && pay.status !== "void") {
        const svc = state.services.find((x) => x.id === a.serviceId);
        sendToApp(`bill:${a.id}:${pay.status}`, { type: "bill", ...base, amount: pay.amount, items: [svc?.name ?? "ค่าบริการ"], status: pay.status, receiptNo: pay.no, paidAt: pay.status === "paid" ? pay.at : undefined });
      }
    }
    // แผนการรักษา: นัดถัดไปที่ยังไม่ถึง (รอรับบริการ) + คอร์ส + แผนที่แพทย์อนุมัติ · ส่งใหม่เมื่อเปลี่ยน
    const today = todayISO();
    for (const p of state.patients.filter((x) => x.id.startsWith("app-p-"))) {
      const up = state.appointments
        .filter((a) => a.patientId === p.id && a.status === "waiting" && a.painAfter === undefined && a.date >= today && !a.bridgeRef)
        .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
      const first = up[0];
      const next = first ? { apptId: first.id, date: first.date, start: first.start, therapist: tName(first.therapistId) } : null;
      const course = p.course ? { name: p.course.name, total: p.course.total, used: p.course.used } : undefined;
      const approvedPlan = p.aiPlan?.approved ? { summary: p.aiPlan.summary, sessions: p.aiPlan.sessions, frequency: p.aiPlan.frequency, homeCare: p.aiPlan.homeCare } : undefined;
      if (!next && !course && !approvedPlan) continue;
      sendToApp(`plan:${p.id}:${JSON.stringify([next, up.length, course, approvedPlan?.summary])}`, { type: "plan", patientId: p.id, next, upcoming: up.length, course, approvedPlan });
    }
  }, [state.decisions, state.appointments, state.therapists, state.services, state.patients]);

  const patientMap = useMemo(() => new Map(state.patients.map((p) => [p.id, p])), [state.patients]);
  // ไม่พบ (เช่น คลินิกใหม่ยังไม่มีข้อมูล / ถูกลบ) → ค่าว่างที่แสดงผลได้ ไม่ให้หน้าพัง
  const patientById = useCallback((id: string) => patientMap.get(id) ?? state.patients[0] ?? MISSING_PATIENT, [patientMap, state.patients]);

  const serviceById = useCallback(
    (id: string) => state.services.find((x) => x.id === id) ?? SERVICES.find((x) => x.id === id) ?? state.services[0] ?? SERVICES[0],
    [state.services],
  );
  const therapistById = useCallback(
    (id: string) => state.therapists.find((t) => t.id === id) ?? state.therapists[0] ?? MISSING_THERAPIST,
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
