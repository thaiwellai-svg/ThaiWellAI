/** Auto-suggested codes for the clinical record. First matching rule wins, so specific rules go first.
 *  Diagnoses → ICD-10 (WHO, also valid in ICD-10-TM). Procedures → ICD-9-CM.
 *  Thai-traditional-medicine U-codes (ICD-10-TM) from CPG 2568 → tmCode; staff can overwrite any code. */
type Rule = { kw: string[]; code: string; en: string };

const DX: Rule[] = [
  { kw: ["โค้งคอ", "ตกหมอน", "คอเคล็ด"], code: "M54.2", en: "Cervicalgia" },
  { kw: ["ข้อเท้าแพลง", "ข้อเท้าเคล็ด"], code: "S93.4", en: "Sprain of ankle" },
  { kw: ["ยอกหลัง"], code: "M54.5", en: "Low back pain" },
  { kw: ["นิ้วไกปืน"], code: "M65.3", en: "Trigger finger" },
  { kw: ["หลังส่วนล่าง", "สัญญาณ 4 หลัง", "เอว"], code: "M54.5", en: "Low back pain" },
  { kw: ["ไหล่ติด"], code: "M75.0", en: "Adhesive capsulitis of shoulder" },
  { kw: ["เข่า"], code: "M17.9", en: "Gonarthrosis, unspecified" },
  { kw: ["นิ้วล็อก"], code: "M65.3", en: "Trigger finger" },
  { kw: ["รองช้ำ", "ส้นเท้า"], code: "M72.2", en: "Plantar fascial fibromatosis" },
  { kw: ["อัมพฤกษ์", "อัมพาต"], code: "G81.9", en: "Hemiplegia, unspecified" },
  { kw: ["นอนไม่หลับ"], code: "G47.0", en: "Insomnia" },
  { kw: ["ปวดศีรษะ", "สัณฑฆาต", "ไมเกรน"], code: "R51", en: "Headache" },
  { kw: ["ตะคริว"], code: "R25.2", en: "Cramp and spasm" },
  { kw: ["ชา"], code: "R20.2", en: "Paraesthesia of skin" },
  { kw: ["ปวดคอ"], code: "M54.2", en: "Cervicalgia" },
  { kw: ["ปัตคาด", "กล้ามเนื้อ", "บ่า", "ออฟฟิศ"], code: "M79.1", en: "Myalgia" },
  { kw: ["เครียด"], code: "F43.9", en: "Reaction to severe stress, unspecified" },
];

const PROC: Rule[] = [
  { kw: ["ฤาษีดัดตน", "ฤๅษีดัดตน", "ยืดเหยียด", "ท่าบริหาร", "กายบริหาร"], code: "93.19", en: "Exercise, not elsewhere classified" },
  { kw: ["ประคบ", "อบ", "พอก", "ไอน้ำ", "หม้อเกลือ", "แช่"], code: "93.35", en: "Other heat therapy" },
  { kw: ["นวด", "กดจุด", "เส้นประธาน"], code: "93.39", en: "Other physical therapy" },
];

/** รหัสกลุ่มโรคแผนไทย ICD-10-TM (U-code) ตามตารางวินิจฉัย CPG 2568 (สถาบันการแพทย์แผนไทย) — เฉพาะที่ตรงชัด · แก้ได้ */
const TM: Rule[] = [
  { kw: ["สัญญาณ 4 หลัง", "หลังส่วนล่าง", "บั้นเอว"], code: "U57.31", en: "ลมปลายปัตฆาต (หลัง)" },
  { kw: ["โค้งคอ"], code: "U57.30", en: "ลมปลายปัตฆาตโค้งคอ" },
  { kw: ["ปัตคาด", "ปัตฆาต"], code: "U57.20", en: "ลมปลายปัตฆาตบ่า" },
  { kw: ["จับโปงแห้งเข่า"], code: "U57.53", en: "ลมจับโปงแห้งเข่า" },
  { kw: ["จับโปงน้ำเข่า"], code: "U57.50", en: "ลมจับโปงน้ำเข่า" },
  { kw: ["นิ้วไกปืน", "นิ้วล็อก"], code: "U57.25", en: "ลมปลายปัตฆาตข้อนิ้วมือ, นิ้วไกปืน" },
  { kw: ["ไหล่ติด"], code: "U71.00", en: "หัวไหล่ติด" },
  { kw: ["ตกหมอน", "คอเคล็ด"], code: "U71.80", en: "ตกหมอน, คอเคล็ด" },
  { kw: ["ข้อเท้าแพลง", "ข้อเท้าเคล็ด"], code: "U71.63", en: "ข้อเท้าเคล็ด, ข้อเท้าแพลง" },
  { kw: ["ยอกหลัง"], code: "U75.11", en: "ยอกหลังคู่" },
  { kw: ["ยอก"], code: "U75.10", en: "ยอกเดี่ยว" },
  { kw: ["ลมปะกัง", "ลมตะกัง"], code: "U61.2", en: "ลมปะกัง หรือ ลมตะกัง" },
  { kw: ["อัมพฤกษ์"], code: "U61.0", en: "อัมพฤกษ์" },
  { kw: ["อัมพาต"], code: "U61.1", en: "อัมพาต" },
  { kw: ["ปวดศีรษะ", "สัณฑฆาต"], code: "U61.30", en: "ปวดศีรษะ" },
  { kw: ["นอนไม่หลับ"], code: "U75.22", en: "นอนไม่หลับ" },
];

const match = (rules: Rule[], name: string) => rules.find((r) => r.kw.some((k) => name.includes(k)));
export const dxCode = (name: string) => match(DX, name);
/** รหัสแผนไทย (U-code) ของวินิจฉัย — ใช้คู่กับ ICD-10 */
export const tmCode = (name: string) => match(TM, name);
export const procCode = (name: string) => match(PROC, name);
