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

/** quick safety check at the counter before the first massage */
export interface CounterScreening {
  at: string;
  bpSys?: number;
  bpDia?: number;
  pulse?: number;
  fever: boolean;
  pregnant: boolean | null;
  recentSurgery: boolean;
  numbness: boolean;
  bloodThinner: boolean;
  skinProblem: boolean;
  pressure: "เบา" | "ปานกลาง" | "หนัก";
  avoid: string;
  /** areas marked as painful on the body at the counter */
  painAreas?: string[];
  /** pain score 0–10 */
  pain?: number;
}

export interface Course {
  name: string;
  serviceId: string;
  total: number;
  used: number;
  /** ISO date the treatment plan was opened by the Thai traditional doctor */
  startedOn: string;
  expiresOn: string;
  /** prepaid = ซื้อแพ็กเกจจ่ายล่วงหน้า (มาแต่ละครั้งหักเครดิต) · perVisit = คอร์สการรักษา ชำระรายครั้ง (ทุกครั้งจ่ายค่าบริการ + หัตถการที่ทำเพิ่ม · คอร์สนับจำนวนครั้ง) */
  billing?: "prepaid" | "perVisit";
}

export interface Patient {
  id: string;
  hn: string;
  name: string;
  gender: "ชาย" | "หญิง";
  age: number;
  phone: string;
  email?: string;
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
  /** address as printed on the ID card */
  address?: string;
  /** เลขบัตรประชาชน 13 หลัก */
  citizenId?: string;
  /** drug / massage-oil / herb allergies */
  allergies?: string[];
  emergency?: { name: string; phone: string; relation?: string };
  /** screening done at the counter on registration (optional) */
  screening?: CounterScreening;
  /** clinic member — gets the member discount on packages */
  member?: boolean;
  /** linked account in the patient app (shared cloud) */
  cloudId?: string;
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
  /** แบบคัดกรองตนเองที่ผู้ป่วยตอบในแอปตอนจอง (มีไข้ ตั้งครรภ์ ผ่าตัด …) */
  screening?: Screening;
  /** เลขคิวตามลำดับที่มาเช็กอิน (Q001…) — สแกน QR ที่เคาน์เตอร์ผ่านแอป */
  checkinQueue?: string;
  checkedInAt?: string;
  /** visit flow timestamps (ISO) — the queue is "called" while status is still waiting */
  calledAt?: string;
  /** treatment bed, chosen when the session starts */
  bedId?: string;
  startedAt?: string;
  endedAt?: string;
  /** after-treatment note from the therapist */
  advice?: string;
  /** อาการ / สิ่งที่ตรวจพบวันนี้ (from the treatment assistant) */
  findings?: string;
  /** linked booking in the shared cloud (patient app) */
  cloudId?: string;
  /** pre-visit self-assessment carried over from the booking request */
  intake?: Intake;
  /** ทุกรอบที่ผู้ป่วยประเมินในแอปก่อนเช็กอิน (เก่า → ใหม่) · addenda = แจ้งอาการเพิ่มหลังเช็กอิน */
  assessRounds?: AssessRound[];
  addenda?: Addendum[];
  /** booked from the patient app (prototype bridge) — request id, used to send status back to the app */
  bridgeRef?: string;
  /** วินิจฉัย — Thai traditional diagnosis (principal first) */
  diagnoses?: Diagnosis[];
  /** หัตถการ performed in this session */
  procedures?: Procedure[];
  /** set when the appointment was cancelled */
  cancel?: { at: string; by: "patient" | "clinic"; reason: string; note?: string; staff: string; batch?: string };
  payment?: Payment;
  /** cancelled receipts for this visit, kept for the record */
  voidedPayments?: Payment[];
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
  /** ค่าบริการของหัตถการ: included = รวมในค่าบริการที่จอง (ไม่คิดเพิ่ม) · ไม่ใช่ = คิดเพิ่มตาม price (ยังไม่ระบุ = ต้องใส่ราคาก่อนคิดเงิน) */
  included?: boolean;
  price?: number;
}

