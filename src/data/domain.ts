import type { Appointment, AppointmentStatus, ClinicSettings, DayBlock, Patient, Screening, Therapist } from "./types";
import { LIVE } from "./mode";
import type { BadgeTone } from "../design-system";
import { fromISODate, todayISO } from "./thaiDate";

export const STATUS_META: Record<AppointmentStatus, { label: string; tone: BadgeTone; color: string }> = {
  done: { label: "รับบริการแล้ว", tone: "success", color: "var(--status-done)" },
  waiting: { label: "รอรับบริการ", tone: "warning", color: "var(--status-waiting)" },
  active: { label: "กำลังรับบริการ", tone: "info", color: "var(--status-active)" },
  absent: { label: "ไม่มารับบริการ", tone: "danger", color: "var(--status-absent)" },
  cancelled: { label: "ยกเลิก", tone: "neutral", color: "var(--neutral-400)" },
};

export type Stage = "checkin" | "waiting" | "called" | "treating" | "assess" | "billing" | "done" | "absent" | "cancelled";

/** Where a visit is in the counter flow: รอ → เรียกคิว → รับบริการ → ประเมิน → ชำระเงิน → เสร็จสิ้น */
export function stageOf(a: Appointment): Stage {
  if (a.status === "absent" || a.status === "cancelled") return a.status;
  if (a.status === "done") return "done";
  // ใช้งานจริง: ยังไม่เช็กอิน (สแกน QR / เช็กอินที่เคาน์เตอร์) → ยังไม่มีคิว
  if (a.status === "waiting") return a.calledAt ? "called" : LIVE && !a.checkinQueue ? "checkin" : "waiting";
  if (!a.endedAt) return "treating";
  return isRecorded(a) ? "billing" : "assess";
}

/** บันทึกการรักษาแล้ว: มีคะแนนหลังนวด หรือบันทึกโดยข้ามคะแนนหลังนวด */
export const isRecorded = (a: Pick<Appointment, "painAfter" | "recordedAt">) => a.painAfter !== undefined || !!a.recordedAt;

export const STAGE_META: Record<Stage, { label: string; tone: BadgeTone; color: string; next?: string }> = {
  checkin: { label: "รอเช็กอินเข้ารับบริการ", tone: "neutral", color: "var(--neutral-400)", next: "เช็กอิน" },
  waiting: { label: "รอรับบริการ", tone: "warning", color: "var(--status-waiting)", next: "เรียกคิว" },
  called: { label: "เรียกคิวแล้ว", tone: "info", color: "#3b82c4", next: "เริ่ม" },
  treating: { label: "กำลังรับบริการ", tone: "info", color: "var(--status-active)", next: "จบ" },
  assess: { label: "รอบันทึกการรักษา", tone: "info", color: "#7c5cc4", next: "บันทึก" },
  billing: { label: "รอชำระเงิน", tone: "warning", color: "#d97706", next: "คิดเงิน" },
  done: { label: "เสร็จสิ้น", tone: "success", color: "var(--status-done)" },
  absent: { label: "ไม่มารับบริการ", tone: "danger", color: "var(--status-absent)" },
  cancelled: { label: "ยกเลิก", tone: "neutral", color: "var(--neutral-400)" },
};
export const stageMeta = (a: Appointment) => {
  const st = stageOf(a);
  // finished but money still outstanding
  if (st === "done" && !a.paid) return a.payment?.status === "pending" ? { ...STAGE_META.done, label: "รอชำระในแอป", tone: "info" as BadgeTone } : { ...STAGE_META.done, label: "ค้างชำระ", tone: "danger" as BadgeTone };
  return STAGE_META[st];
};

/** today's queue that wasn't called within 15 minutes of its start time */
export function isOverdue(a: Appointment, now = new Date()) {
  if (a.status !== "waiting" || a.calledAt) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (a.date !== today) return a.date < today;
  const [h, m] = a.start.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m + 15;
}

/** dashboard order: in progress → upcoming → overdue / no-show → finished */
export function jobRank(a: Appointment) {
  const st = stageOf(a);
  if (st === "called" || st === "treating" || st === "assess" || st === "billing") return 0;
  if (st === "waiting") return isOverdue(a) ? 2 : 1;
  if (st === "absent") return 2;
  return 3;
}

