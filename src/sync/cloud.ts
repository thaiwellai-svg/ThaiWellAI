import { createClient } from "@supabase/supabase-js";

/**
 * Shared cloud for the prototype: the patient app (ThaiWell AI) and this back-office read and write the same
 * Supabase tables (see supabase/schema.sql). The publishable key is meant to ship in apps; the tables are open to it
 * for the prototype only — demo data, no real patients.
 */
export const CLOUD_URL = "https://mvwksnilprhpgdwpiyqu.supabase.co";
export const CLOUD_KEY = "sb_publishable_r9JpNxdWOGq5l77JwANvUA_Y3B7j_db";

// บัญชีคลินิก (Supabase Auth) จำการเข้าสู่ระบบไว้ในเบราว์เซอร์/แอปนี้
export const cloud = createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "thaiwell.clinic.auth" } });

/** one booking walks through these; the order is used so a side never moves a booking backwards */
export const FLOW = ["requested", "confirmed", "checked_in", "called", "in_service", "recorded", "billed", "paid", "closed"] as const;
export type CloudStatus = (typeof FLOW)[number] | "rejected" | "cancelled" | "no_show";
export const rank = (s: string) => {
  const i = (FLOW as readonly string[]).indexOf(s);
  return i < 0 ? 99 : i;
};

export const STATUS_TH: Record<string, string> = {
  requested: "ขอจอง",
  confirmed: "ยืนยันแล้ว",
  checked_in: "เช็กอินแล้ว",
  called: "เรียกคิว",
  in_service: "กำลังรับบริการ",
  recorded: "บันทึกการรักษาแล้ว",
  billed: "ส่งบิลแล้ว",
  paid: "ชำระแล้ว",
  closed: "ปิดงาน",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิก",
  no_show: "ไม่มา",
};

export interface CloudPatient {
  id: string;
  name: string;
  phone?: string | null;
  gender?: string | null;
  age?: number | null;
  clinic_hn?: string | null;
  /** ข้อมูลตามบัตรประชาชน (ผู้ใช้ยืนยันตัวตนในแอป) */
  citizen_id?: string | null;
  title?: string | null;
  birth_date?: string | null;
  address?: string | null;
  email?: string | null;
  /** ข้อมูลโปรไฟล์จากแอป (avatar ที่ผู้ใช้เลือก) */
  profile?: { avatar?: string } | null;
}

/** what the patient told the app before booking */
export interface CloudAssessment {
  complaint?: string;
  pain?: number;
  areas?: string[];
  avoid?: string[];
  conditions?: string[];
  pressure?: string;
  screening?: { fever?: boolean; highBP?: boolean; bpSystolic?: number; pregnant?: boolean; recentSurgery?: boolean; contagious?: boolean; menstruation?: boolean };
  summary?: string;
  /** รหัสบริการ / ผู้บำบัดที่ผู้ป่วยเลือกในแอป (รหัสเดียวกับคลินิก) */
  serviceId?: string;
  therapistId?: string;
}

export interface CloudAppt {
  id: string;
  patient_id: string;
  status: CloudStatus;
  service?: string | null;
  date?: string | null;
  start?: string | null;
  therapist?: string | null;
  queue_no?: string | null;
  assessment?: CloudAssessment | null;
  record?: {
    findings?: string;
    diagnoses?: string[];
    procedures?: string[];
    painBefore?: number;
    painAfter?: number;
    advice?: string;
    therapist?: string;
  } | null;
  bill?: { amount: number; items?: string[]; status: "pending" | "paid" | "void"; method?: string; receipt_no?: string; paid_at?: string; via?: "app" | "clinic" } | null;
  plan?: { summary: string; sessions: number; frequency: string; phases: { title: string; weeks: string; focus: string }[]; homeCare: string[]; course?: { name: string; total: number; used: number } } | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
  tw_patients?: CloudPatient | null;
}

export interface CloudEvent {
  id: number;
  at: string;
  source: "app" | "clinic" | "system";
  kind: string;
  appointment_id?: string | null;
  patient_name?: string | null;
  summary?: string | null;
  payload?: unknown;
}

/** record a hand-off for the Flow Monitor */
export async function logEvent(source: CloudEvent["source"], kind: string, appt: Pick<CloudAppt, "id"> | null, patientName: string | undefined, summary: string, payload?: unknown) {
  await cloud.from("tw_events").insert({ source, kind, appointment_id: appt?.id ?? null, patient_name: patientName ?? null, summary, payload: payload ?? null });
}

export async function updateAppt(id: string, patch: Partial<CloudAppt>) {
  const { error } = await cloud.from("tw_appointments").update(patch).eq("id", id);
  if (error) throw error;
}
