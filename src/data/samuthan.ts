import { ELEMENT_INFO, ageElement, birthElement, birthMonthOf, seasonElement, type Element } from "./elements";
import type { Patient } from "./types";

/**
 * สมุฏฐานวินิจฉัย — ปัจจัยที่ทำให้ธาตุในร่างกายเสียสมดุล ตามตำราการแพทย์แผนไทย
 * ธาตุสมุฏฐาน (เดือนเกิด) · อายุสมุฏฐาน · อุตุสมุฏฐาน (ฤดู) · กาลสมุฏฐาน (เวลา) · ประเทศสมุฏฐาน (ถิ่นที่อยู่)
 * รวมกับอาการวันนี้ เพื่อชี้ว่าธาตุไหนน่าจะกำเริบ — เป็นข้อมูลประกอบ แพทย์แผนไทยต้องยืนยันเสมอ
 */

/** กาลสมุฏฐาน: 06–10 / 18–22 เสมหะ (น้ำ) · 10–14 / 22–02 ปิตตะ (ไฟ) · 14–18 / 02–06 วาตะ (ลม) */
export function timeElement(hhmm: string): { element: Element; label: string } {
  const h = Number(hhmm.slice(0, 2));
  const k = (((h - 6) % 12) + 12) % 12; // 0..11 from 06:00 / 18:00
  if (k < 4) return { element: "น้ำ", label: h < 18 && h >= 6 ? "06–10 น. (เสมหะ)" : "18–22 น. (เสมหะ)" };
  if (k < 8) return { element: "ไฟ", label: h >= 10 && h < 14 ? "10–14 น. (ปิตตะ)" : "22–02 น. (ปิตตะ)" };
  return { element: "ลม", label: h >= 14 && h < 18 ? "14–18 น. (วาตะ)" : "02–06 น. (วาตะ)" };
}

const NORTH = "เชียงใหม่ เชียงราย ลำพูน ลำปาง แพร่ น่าน พะเยา แม่ฮ่องสอน อุตรดิตถ์ ตาก สุโขทัย พิษณุโลก เพชรบูรณ์ พิจิตร กำแพงเพชร นครสวรรค์ อุทัยธานี".split(" ");
const ISAN = "นครราชสีมา บุรีรัมย์ สุรินทร์ ศรีสะเกษ อุบลราชธานี ยโสธร ชัยภูมิ อำนาจเจริญ บึงกาฬ หนองบัวลำภู ขอนแก่น อุดรธานี เลย หนองคาย มหาสารคาม ร้อยเอ็ด กาฬสินธุ์ สกลนคร นครพนม มุกดาหาร".split(" ");
const SOUTH = "ชุมพร ระนอง สุราษฎร์ธานี พังงา ภูเก็ต กระบี่ นครศรีธรรมราช ตรัง พัทลุง สงขลา สตูล ปัตตานี ยะลา นราธิวาส ชลบุรี ระยอง จันทบุรี ตราด เพชรบุรี ประจวบคีรีขันธ์".split(" ");

/**
 * ประเทศสมุฏฐาน (ถิ่นที่อยู่) — ใช้การเทียบภาคที่สอนกันทั่วไป
 * ประเทศร้อน (ที่สูง ภูเขา · ภาคเหนือ) ไฟ · ประเทศอุ่น (น้ำฝน กรวดทราย · อีสาน) น้ำ
 * ประเทศเย็น (น้ำฝน เปือกตม · ภาคกลาง) ลม · ประเทศหนาว (น้ำเค็ม ชายทะเล · ภาคใต้/ตะวันออก) ดิน
 */
export function placeElement(address?: string): { element: Element; label: string; known: boolean } {
  const a = address ?? "";
  const has = (list: string[]) => list.some((p) => a.includes(p));
  if (has(NORTH)) return { element: "ไฟ", label: "ประเทศร้อน · ภาคเหนือ", known: true };
  if (has(ISAN)) return { element: "น้ำ", label: "ประเทศอุ่น · ภาคอีสาน", known: true };
  if (has(SOUTH)) return { element: "ดิน", label: "ประเทศหนาว · ชายทะเล", known: true };
  return { element: "ลม", label: a ? "ประเทศเย็น · ภาคกลาง" : "ประเทศเย็น · ภาคกลาง (ค่าเริ่มต้น)", known: !!a };
}

/** อาการวันนี้ → ธาตุที่แสดงออก (คำสำคัญจากอาการ / โรคประจำตัว) */
const SIGNS: Record<Element, string[]> = {
  ลม: ["ชา", "ร้าว", "ตามเส้น", "เวียน", "มึน", "เครียด", "นอนไม่หลับ", "นอนยาก", "ท้องอืด", "เฟ้อ", "ตึง", "ลม", "ไมเกรน", "ศีรษะ"],
  ไฟ: ["อักเสบ", "ร้อน", "แดง", "ไข้", "ผื่น", "ความดัน", "ร้อนใน", "แสบ"],
  น้ำ: ["บวม", "เสมหะ", "น้ำมูก", "หวัด", "ไอ", "หนักตัว", "ท้องเสีย"],
  ดิน: ["ข้อติด", "ข้อเสื่อม", "เข่า", "กล้ามเนื้อ", "เมื่อย", "ไหล่ติด", "กระดูก", "หลัง", "อ้วน", "เบาหวาน"],
};
export function symptomElements(text: string): Element[] {
  return (Object.keys(SIGNS) as Element[]).filter((e) => SIGNS[e].some((k) => text.includes(k)));
}

