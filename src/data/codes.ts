/** Auto-suggested codes for the clinical record. First matching rule wins, so specific rules go first.
 *  Diagnoses → ICD-10 (WHO, also valid in ICD-10-TM). Procedures → ICD-9-CM.
 *  Thai-traditional-medicine U-codes / สปสช. procedure codes aren't included; staff can overwrite any code. */
type Rule = { kw: string[]; code: string; en: string };

const DX: Rule[] = [
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
  { kw: ["ฤาษีดัดตน", "ท่าบริหาร", "กายบริหาร"], code: "93.19", en: "Exercise, not elsewhere classified" },
  { kw: ["ประคบ", "อบ", "พอก", "ไอน้ำ"], code: "93.35", en: "Other heat therapy" },
  { kw: ["นวด", "กดจุด", "เส้นประธาน"], code: "93.39", en: "Other physical therapy" },
];

const match = (rules: Rule[], name: string) => rules.find((r) => r.kw.some((k) => name.includes(k)));
export const dxCode = (name: string) => match(DX, name);
export const procCode = (name: string) => match(PROC, name);
