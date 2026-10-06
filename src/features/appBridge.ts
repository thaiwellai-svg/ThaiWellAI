/**
 * App bridge (prototype) — แอปผู้ป่วย ThaiWell ↔ หลังบ้าน ผ่าน localStorage ของเบราว์เซอร์เดียวกัน
 * ------------------------------------------------------------------
 * ทั้งสองเว็บอยู่ origin เดียวกัน (thaiwellai-svg.github.io) จึงใช้ที่เก็บข้อมูลร่วมกันได้
 * เปิดแอปกับหลังบ้านคนละแท็บในเบราว์เซอร์เดียวกัน → เหตุการณ์ส่งถึงกันทันที (storage event)
 *
 *   toClinic: แอป → หลังบ้าน (คำขอจอง + แบบประเมินก่อนรับบริการ · แจ้งเตือนทั่วไป)
 *   toApp:    หลังบ้าน → แอป (อนุมัติ/ปฏิเสธคำขอ · นวดเสร็จพร้อมคะแนนหลังนวด · ยกเลิก/ไม่มาตามนัด)
 *
 * แต่ละฝั่งจำ id ที่ประมวลผลแล้วเอง (ไม่ลบเหตุการณ์ของอีกฝั่ง) · heartbeat บอกแอปว่าหลังบ้านเปิดอยู่
 * ⚠️ ต้นแบบ: ข้อมูลตัวอย่างเท่านั้น — ของจริงต้องผ่าน backend (ยืนยันตัวตน · เข้ารหัส · PDPA)
 */
import type { BookingRequest, Patient } from "../data/types";

export const BRIDGE_KEY = "thaiwell.bridge";
export const CLINIC_ALIVE_KEY = "thaiwell.bridge.clinicAlive";
const SEEN_KEY = "thaiwell.bridge.seenByClinic";
const SENT_KEY = "thaiwell.bridge.sentByClinic";

/** นัดในหลังบ้าน: id นัด (หลังอนุมัติ) หรือ id คำขอจอง (ยังรออนุมัติ) */
export type AppTarget = { apptId?: string; ref?: string };
export type AppEvent =
  | { id: string; at: string; type: "booking"; request: BookingRequest; patient: Patient }
  | { id: string; at: string; type: "note"; title: string; body: string; patientId?: string }
  /** เช็กอินในแอป → บันทึกว่ามาถึง + ออกเลขคิว */
  | ({ id: string; at: string; type: "checkin" } & AppTarget)
  /** ประเมินก่อนนวดจากแอป → ความปวดก่อนนวดของนัดนั้น */
  | ({ id: string; at: string; type: "preVisit"; pain: number; adverse?: string; risk?: string; red?: boolean } & AppTarget)
  /** ประเมินหลังนวดในแอป */
  | ({ id: string; at: string; type: "selfPost"; pain: number; adverse?: string[] } & AppTarget)
  /** ผู้ป่วยยกเลิก/เลื่อนจากแอป */
  | ({ id: string; at: string; type: "cancel"; reason: string } & AppTarget)
  /** จ่ายบิลในแอป */
  | ({ id: string; at: string; type: "pay" } & AppTarget);

/** บันทึกการรักษาที่ส่งให้แอป */
export interface RecordOut {
  findings?: string;
  diagnoses?: string[];
  procedures?: string[];
  advice?: string;
  therapist?: string;
}
export type ClinicEvent =
  | { id: string; at: string; type: "approved"; ref: string; apptId?: string; date: string; start: string; therapist: string; service: string }
  | { id: string; at: string; type: "rejected"; ref: string; reason: string }
  | ({ id: string; at: string; type: "completed"; ref: string; apptId?: string; painBefore: number; painAfter?: number } & RecordOut)
  | { id: string; at: string; type: "cancelled" | "absent"; ref: string }
  /** คลินิกย้ายวัน/เวลา/ผู้บำบัดของนัดที่อนุมัติแล้ว */
  | { id: string; at: string; type: "moved"; ref: string; apptId: string; date: string; start: string; therapist: string }
  /** นวดครั้งต่อ ๆ ไปตามแผน (นัดที่คลินิกลงเอง ไม่ได้มาจากคำขอในแอป) */
  | ({ id: string; at: string; type: "visit"; patientId: string; apptId: string; date: string; painBefore: number; painAfter: number } & RecordOut)
  /** แผนการรักษา: นัดถัดไปที่คลินิกลงไว้ + คอร์ส + แผนที่แพทย์อนุมัติ (ส่งใหม่เมื่อเปลี่ยน) */
  | {
      id: string;
      at: string;
      type: "plan";
      patientId: string;
      next: { apptId?: string; date: string; start: string; therapist: string } | null;
      upcoming: number;
      course?: { name: string; total: number; used: number };
      approvedPlan?: { summary: string; sessions: number; frequency: string; homeCare: string[] };
    }
  /** วันนัด: เช็กอินแล้ว (เลขคิว) · เรียกคิว · กำลังรับบริการ */
  | { id: string; at: string; type: "status"; patientId: string; apptId: string; ref?: string; state: "checked_in" | "called" | "in_service"; queue?: string }
  /** บิล/ใบเสร็จของคลินิก */
  | { id: string; at: string; type: "bill"; patientId: string; apptId: string; ref?: string; amount: number; items: string[]; status: "pending" | "paid"; receiptNo?: string; paidAt?: string };

interface Box {
  toClinic: AppEvent[];
  toApp: ClinicEvent[];
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

const box = (): Box => ({ toClinic: [], toApp: [], ...read<Partial<Box>>(BRIDGE_KEY, {}) });

/** เหตุการณ์จากแอปที่หลังบ้านยังไม่ได้รับ (แล้วจำว่ารับแล้ว) */
export function takeNewAppEvents(): AppEvent[] {
  const seen = new Set(read<string[]>(SEEN_KEY, []));
  const fresh = box().toClinic.filter((e) => !seen.has(e.id));
  if (fresh.length) write(SEEN_KEY, [...seen, ...fresh.map((e) => e.id)].slice(-500));
  return fresh;
}

/** ส่งเหตุการณ์ไปแอป — key = กันส่งซ้ำ (เช่น "approved:<request id>") */
type NoMeta<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
export function sendToApp(key: string, event: NoMeta<ClinicEvent>) {
  const sent = new Set(read<string[]>(SENT_KEY, []));
  if (sent.has(key)) return;
  const b = box();
  const e = { ...event, id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() } as ClinicEvent;
  write(BRIDGE_KEY, { ...b, toApp: [...b.toApp, e].slice(-200) });
  write(SENT_KEY, [...sent, key].slice(-500));
}

/**
 * เวลาว่างจริงของคลินิก 7 วันข้างหน้า → แอปใช้แสดงแพทย์/เวลาตอนจอง (แทนตารางตัวอย่างของแอป)
 * days[YYYY-MM-DD][HH:mm][serviceId] = id ผู้บำบัดที่ว่าง (มีเตียงว่าง · เข้าเวร · รับบริการนั้น · ยังไม่มีคิว)
 */
export const AVAILABILITY_KEY = "thaiwell.bridge.availability";
export interface Availability {
  at: string;
  clinicName: string;
  therapists: { id: string; name: string; role: string }[];
  days: Record<string, Record<string, Record<string, string[]>>>;
}
export const publishAvailability = (a: Availability) => write(AVAILABILITY_KEY, a);

/** หลังบ้านเปิดอยู่ (แอปใช้ตัดสินว่าจะรอคลินิกยืนยันจริง หรือจำลองเอง) */
export const beat = () => {
  try {
    localStorage.setItem(CLINIC_ALIVE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};