export const ELEMENTS: Element[] = ["ดิน", "น้ำ", "ลม", "ไฟ"];

/** what to do for the element most at risk right now */
export const ELEMENT_PLAN: Record<Element, { massage: string; compress: string; herbs: string; avoid: string; exercise: string }> = {
  ลม: { massage: "น้ำหนักมือเบา–ปานกลาง จังหวะช้า เน้นเส้นอิทา ปิงคลา และสหัสรังสี ทวารี", compress: "ประคบร้อนได้ · อบสมุนไพรช่วยกระจายลม", herbs: "ขิง ข่า ตะไคร้ ไพล · ยาหอม (รสเผ็ดร้อน สุขุม)", avoid: "ของดิบ ของเย็นจัด อดนอน เครียด", exercise: "ฤาษีดัดตน ท่าแก้ลมปลายปัตคาด หายใจช้า ๆ" },
  ไฟ: { massage: "นวดผ่อนคลาย น้ำหนักเบา หลีกเลี่ยงการกดแรงตรงจุดอักเสบ", compress: "ประคบอุ่นสั้น ๆ หรือประคบเย็น · เลี่ยงอบร้อน", herbs: "บัวบก ย่านาง รางจืด ใบเตย (รสขม เย็น จืด)", avoid: "เผ็ดจัด ทอด แอลกอฮอล์ อากาศร้อน ทำงานกลางแดด", exercise: "ยืดเหยียดเบา ๆ ในที่เย็น ดื่มน้ำมาก" },
  น้ำ: { massage: "นวดกระตุ้นการไหลเวียน กดจุดคลายบวม จากปลายสู่ลำตัว", compress: "ประคบร้อนสมุนไพรรสร้อน · อบไอน้ำ", herbs: "ขิง พริกไทย กระชาย มะนาว มะขามป้อม (รสเปรี้ยว ขม เผ็ด)", avoid: "ของหวานมัน ของเย็น ตากฝน นอนกลางวันนาน", exercise: "เดินเร็ว ฤาษีดัดตนท่าขยายทรวงอก" },
  ดิน: { massage: "น้ำหนักมือปานกลาง–ลึก คลายกล้ามเนื้อมัดใหญ่ ดัดข้อเบา ๆ", compress: "ประคบร้อนช่วยคลายข้อ ลดการติดขัด", herbs: "ฝรั่ง กล้วยดิบ เถาวัลย์เปรียง (รสฝาด หวาน มัน เค็ม)", avoid: "อาหารมันมาก นั่งท่าเดิมนาน", exercise: "บริหารข้อ ท่าฤาษีดัดตนแก้เข่า แก้เอว" },
};

export interface Factor {
  key: "birth" | "age" | "season" | "time" | "place";
  title: string;
  element: Element;
  label: string;
  weight: number;
}

/**
 * Scores each element from the five สมุฏฐาน (+ today's symptoms). The element with the highest score is
 * "at risk of imbalance" now. Birth element weighs 2, symptoms weigh 2 each, others 1.
 */
export function samuthan(p: Patient, at: { date?: Date; time?: string; symptoms?: string } = {}) {
  const d = at.date ?? new Date();
  const time = at.time ?? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const month = birthMonthOf(p);
  const age = ageElement(p.age);
  const season = seasonElement(d);
  const tm = timeElement(time);
  const place = placeElement(p.address);
  const factors: Factor[] = [
    { key: "birth", title: "ธาตุสมุฏฐาน", element: birthElement(month), label: `เกิดเดือนที่ ${month}`, weight: 2 },
    { key: "age", title: "อายุสมุฏฐาน", element: age.element, label: `${age.label} · ${p.age} ปี`, weight: 1 },
    { key: "season", title: "อุตุสมุฏฐาน", element: season.element, label: season.label, weight: 1 },
    { key: "time", title: "กาลสมุฏฐาน", element: tm.element, label: tm.label, weight: 1 },
    { key: "place", title: "ประเทศสมุฏฐาน", element: place.element, label: place.label, weight: 1 },
  ];
  const text = at.symptoms ?? [p.complaint, ...p.conditions].join(" ");
  const signs = symptomElements(text);
  const score: Record<Element, number> = { ดิน: 0, น้ำ: 0, ลม: 0, ไฟ: 0 };
  for (const f of factors) score[f.element] += f.weight;
  for (const e of signs) score[e] += 2;
  const total = ELEMENTS.reduce((n, e) => n + score[e], 0) || 1;
  const ranked = [...ELEMENTS].sort((a, b) => score[b] - score[a]);
  const top = ranked[0];
  const why = [...factors.filter((f) => f.element === top).map((f) => f.title), ...(signs.includes(top) ? ["อาการวันนี้"] : [])];
  return { factors, signs, score, share: Object.fromEntries(ELEMENTS.map((e) => [e, score[e] / total])) as Record<Element, number>, top, why, plan: ELEMENT_PLAN[top], info: ELEMENT_INFO[top], placeKnown: place.known };
}
export type Samuthan = ReturnType<typeof samuthan>;