export function painTone(score: number): BadgeTone {
  if (score >= 7) return "danger";
  if (score >= 4) return "warning";
  return "success";
}

export interface ScreeningFlag {
  key: keyof Screening;
  label: string;
  level: "stop" | "caution";
  advice: string;
}

/** Rule engine — deterministic & traceable (concept paper §4.4). No generative AI in the safety path. */
export function evaluateScreening(s: Screening, settings: ClinicSettings): ScreeningFlag[] {
  const flags: ScreeningFlag[] = [];
  if (s.contagious) flags.push({ key: "contagious", label: "โรคติดต่อระยะแพร่กระจาย", level: "stop", advice: "งดให้บริการ แนะนำพบแพทย์" });
  if (s.fever) flags.push({ key: "fever", label: "มีไข้", level: "stop", advice: "งดนวดจนกว่าไข้ลด" });
  if (s.pregnant) flags.push({ key: "pregnant", label: "ตั้งครรภ์", level: "stop", advice: "ต้องให้แพทย์แผนไทยประเมินก่อน" });
  if (s.recentSurgery)
    flags.push({ key: "recentSurgery", label: `ผ่าตัดไม่เกิน ${settings.surgeryRecoveryDays} วัน`, level: "stop", advice: "เลื่อนนัดจนพ้นระยะพักฟื้น" });
  if (s.highBP)
    flags.push({
      key: "highBP",
      label: s.bpSystolic ? `ความดันสูง ${s.bpSystolic} mmHg` : "ความดันโลหิตสูง",
      level: (s.bpSystolic ?? 0) >= settings.bpThreshold ? "stop" : "caution",
      advice: `วัดความดันซ้ำหน้างาน · เกิน ${settings.bpThreshold} ต้องพบแพทย์แผนไทย`,
    });
  if (s.menstruation) flags.push({ key: "menstruation", label: "มีประจำเดือน", level: "caution", advice: "หลีกเลี่ยงการกดท้องและหลังส่วนล่าง" });
  return flags;
}

export const SCREENING_QUESTIONS: { key: keyof Screening; label: string }[] = [
  { key: "contagious", label: "โรคติดต่อระยะแพร่กระจาย" },
  { key: "fever", label: "มีไข้" },
  { key: "highBP", label: "ความดันโลหิตสูง" },
  { key: "menstruation", label: "มีประจำเดือน" },
  { key: "pregnant", label: "ตั้งครรภ์" },
  { key: "recentSurgery", label: "อยู่ในช่วงพักฟื้นหลังผ่าตัด" },
];

export interface CreditInfo {
  total: number;
  used: number;
  booked: number;
  remaining: number;
}

/** Remaining = plan total − sessions used − future sessions already booked (pain point §3.1). */
/**
 * คอร์สนี้จ่ายล่วงหน้าแล้วหรือไม่ (มาแต่ละครั้ง = หักเครดิต)
 * คอร์สเก่าที่ยังไม่ระบุ: มีการขายแพ็กเกจให้ผู้ป่วยคนนี้ = จ่ายล่วงหน้า · ไม่มี (เปิดจากแผนการรักษา) = ชำระรายครั้ง · ข้อมูลสาธิต = จ่ายล่วงหน้า
 */
export function coursePrepaid(patient: Pick<Patient, "id" | "course">, sales: { patientId: string }[]): boolean {
  const c = patient.course;
  if (!c) return false;
  if (c.billing) return c.billing === "prepaid";
  return !LIVE || sales.some((s) => s.patientId === patient.id);
}

export function creditInfo(patient: Patient, appointments: Appointment[]): CreditInfo | null {
  if (!patient.course) return null;
  const today = todayISO();
  const booked = appointments.filter(
    (a) => a.patientId === patient.id && (a.status === "waiting" || a.status === "active") && a.date >= today,
  ).length;
  const { total, used } = patient.course;
  return { total, used, booked, remaining: Math.max(0, total - used - booked) };
}

export interface RequestConflict {
  kind: "full" | "therapist" | "double";
  label: string;
}

