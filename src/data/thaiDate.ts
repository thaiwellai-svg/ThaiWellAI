export const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const TH_WEEKDAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addISODays(s: string, n: number) {
  return toISODate(addDays(fromISODate(s), n));
}
export function startOfWeek(d: Date) {
  // Monday-first week, the Thai clinic convention
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() + 6) % 7;
  return addDays(x, -diff);
}
export function diffDays(a: string, b: string) {
  return Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / 86_400_000);
}
export const todayISO = () => toISODate(new Date());

/** 27 สิงหาคม 2569 */
export function thaiDate(s: string) {
  const d = fromISODate(s);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
/** 27 ส.ค. 69 */
export function thaiDateShort(s: string, withYear = false) {
  const d = fromISODate(s);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}${withYear ? ` ${String(d.getFullYear() + 543).slice(2)}` : ""}`;
}
/** วันพุธที่ 30 กันยายน 2569 */
export function thaiDateLong(s: string) {
  const d = fromISODate(s);
  return `วัน${TH_WEEKDAYS[d.getDay()]}ที่ ${thaiDate(s)}`;
}
export function thaiMonthYear(d: Date) {
  return `${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
export function relativeDay(s: string) {
  const n = diffDays(s, todayISO());
  if (n === 0) return "วันนี้";
  if (n === 1) return "พรุ่งนี้";
  if (n === -1) return "เมื่อวาน";
  return n > 0 ? `อีก ${n} วัน` : `${-n} วันที่แล้ว`;
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fromMinutes(min: number) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
export function timeRange(start: string, minutes: number) {
  return `${start} - ${fromMinutes(toMinutes(start) + minutes)}`;
}
export function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}
export const baht = (n: number) => n.toLocaleString("th-TH");
