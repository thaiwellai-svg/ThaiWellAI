import type { Patient } from "./types";

/**
 * ธาตุทั้ง 4 ตามทฤษฎีการแพทย์แผนไทย (ธาตุเจ้าเรือน · อายุสมุฏฐาน · อุตุสมุฏฐาน).
 * ใช้ประกอบการวางแผนนวด/ประคบ/สมุนไพร — ไม่ใช่การวินิจฉัย ต้องให้แพทย์แผนไทยยืนยัน
 */
export type Element = "ดิน" | "น้ำ" | "ลม" | "ไฟ";

export const ELEMENT_INFO: Record<Element, { color: string; tint: string; trait: string; risk: string; taste: string; care: string }> = {
  ดิน: {
    color: "#8a5a2b",
    tint: "#f4e9dc",
    trait: "โครงร่างใหญ่ กล้ามเนื้อแน่น ผิวหนา อดทน ใจเย็น",
    risk: "ปวดเมื่อยกล้ามเนื้อ ข้อติด ท้องอืด อ้วนง่าย",
    taste: "ฝาด หวาน มัน เค็ม",
    care: "นวดน้ำหนักมือปานกลาง–ลึก เน้นคลายกล้ามเนื้อมัดใหญ่ ประคบช่วยไหลเวียน",
  },
  น้ำ: {
    color: "#2f6fa3",
    tint: "#e3eef7",
    trait: "ผิวชุ่มชื้น รูปร่างสมส่วน เสียงนุ่ม ใจดี",
    risk: "บวมน้ำ น้ำมูก เสมหะ ปวดหนักเมื่อยล้าเมื่ออากาศเย็น",
    taste: "เปรี้ยว ขม",
    care: "นวดกระตุ้นไหลเวียน ประคบสมุนไพรรสร้อน หลีกเลี่ยงความเย็นหลังนวด",
  },
  ลม: {
    color: "#5f7f86",
    tint: "#e6eef0",
    trait: "รูปร่างโปร่ง ผิวแห้ง ช่างพูด นอนหลับยาก",
    risk: "ปวดตามเส้น ชา เวียนศีรษะ ท้องอืดเฟ้อ เครียด",
    taste: "เผ็ดร้อน",
    care: "นวดน้ำหนักเบา–ปานกลาง จังหวะช้า เน้นเส้นประธานสิบเพื่อคลายลม อบสมุนไพร",
  },
  ไฟ: {
    color: "#c2482b",
    tint: "#fbe6df",
    trait: "ขี้ร้อน เหงื่อออกง่าย ใจร้อน หิวบ่อย",
    risk: "อักเสบ ร้อนใน ผื่น ปวดศีรษะ ความดันสูง",
    taste: "ขม เย็น จืด",
    care: "หลีกเลี่ยงความร้อนจัด ประคบอุณหภูมิอุ่นสั้น ๆ นวดผ่อนคลาย ดื่มน้ำมาก",
  },
};

/** ธาตุเจ้าเรือนตามเดือนเกิด (สุริยคติ แบบที่ใช้ทั่วไป) */
export function birthElement(month: number): Element {
  if (month <= 3) return "ไฟ";
  if (month <= 6) return "ลม";
  if (month <= 9) return "น้ำ";
  return "ดิน";
}

/** อายุสมุฏฐาน: ปฐมวัย (≤16) เสมหะ/น้ำ · มัชฌิมวัย (16–32) ปิตตะ/ไฟ · ปัจฉิมวัย (>32) วาตะ/ลม */
export function ageElement(age: number): { element: Element; label: string } {
  if (age <= 16) return { element: "น้ำ", label: "ปฐมวัย" };
  if (age <= 32) return { element: "ไฟ", label: "มัชฌิมวัย" };
  return { element: "ลม", label: "ปัจฉิมวัย" };
}

/** อุตุสมุฏฐาน: ฤดูร้อน ไฟ · ฤดูฝน ลม · ฤดูหนาว น้ำ */
export function seasonElement(d = new Date()): { element: Element; label: string } {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const md = m * 100 + day;
  if (md >= 216 && md < 616) return { element: "ไฟ", label: "คิมหันตฤดู (ร้อน)" };
  if (md >= 616 && md < 1016) return { element: "ลม", label: "วสันตฤดู (ฝน)" };
  return { element: "น้ำ", label: "เหมันตฤดู (หนาว)" };
}

/** stable demo birth month when the record has none */
export function birthMonthOf(p: Pick<Patient, "id" | "birthMonth" | "birthDate">) {
  if (p.birthDate && /^\d{4}-\d{2}/.test(p.birthDate)) return Number(p.birthDate.slice(5, 7));
  if (p.birthMonth) return p.birthMonth;
  let h = 0;
  for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return (h % 12) + 1;
}

export function elementProfile(p: Patient) {
  const month = birthMonthOf(p);
  return { month, birth: birthElement(month), age: ageElement(p.age), season: seasonElement() };
}

export const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** demo patients without a birth date get a stable one that matches their age and birth month */
export function withBirthDate<T extends Patient>(p: T): T {
  if (p.birthDate) return p;
  const month = birthMonthOf(p);
  let h = 7;
  for (const c of p.id) h = (h * 131 + c.charCodeAt(0)) % 9973;
  const now = new Date();
  const day = (h % 28) + 1;
  // born this many years ago, adjusted so the age is exact today
  const passed = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  const year = now.getFullYear() - p.age - (passed ? 0 : 1);
  return { ...p, birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}