/** Why a pending booking request can't simply be approved as asked — staff should call the patient. */
export function requestConflicts(
  req: { patientId: string; therapistId: string; serviceId?: string; date: string; start: string },
  appointments: Appointment[],
  settings: ClinicSettings,
  therapists?: Therapist[],
): RequestConflict[] {
  const same = appointments.filter((a) => a.date === req.date && a.status !== "cancelled" && a.status !== "absent");
  const out: RequestConflict[] = [];
  if (same.filter((a) => a.start === req.start).length >= settings.bedsPerSlot) out.push({ kind: "full", label: "รอบเวลาเต็ม" });
  else {
    const t = therapists?.find((x) => x.id === req.therapistId);
    const st = t && req.serviceId ? staffState(t, { date: req.date, start: req.start, serviceId: req.serviceId }, appointments) : null;
    if (st === "off") out.push({ kind: "therapist", label: "ผู้บำบัดไม่เข้าเวร" });
    else if (st === "service") out.push({ kind: "therapist", label: "ผู้บำบัดไม่รับบริการนี้" });
    else if (same.some((a) => a.start === req.start && a.therapistId === req.therapistId)) out.push({ kind: "therapist", label: "ผู้บำบัดไม่ว่าง" });
  }
  if (same.some((a) => a.patientId === req.patientId)) out.push({ kind: "double", label: "มีนัดวันนี้แล้ว" });
  return out;
}

/* ── Therapist availability ──────────────────────────────── */

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** The blocks a therapist works on a date: that date's exception if any, else the weekly schedule. */
export function blocksOn(t: Therapist, date: string): DayBlock[] {
  const ex = t.exceptions?.[date];
  if (ex) return ex.kind === "leave" ? [] : [...ex.blocks].sort((a, b) => a.start.localeCompare(b.start));
  const dow = fromISODate(date).getDay();
  return t.shifts
    .filter((s) => s.days.includes(dow))
    .map((s) => ({ start: s.start, end: s.end, services: s.services }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Is the therapist working at this date/time (weekly schedule + that day's exception)? */
export function onDuty(t: Therapist, date: string, start: string) {
  return blocksOn(t, date).some((b) => start >= b.start && start < b.end);
}

/** Services the therapist offers in the block covering this date/time ([] when off). */
export function servicesAt(t: Therapist, date: string, start: string) {
  return blocksOn(t, date).find((b) => start >= b.start && start < b.end)?.services ?? [];
}

/** Blocks on the given date as labels, e.g. "13:00–16:00" (empty = day off). */
export function shiftsOn(t: Therapist, date: string) {
  return blocksOn(t, date).map((s) => `${s.start}–${s.end}`);
}

/** "จ.–ส. 08:00–12:00" — compact weekly schedule label. */
export function shiftLabel(t: Therapist) {
  return t.shifts
    .map((s) => {
      const d = [...s.days].sort();
      const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1) && d.length > 2;
      return `${run ? `${DOW[d[0]]}–${DOW[d[d.length - 1]]}` : d.map((x) => DOW[x]).join(" ")} ${s.start}–${s.end}`;
    })
    .join(" · ");
}

export type StaffState = "free" | "busy" | "off" | "service";

/** Can this therapist take this service at this date/time? */
export function staffState(
  t: Therapist,
  slot: { date: string; start: string; serviceId: string },
  appointments: Appointment[],
): StaffState {
  if (!onDuty(t, slot.date, slot.start)) return "off";
  if (!servicesAt(t, slot.date, slot.start).includes(slot.serviceId)) return "service";
  const busy = appointments.some(
    (a) => a.therapistId === t.id && a.date === slot.date && a.start === slot.start && a.status !== "cancelled" && a.status !== "absent",
  );
  return busy ? "busy" : "free";
}

/** beds taken right now on a date (sessions started but not yet finished) */
export function bedsInUse(appointments: Appointment[], date: string, except?: string) {
  return new Map(
    appointments
      .filter((a) => a.id !== except && a.date === date && a.bedId && a.status === "active" && !a.endedAt)
      .map((a) => [a.bedId!, a] as const),
  );
}

export function bedName(settings: ClinicSettings, id?: string) {
  if (!id) return "";
  for (const r of settings.rooms ?? []) {
    const b = r.beds.find((x) => x.id === id);
    if (b) return `${r.name} · ${b.name}`;
  }
  return id;
}
