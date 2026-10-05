export type AppointmentStatus = "waiting" | "active" | "done" | "absent" | "cancelled";
export type VisitType = "booked" | "walkin";

export interface Service {
  id: string;
  name: string;
  short: string;
  minutes: number;
  price: number;
}

/** A recurring working block a therapist opens for bookings, e.g. Mon–Fri 08:00–12:00. */
export interface Shift {
  days: number[]; // 0 = Sunday
  start: string; // HH:mm
  end: string; // HH:mm (exclusive)
  /** services offered during this block */
  services: string[];
}

/** One working block on a specific date (an exception's own hours). */
export interface DayBlock {
  start: string;
  end: string;
  services: string[];
}

/** A one-off change to the weekly schedule for a single date. */
export interface DayException {
  kind: "leave" | "custom";
  /** leave reason, e.g. ลาป่วย */
  reason?: string;
  note?: string;
  /** custom: the blocks for that date (replaces the weekly ones) */
  blocks: DayBlock[];
}

export interface Therapist {
  id: string;
  name: string;
  role: string;
  color: string;
  phone?: string;
  /** profile photo taken in-app (data URL); falls back to the demo portrait */
  photo?: string;
  /** working hours the therapist registered */
  shifts: Shift[];
  /** every service id offered in any shift (derived from shifts) */
  services: string[];
  /** per-date overrides keyed by ISO date — leave, or different hours that day */
  exceptions?: Record<string, DayException>;
}

/** Self-screening answered by the patient in the ThaiWell AI app before approval (รพ.หาดใหญ่ workflow §3.2). */
export interface Screening {
  fever: boolean;
  highBP: boolean;
  bpSystolic?: number;
  menstruation: boolean;
  pregnant: boolean;
  recentSurgery: boolean;
  contagious: boolean;
}

/** แบบประเมินก่อนรับบริการ — filled by the patient in the ThaiWell AI app before the visit */
export interface Intake {
  at: string; // ISO, when sent
  goal: string; // วัตถุประสงค์การนวด
  complaint: string; // อาการหลัก
  pain: number; // 0–10
  duration: string; // ระยะเวลาที่มีอาการ
  focusAreas: string[]; // ตำแหน่งที่ต้องการเน้น
  avoidAreas: string[]; // บริเวณที่ไม่ต้องการให้นวด
  occupation?: string; // ลักษณะงานประจำ
  conditions: string[]; // โรคประจำตัว
  surgery?: string; // ประวัติการผ่าตัด (undefined = ไม่มี)
  injury?: string; // การบาดเจ็บล่าสุด
  medications: string[]; // ยาที่ใช้อยู่
  bloodThinner: boolean; // ยาที่เพิ่มความเสี่ยงเลือดออก
  allergy?: string; // การแพ้
  skin: string; // ผิวหนังบริเวณที่จะนวด
  numbness: boolean; // อาการชา/อ่อนแรง
  fever: boolean; // ไข้หรือการติดเชื้อ
  pregnant: boolean | null; // null = ไม่เกี่ยวข้อง
  bp?: { sys: number; dia: number }; // ความดันก่อนนวด
  pulse?: number; // ชีพจร
  pressure: "เบา" | "ปานกลาง" | "หนัก"; // ความต้องการแรงนวด
  history?: string; // ประวัติการนวด
}

export interface Course {
  name: string;
  serviceId: string;
  total: number;
  used: number;
  /** ISO date the treatment plan was opened by the Thai traditional doctor */
  startedOn: string;
  expiresOn: string;
}

export interface Patient {
  id: string;
  hn: string;
  name: string;
  gender: "ชาย" | "หญิง";
  age: number;
  phone: string;
  conditions: string[];
  complaint: string;
  course?: Course;
  painHistory: { date: string; score: number }[];
  registeredOn: string;
  /** Profile photo taken by staff (data URL). Falls back to the demo avatar, then initials. */
  photo?: string;
  /** 1–12, for ธาตุเจ้าเรือน */
  birthMonth?: number;
  /** ISO date of birth (age + birth month are derived from it when present) */
  birthDate?: string;
  /** เลขบัตรประชาชน 13 หลัก */
  citizenId?: string;
  /** drug / massage-oil / herb allergies */
  allergies?: string[];
  emergency?: { name: string; phone: string; relation?: string };
  /** last AI-drafted treatment plan (needs a Thai traditional doctor's review) */
  aiPlan?: AIPlan;
  /** referral letters / lab reports read by OCR */
  documents?: { name: string; text: string; at: string }[];
}