export type PaymentMethod = "cash" | "promptpay" | "app" | "credit";
export interface Payment {
  /** receipt number, e.g. RC2569-000123 */
  no?: string;
  method: PaymentMethod;
  amount: number;
  /** รายการที่คิดเงิน (บริการ + หัตถการเพิ่ม) ตอนออกใบเสร็จ */
  items?: { name: string; amount: number }[];
  /** ค่าบริการหักเครดิตคอร์ส แต่จ่ายค่าหัตถการเพิ่มด้วยวิธีอื่น (method) */
  credit?: boolean;
  /** cash handed over (for change) */
  received?: number;
  /** when the slip was sent to the patient's ThaiWell AI app */
  slipSentAt?: string;
  /** full tax invoice issued for this receipt */
  taxInvoice?: { no: string; at: string; buyer: string; taxId?: string; branch?: string; address?: string };
  /** "pending" = bill sent to the ThaiWell AI app, not paid yet · "void" = receipt cancelled */
  status: "paid" | "pending" | "void";
  at: string;
  /** set when the receipt was cancelled / refunded */
  voided?: { at: string; by: string; reason: string; refund: boolean };
}

/** who did what, when — kept for medical-record and finance accountability */
export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  cat: "เวชระเบียน" | "การเงิน" | "นัดหมาย" | "ผู้ป่วย" | "ตั้งค่า" | "ระบบ" | "คลังสินค้า";
  text: string;
  patientId?: string;
}

/** การประเมินหนึ่งรอบจากแอป — ประเมินซ้ำก่อนเช็กอิน = รอบใหม่ (ไม่ทับของเดิม) · รอบล่าสุดคือที่ผู้ให้บริการใช้ */
export interface AssessRound {
  at: string;
  pain: number;
  complaint: string;
  focusAreas: string[];
  avoidAreas: string[];
  summary?: string;
  /** ข้อห้าม/ข้อควรระวังจากแบบคัดกรองในแอป */
  flags?: string[];
}
/** แจ้งอาการเพิ่มหลังเช็กอิน (ไม่แก้ผลประเมินที่ใช้) */
export interface Addendum {
  at: string;
  text: string;
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
  /** ทุกรอบที่ผู้ป่วยประเมินในแอป (เก่า → ใหม่) */
  assessRounds?: AssessRound[];
  note?: string;
  submittedAt: string; // ISO datetime
  /** id of the booking in the shared cloud (patient app) */
  cloudId?: string;
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
  /** โลโก้คลินิก: "icon:<ไอคอน>:<สี>" หรือรูปถ่าย (data URL) */
  clinicLogo?: string;
  /** ราคาหัตถการที่เคยคิด (จำไว้ใช้ครั้งต่อไป) */
  procedurePrices?: Record<string, number>;
  /** ที่อยู่ เบอร์โทร และพิกัดของคลินิก — แสดงในหน้า "สถานที่" ของแอปผู้ใช้ (นำทาง โทร) */
  clinicAddress?: string;
  clinicPhone?: string;
  clinicLat?: number;
  clinicLng?: number;
  /** รหัสลับสร้างรหัสเช็กอินประจำวัน (QR ที่เคาน์เตอร์) */
  checkinSecret?: string;
  /** VoxCPM voice id used to announce queue calls */
  callVoice?: string;
  /** treatment rooms and their beds */
  rooms?: { id: string; name: string; beds: { id: string; name: string }[] }[];
  /** send the payment slip to the patient's app as soon as a bill is paid */
  autoSendSlip?: boolean;
  /** PromptPay ID (phone or tax ID) for counter QR payments */
  promptpayId?: string;
  /** VAT registration — enables full tax invoices */
  vat?: { registered: boolean; taxId: string; branch: string; address: string; rate: number };
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
