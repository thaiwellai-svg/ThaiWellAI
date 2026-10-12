import type { Appointment } from "../data/types";
import type { CloudAppt } from "./cloud";

/** คำตอบจากแอปที่ยังไม่ได้รับ: ติดตามผลหลังนวด · เตือนนัด (ยืนยัน/ขอเลื่อน) — ใหม่ = เวลาตอบไม่ตรงกับที่เก็บไว้ */
export function appAnswers(local: Pick<Appointment, "followUp" | "attend">, as?: CloudAppt["assessment"] | null) {
  const fu = as?.followup;
  const att = as?.attend;
  return {
    followUp: fu && typeof fu.pain === "number" && local.followUp?.at !== fu.at ? { pain: fu.pain, sleep: fu.sleep, issues: Array.isArray(fu.issues) ? fu.issues : [], worse: !!fu.worse, at: fu.at } : undefined,
    attend: att && (att.answer === "confirm" || att.answer === "reschedule") && local.attend?.at !== att.at ? att : undefined,
  };
}