export interface AIPlan {
  at: string;
  model: string;
  summary: string;
  massageType: "นวดเพื่อสุขภาพ" | "นวดเพื่อการรักษา";
  elementNote: string;
  goals: string[];
  sessions: number;
  frequency: string;
  phases: { title: string; weeks: string; serviceId: string; focus: string; technique: string }[];
  herbs: string[];
  homeCare: string[];
  precautions: string[];
  referToDoctor: boolean;
  approved?: boolean;
}

export interface Appointment {
  id: string;
  patientId: string;
  serviceId: string;
  therapistId: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  status: AppointmentStatus;
  type: VisitType;
  painBefore: number;
  painAfter?: number;
  paid: boolean;
  note?: string;
  /** visit flow timestamps (ISO) — the queue is "called" while status is still waiting */
  calledAt?: string;
  /** treatment bed, chosen when the session starts */
  bedId?: string;
  startedAt?: string;
  endedAt?: string;
  /** after-treatment note from the therapist */
  advice?: string;
  /** pre-visit self-assessment carried over from the booking request */
  intake?: Intake;
  /** วินิจฉัย — Thai traditional diagnosis (principal first) */
  diagnoses?: Diagnosis[];
  /** หัตถการ performed in this session */
  procedures?: Procedure[];
  payment?: Payment;
  /** what happened, in order — shown as the visit timeline */
  log?: { at: string; label: string }[];
}

export interface Diagnosis {
  name: string;
  /** ICD-10 code — auto-suggested from the name (data/codes.ts), editable */
  code?: string;
  kind: "principal" | "secondary";
}
export interface Procedure {
  name: string;
  code?: string;
  /** body area / เส้นประธาน */
  area?: string;
  minutes?: number;
}

export type PaymentMethod = "cash" | "promptpay" | "app" | "credit";
export interface Payment {
  /** receipt number, e.g. RC2569-000123 */
  no?: string;
  method: PaymentMethod;
  amount: number;
  /** cash handed over (for change) */
  received?: number;
  /** when the slip was sent to the patient's ThaiWell AI app */
  slipSentAt?: string;
  /** "pending" = bill sent to the ThaiWell AI app, not paid yet */
  status: "paid" | "pending";
  at: string;
}

export interface BookingRequest {
  id: string;
  patientId: string;
  serviceId: string;
  therapistId: string;
  date: string;
  start: string;
  painScore: number;
  screening: Screening;
  /** pre-visit self-assessment from the app (demo data is derived when missing — see data/intake.ts) */
  intake?: Intake;
  note?: string;
  submittedAt: string; // ISO datetime
}

/** Staff decision on a booking request — kept so the requests page can show history. */
export interface RequestDecision {
  id: string;
  request: BookingRequest;
  outcome: "approved" | "rejected";
  /** approved: the slot actually booked (may differ from the one requested) */
  slot?: { date: string; start: string; therapistId: string };
  reason?: string;
  note?: string;
  decidedAt: string; // ISO datetime
  decidedBy: string;
}

export type ShareTopic = "visits" | "pain" | "advice" | "credits" | "screening" | "receipt";

export interface ClinicSettings {
  clinicName: string;
  /** VoxCPM voice id used to announce queue calls */
  callVoice?: string;
  /** treatment rooms and their beds */
  rooms?: { id: string; name: string; beds: { id: string; name: string }[] }[];
  /** send the payment slip to the patient's app as soon as a bill is paid */
  autoSendSlip?: boolean;
  /** PromptPay ID (phone or tax ID) for counter QR payments */
  promptpayId?: string;
  staffName: string;
  staffRole: string;
  /** signed-in user's profile */
  staffPhoto?: string;
  staffEmail?: string;
  /** ISO datetime of the last password change (the password itself is never stored here) */
  passwordChangedAt?: string;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  bedsPerSlot: number;
  closedWeekdays: number[]; // 0 = Sunday
  bpThreshold: number;
  surgeryRecoveryDays: number;
  minDaysBetweenSessions: number;
  requireApproval: boolean;
  notifyNewRequest: boolean;
  notifyNoShow: boolean;
  followUpReminder: boolean;
  followUpHours: number;
  /** minutes past the start time before a no-show alert */
  noShowMinutes: number;
  /** patient app: confirmation when a queue is approved / moved */
  notifyConfirm: boolean;
  /** patient app: reminder before the appointment */
  notifyReminder: boolean;
  reminderHours: number;
  /** share visit history to the patient's ThaiWell AI app */
  shareHistory: boolean;
  shareTopics: ShareTopic[];
  shareTiming: "after" | "weekly";
  /** app background: modelled 3D room, or the living spa photo */
  backdrop?: "reception" | "sala" | "studio" | "photo" | "room3d";
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: "request" | "alert" | "info" | "staff" | "noshow";
  /** where the drawer's main action goes */
  link?: string;
  /** what it's about: request id, appointment id, therapist id or patient id */
  ref?: string;
}
