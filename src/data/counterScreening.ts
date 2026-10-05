import type { CounterScreening } from "./types";

/** flags from the counter screening (stop = do not massage today) */
export function screeningFlags(s: CounterScreening, bpThreshold = 160): { label: string; level: "stop" | "warn" }[] {
  const out: { label: string; level: "stop" | "warn" }[] = [];
  if (s.fever) out.push({ label: "มีไข้ / การติดเชื้อ", level: "stop" });
  if (s.bpSys && s.bpSys >= bpThreshold) out.push({ label: `ความดันสูง ${s.bpSys}/${s.bpDia ?? "—"}`, level: "stop" });
  if (s.recentSurgery) out.push({ label: "ผ่าตัดภายใน 30 วัน", level: "stop" });
  if (s.pregnant) out.push({ label: "ตั้งครรภ์", level: "warn" });
  if (s.bloodThinner) out.push({ label: "ใช้ยาละลายลิ่มเลือด · ลดแรงนวด", level: "warn" });
  if (s.numbness) out.push({ label: "มีอาการชา / อ่อนแรง", level: "warn" });
  if (s.skinProblem) out.push({ label: "มีแผล / ผื่นบริเวณที่นวด", level: "warn" });
  return out;
}
