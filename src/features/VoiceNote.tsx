import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Check, FileAudio, Pencil, RefreshCw, RotateCcw, Send, Sparkles, Volume2, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { THAI_MASSAGE_KNOWLEDGE, chatJSON, fileToWav, startMic, transcribe, type Mic as MicRec } from "./ai";
import { DX_PICK, PROC_PICK } from "./ClinicalRecord";
import { dxCode, procCode } from "../data/codes";
import { samuthan } from "../data/samuthan";
import { intakeOfVisit } from "../data/intake";
import { bestForElement, outcomeRows } from "../data/outcomes";
import { DEFAULT_CALL_VOICE, speak, stopSpeaking, unlockAudio } from "./tts";
import { VoiceWave } from "./VoiceWave";
import { Body3D } from "./Body3D";
import { BODY_AREAS, toArea, toAreas, type BodyArea } from "./BodyMap";
import { elementProfile } from "../data/elements";
import type { Appointment } from "../data/types";
import "./voice-note.css";

type Extract = { findings?: string; diagnoses: string[]; procedures: { name: string; area?: string; minutes?: number | null }[]; painAfter: number | null; advice: string };
type Slot = "finding" | "dx" | "proc" | "pain" | "advice" | "summary";
type Msg = { id: number; role: "ai" | "me"; text: string; kind?: Slot | "intro"; /** question number shown as a small tag */ step?: number };

/** the treatment-record form listens for this to fill Pain-after and advice (they are local drafts there) */
export const VOICE_FILL = "thaiwell:voice-fill";
export type VoiceFill = { apptId: string; painAfter?: number; advice?: string; /** start over: clear the drafts */ clear?: boolean; /** ข้ามคะแนนปวดหลังนวด */ skipPain?: boolean };
/** …and announces its own drafts so the chat knows what is already filled */
export const RECORD_DRAFT = "thaiwell:record-draft";
/** asks the treatment-record form to save (same as its “บันทึก” button) */
export const RECORD_SAVE = "thaiwell:record-save";

const TH_NUM: Record<string, number> = { ศูนย์: 0, หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10 };
const thDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));

/** offline fallback: pull the essentials out of the sentence with simple Thai keyword rules */
export function parseLocal(text: string, serviceName: string): Extract {
  const t = thDigits(text.replace(/\s+/g, " "));
  const word = Object.keys(TH_NUM).join("|");
  const nums = [...t.matchAll(new RegExp(`(?:ปวด|เพน|pain|เหลือ|ระดับ)[^0-9]{0,14}?(\\d{1,2}|${word})`, "gi"))].map((m) => (m[1] in TH_NUM ? TH_NUM[m[1]] : Number(m[1])));
  const pain = nums.filter((n) => n >= 0 && n <= 10).pop();
  const diagnoses = DX_PICK.filter((d) => {
    const core = d.split(/[ (/]/)[0];
    const words = (d.match(/\(([^)]+)\)/)?.[1] ?? "").split(" ");
    return t.includes(core) || words.some((w) => w.length > 1 && t.includes(w));
  }).slice(0, 2);
  const procedures: Extract["procedures"] = PROC_PICK.filter((p) => t.includes(p) || (p.startsWith("ประคบ") && t.includes("ประคบ")) || (p.startsWith("กดจุด") && t.includes("กดจุด")) || (p.includes("ฤาษี") && t.includes("ฤาษี"))).map((name) => ({ name }));
  const short: [string, string][] = [["นวดรักษา", "นวดไทยเพื่อการรักษา"], ["นวดสุขภาพ", "นวดไทยเพื่อสุขภาพ"], ["นวดเท้า", "นวดเท้าเพื่อสุขภาพ"], ["อบสมุนไพร", "อบไอน้ำสมุนไพร"], ["อบไอน้ำ", "อบไอน้ำสมุนไพร"], ["พอก", "พอกสมุนไพร"]];
  for (const [k, name] of short) if (t.includes(k) && !procedures.some((p) => p.name === name)) procedures.unshift({ name });
  if (!procedures.some((p) => p.name.startsWith("นวด")) && /นวด/.test(t)) procedures.unshift({ name: serviceName });
  const adv = t.match(/(?:แนะนำ(?:ให้)?|ฝาก(?:ให้)?)(.+)$/)?.[1]?.trim() ?? "";
  return { diagnoses, procedures, painAfter: pain ?? null, advice: adv };
}

/** the question set, in clinical order */
const SET: { slot: Exclude<Slot, "summary">; label: string }[] = [
  { slot: "finding", label: "ตรวจร่างกาย" },
  { slot: "dx", label: "วินิจฉัย" },
  { slot: "proc", label: "หัตถการ" },
  { slot: "pain", label: "ปวดหลังนวด" },
  { slot: "advice", label: "คำแนะนำถึงผู้ป่วย" },
];
/** every body area mentioned in free text ("บ่า ไหล่ขวา และเอว" → บ่า, ไหล่, หลังส่วนล่าง) */
export function areasIn(text: string): BodyArea[] {
  const out = new Set<BodyArea>();
  for (const a of BODY_AREAS) if (text.includes(a)) out.add(a);
  for (const w of text.split(/[\s,·/]+|และ|กับ/)) {
    const a = w && toArea(w);
    if (a) out.add(a);
  }
  // "หลัง" alone means the back in general
  if (/หลัง(?!ส่วน|นวด)/.test(text) && !out.has("หลังส่วนบน") && !out.has("หลังส่วนล่าง")) out.add("หลังส่วนบน");
  return [...out];
}

/** "หัตถการ", "แก้วินิจฉัย", "ขอดูสรุปหน่อย" → the section the user wants to record or edit */
const TOPICS: [Slot, RegExp][] = [
  ["finding", /^(อาการ(ที่ตรวจพบ)?|สิ่งที่ตรวจพบ|ตรวจพบ|ตรวจร่างกาย)$/],
  ["dx", /^(การ)?วินิจฉัย$/],
  ["proc", /^(หัตถ?การ|หัตการ)$/],
  ["pain", /^(pain|เพน|คะแนนปวด|ความปวด|ปวด)(หลังนวด)?$/i],
  ["advice", /^คำแนะนำ(ถึงผู้ป่วย|ผู้ป่วย|คนไข้)?$/],
  ["summary", /^(ดู)?สรุป(การรักษา)?$/],
];
export function topicOf(text: string): Slot | null {
  const c = text
    .trim()
    .replace(/^(แก้ไข|แก้|ขอดู|ขอ|ไปที่|ไป|ดู|บันทึก|เปิด|กลับไป)\s*/, "")
    .replace(/\s*(หน่อย|ค่ะ|คะ|ครับ|นะ)+$/, "")
    .trim();
  return TOPICS.find(([, re]) => re.test(c))?.[0] ?? null;
}

const ASK = {
  finding: "เริ่มจากอาการก่อนนะคะ วันนี้ตรวจเจออะไรบ้างคะ ปวดหรือตึงตรงไหน",
  dx: "แล้ววินิจฉัยว่าเป็นอะไรคะ",
  proc: "วันนี้ทำหัตถการอะไรไปบ้างคะ นวดเส้นไหน นานเท่าไหร่",
  pain: "หลังนวดผู้ป่วยให้คะแนนปวดเท่าไหร่คะ",
};
const no = (slot: Slot) => SET.findIndex((x) => x.slot === slot) + 1;

/**
 * ผู้ช่วยบันทึกการรักษา — a chat with the AI. The therapist talks (live transcript while speaking), types, or taps the
 * component attached to each question (diagnosis chips, procedure chips, pain scale). Everything flows into the record
 * form straight away. Then the AI drafts the advice to the patient, which can be edited by hand or by asking.
 * Voice mode: the AI speaks each question and listens for the answer hands-free (auto-stops on silence).
 */
export function VoiceNote({ appt }: { appt: Appointment; bare?: boolean }) {
  const store = useStore();
  const p = store.patientById(appt.patientId);
  const s = store.serviceById(appt.serviceId);
  const voiceId = store.settings.callVoice ?? DEFAULT_CALL_VOICE;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pain, setPain] = useState<number | undefined>(appt.painAfter);
  const [advice, setAdvice] = useState(appt.advice ?? "");
  const toast = useToast();
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [editAdvice, setEditAdvice] = useState(false);
  // what the AI proposed for the current question (diagnosis / procedures)
  type Sug = { name: string; why?: string; area?: string; minutes?: number | null };
  const [sug, setSug] = useState<{ slot: Slot; items: Sug[] } | null>(null);
  const sugRef = useRef(sug);
  sugRef.current = sug;
  const [others, setOthers] = useState(false);
  const [editF, setEditF] = useState(false);
  const [editPain, setEditPain] = useState(false);
  const [fText, setFText] = useState("");
  const mic = useRef<MicRec | null>(null);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const vm = useRef(voiceMode);
  vm.current = voiceMode;
  const heardSpeech = useRef(false);
  const quietSince = useRef(0);
  const peeking = useRef(false);
  // when the live transcript last changed (stable text = finished talking)
  const liveAt = useRef(0);
  const [sending, setSending] = useState(false);
  const secure = typeof window === "undefined" || window.isSecureContext;
  const canRecord = secure && !!navigator.mediaDevices?.getUserMedia;
  const dx = appt.diagnoses ?? [];
  const pr = appt.procedures ?? [];
  const findings = appt.findings ?? "";
  const latest = useRef({ findings, dx, pr, pain, advice });
  latest.current = { findings, dx, pr, pain, advice };
  const last = msgs[msgs.length - 1];
  const pending = last?.role === "ai" ? last.kind : undefined;
  // read through refs: voice mode finishes a turn from the mic callback, which closes over an older render
  const turn = useRef({ last, pending });
  turn.current = { last, pending };

  const say = (role: Msg["role"], text: string, kind?: Msg["kind"]) => {
    const step = role === "ai" && kind && kind !== "intro" && kind !== "summary" ? no(kind) : undefined;
    const m: Msg = { id: ++seq.current, role, text, kind, step };
    setMsgs((x) => [...x, m]);
    return m;
  };
  const fill = (patch: Omit<VoiceFill, "apptId">) => window.dispatchEvent(new CustomEvent<VoiceFill>(VOICE_FILL, { detail: { apptId: appt.id, ...patch } }));
  const savePain = (n: number) => {
    setPain(n);
    latest.current = { ...latest.current, pain: n };
    fill({ painAfter: n });
  };
  const saveAdvice = (t: string) => {
    setAdvice(t);
    latest.current = { ...latest.current, advice: t };
    fill({ advice: t });
  };

  // the form tells us when Pain / advice were changed by hand
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<VoiceFill>).detail;
      if (d.apptId !== appt.id) return;
      if (d.painAfter !== undefined) setPain(d.painAfter);
      if (d.advice !== undefined) setAdvice(d.advice);
    };
    window.addEventListener(RECORD_DRAFT, on);
    return () => window.removeEventListener(RECORD_DRAFT, on);
  }, [appt.id]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, live, thinking]);
  useEffect(
    () => () => {
      mic.current?.cancel();
      stopSpeaking();
    },
    [],
  );

  /** speak an AI line in voice mode, then listen for the answer */
  const voice = async (text: string) => {
    if (!vm.current) return;
    setSpeaking(true);
    await speak(text.replace(/[“”"]/g, ""), voiceId);
    setSpeaking(false);
    if (vm.current && !mic.current) void listen();
  };

  const missing = (): Slot => {
    const l = latest.current;
    if (!l.findings.trim()) return "finding";
    if (!l.dx.length) return "dx";
    if (!l.pr.length) return "proc";
    if (l.pain === undefined) return "pain";
    if (!l.advice.trim()) return "advice";
    return "summary";
  };

  const draftAdvice = async (instruction?: string) => {
    const l = latest.current;
    const sm = samuthan(p, { time: appt.start });
    try {
      const r = await chatJSON<{ advice: string }>(
        `คุณเป็นแพทย์แผนไทย เขียน "คำแนะนำถึงผู้ป่วย" หลังรับบริการ ภาษาไทยสุภาพ อ่านง่าย 2–4 ข้อสั้น ๆ ขึ้นบรรทัดใหม่ทีละข้อ ขึ้นต้นด้วย "• " เน้นสิ่งที่ทำได้ที่บ้าน (ประคบ ท่าฤาษีดัดตน สมุนไพร อาหารที่ควรเลี่ยง) และอาการที่ควรกลับมาพบ ตอบ JSON {"advice":"..."}\n${THAI_MASSAGE_KNOWLEDGE}`,
        JSON.stringify({
          ข้อมูลทั้งหมด: context(),
          อาการสำคัญ: p.complaint,
          สิ่งที่ตรวจพบวันนี้: l.findings,
          วินิจฉัย: l.dx.map((d) => d.name),
          หัตถการ: l.pr.map((x) => [x.name, x.area].filter(Boolean).join(" ")),
          ปวดก่อนหลัง: `${appt.painBefore} → ${l.pain ?? "?"}`,
          ธาตุที่เสี่ยง: sm.top,
          แนวทางตามธาตุ: sm.plan,
          โรคประจำตัว: p.conditions,
          แพ้: p.allergies ?? [],
          คำแนะนำเดิม: instruction ? l.advice : undefined,
          สิ่งที่ต้องการแก้: instruction,
        }),
      );
      return r.advice?.trim() || "";
    } catch {
      return (instruction ? `${l.advice}\n• ${instruction}` : `• ${sm.plan.compress}\n• ${sm.plan.exercise}\n• หลีกเลี่ยง ${sm.plan.avoid}\n• ถ้าปวดมากขึ้น ชา หรือมีไข้ ให้กลับมาพบแพทย์`).trim();
    }
  };

  // answers given early (e.g. pain or procedures said while answering the findings) — confirmed when their turn comes
  const held = useRef<{ dx?: string[]; proc?: Extract["procedures"]; pain?: number }>({});
  // a section opened by name: show what is recorded and let the answer replace it
  const editing = useRef<Slot | null>(null);
  useEffect(() => {
    held.current = {};
  }, [appt.id]);
  const prevVisits = () =>
    store.appointments
      .filter((a) => a.patientId === p.id && a.status === "done" && a.id !== appt.id)
      .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))
      .slice(0, 3);
  /** everything the clinic knows that helps the AI think like the therapist's colleague */
  const context = () => {
    const l = latest.current;
    const ik = intakeOfVisit(appt, p);
    const sc = p.screening;
    const sm = samuthan(p, { time: appt.start });
    const ev = bestForElement(outcomeRows(store.appointments, store.patients), sm.factors[0].element, store.services)
      .slice(0, 3)
      .map((x) => `${x.service.name} ปวดลดเฉลี่ย ${x.mean.toFixed(1)} (${x.n} ครั้ง)`);
    return {
      ผู้ป่วย: { เพศ: p.gender, อายุ: p.age, อาการสำคัญ: p.complaint, โรคประจำตัว: p.conditions, แพ้: p.allergies ?? [] },
      แจ้งมาก่อนนัด: ik && { อาการ: ik.complaint, เป็นมา: ik.duration, จุดที่อยากให้เน้น: ik.focusAreas, จุดที่ไม่ให้นวด: ik.avoidAreas, แรงนวดที่ต้องการ: ik.pressure, ยาที่ใช้: ik.medications, ยาเพิ่มเสี่ยงเลือดออก: ik.bloodThinner, ชาอ่อนแรง: ik.numbness, ลักษณะงาน: ik.occupation },
      คัดกรองที่เคาน์เตอร์: sc && { ความดัน: sc.bpSys ? `${sc.bpSys}/${sc.bpDia}` : undefined, จุดที่ปวด: sc.painAreas, หลีกเลี่ยง: sc.avoid, แรงนวด: sc.pressure, ยาเพิ่มเสี่ยงเลือดออก: sc.bloodThinner },
      ธาตุ: { เจ้าเรือน: sm.factors[0].element, เสี่ยงเสียสมดุลตอนนี้: sm.top, แนวทาง: sm.plan },
      ครั้งก่อน: prevVisits().map((a) => ({ วันที่: a.date, บริการ: store.serviceById(a.serviceId).name, ตรวจพบ: a.findings, วินิจฉัย: a.diagnoses?.map((d) => d.name), หัตถการ: a.procedures?.map((x) => [x.name, x.area, x.minutes && `${x.minutes} นาที`].filter(Boolean).join(" ")), ปวด: `${a.painBefore}→${a.painAfter ?? "?"}` })),
      ผลจริงของคลินิกกับธาตุเดียวกัน: ev,
      วันนี้: { บริการที่นัด: `${s.name} ${s.minutes} นาที`, ปวดก่อนนวด: appt.painBefore, ตรวจพบ: l.findings, วินิจฉัย: l.dx.map((d) => d.name), หัตถการ: l.pr.map((x) => [x.name, x.area, x.minutes && `${x.minutes} นาที`].filter(Boolean).join(" ")), ปวดหลังนวด: l.pain },
    };
  };

  /** the AI proposes the diagnosis / procedures from what is known so far */
  const suggest = async (slot: "dx" | "proc"): Promise<Sug[]> => {
    const l = latest.current;
    try {
      const r = await chatJSON<{ items: Sug[] }>(
        slot === "dx"
          ? `คุณเป็นแพทย์แผนไทยผู้เชี่ยวชาญ คิดอย่างรอบคอบจากข้อมูลทั้งหมด (สิ่งที่ตรวจพบวันนี้สำคัญที่สุด รองลงมาคืออาการที่แจ้งมา ประวัติครั้งก่อน ธาตุ) แล้วเสนอการวินิจฉัยที่น่าจะเป็น 1–3 ข้อ เรียงจากมากไปน้อย ใช้ชื่อจากรายการนี้ถ้าตรง ${JSON.stringify(DX_PICK)} · why = เหตุผลสั้นมาก ไม่เกิน 6 คำ · ตอบ JSON {"items":[{"name":"","why":""}]}\n${THAI_MASSAGE_KNOWLEDGE}`
          : `คุณเป็นแพทย์แผนไทยผู้เชี่ยวชาญ เสนอหัตถการที่เหมาะที่สุดวันนี้ 1–2 ข้อ ใช้ชื่อจากรายการนี้ ${JSON.stringify(PROC_PICK)} พร้อมตำแหน่ง/เส้นประธาน (area) และนาที (minutes รวมไม่เกินเวลาบริการที่นัด) โดยดูวินิจฉัย จุดที่อยากให้เน้น สิ่งที่ได้ผลครั้งก่อน และผลจริงของคลินิก · ความปลอดภัย: ห้ามเสนอตำแหน่งที่ไม่ให้นวด/หลีกเลี่ยง · ยาเพิ่มเสี่ยงเลือดออกหรือแรงนวดเบา → ระบุแรงเบาใน why · ธาตุไฟเสี่ยง → เลี่ยงประคบร้อนจัด · area สั้น ๆ (เช่น "บ่า ไหล่ขวา" หรือ "เส้นอิทา ปิงคลา") · why ไม่เกิน 6 คำ · ตอบ JSON {"items":[{"name":"","area":"","minutes":0,"why":""}]}\n${THAI_MASSAGE_KNOWLEDGE}`,
        JSON.stringify(context()),
      );
      const items = (r.items ?? []).filter((x) => x?.name).slice(0, slot === "dx" ? 3 : 2);
      if (items.length) return items;
      throw new Error("empty");
    } catch {
      // offline: read the findings + complaint with the keyword rules, procedures from the booked service
      if (slot === "dx") return parseLocal(`${l.findings} ${p.complaint}`, s.name).diagnoses.map((name) => ({ name, why: "จากอาการที่ตรวจพบ" }));
      return [{ name: s.name, minutes: s.minutes, why: "ตามบริการที่นัด" }];
    }
  };
  const short = (n: string) => n.replace(/\s*\(.*\)/, "");
  /** areas the patient asked not to be massaged */
  const avoidAreas = () => [...new Set((intakeOfVisit(appt, p)?.avoidAreas ?? []).flatMap((a) => toAreas(a)))];
  /** a spoken warning when a proposal touches a no-massage area */
  const avoidWarn = (items: Sug[]) => {
    const hit = items.flatMap((x) => areasIn(x.area ?? "")).filter((a) => avoidAreas().includes(a));
    return hit.length ? ` แต่${[...new Set(hit)].join(" ")}ผู้ป่วยแจ้งว่าไม่ให้นวดนะคะ ยืนยันจริงไหมคะ` : "";
  };

  /** ask for whatever is still missing (with its component) */
  const askNext = (prefix = "") => ask(missing(), prefix);
  const question = (slot: Slot) => {
    if (slot === "pain") {
      const last = prevVisits()[0];
      return `${ASK.pain} ก่อนนวดอยู่ที่ ${appt.painBefore}${last?.painAfter !== undefined ? ` ครั้งก่อนหลังนวดเหลือ ${last.painAfter}` : ""}`;
    }
    return slot in ASK ? ASK[slot as keyof typeof ASK] : "";
  };
  /** ask one question of the set (also used when a step in the question strip is tapped) */
  const ask = async (slot: Slot, prefix = "") => {
    if (slot === "advice") {
      let a = latest.current.advice;
      const had = !!a.trim();
      if (!had) {
        setThinking(true);
        a = await draftAdvice();
        setThinking(false);
        saveAdvice(a);
      }
      const t = `${prefix}${had ? "นี่คือคำแนะนำถึงผู้ป่วยตอนนี้ค่ะ" : "ร่างคำแนะนำถึงผู้ป่วยไว้ให้แล้วนะคะ"} อยากปรับตรงไหนบอกได้เลยค่ะ`;
      say("ai", t, "advice");
      void voice(t);
      return;
    }
    if (slot === "summary") {
      const l = latest.current;
      const lack = [!l.findings.trim() && "อาการ", !l.dx.length && "วินิจฉัย", !l.pr.length && "หัตถการ", l.pain === undefined && "ปวดหลังนวด", !l.advice.trim() && "คำแนะนำ"].filter(Boolean);
      const t = lack.length
        ? `${prefix}สรุปตอนนี้ค่ะ ยังขาด${lack.join(" ")} พิมพ์หรือพูดชื่อหัวข้อเพื่อบันทึกต่อได้เลยนะคะ`
        : `${prefix}ครบทุกเรื่องแล้วค่ะ ลองดูสรุปด้านล่าง แก้ได้ทุกช่อง แล้วกดบันทึกการรักษาได้เลยนะคะ`;
      say("ai", t, "summary");
      void voice(t);
      return;
    }
    setPick([]);
    setOthers(false);
    if (slot === "finding" && editing.current === "finding" && latest.current.findings.trim()) {
      setSug({ slot, items: [{ name: latest.current.findings }] });
      const q = `${prefix}ตอนนี้บันทึกอาการไว้ว่า ${latest.current.findings} พิมพ์หรือพูดใหม่เพื่อแก้ได้เลยค่ะ`;
      say("ai", q, slot);
      void voice(q);
      return;
    }
    if (slot === "finding") {
      // start from what the patient told us before the visit
      const ik = intakeOfVisit(appt, p);
      const told = [ik?.complaint ?? p.complaint, ik?.focusAreas?.length ? `อยากให้เน้น${ik.focusAreas.join(" ")}` : ""].filter(Boolean).join(" ");
      if (told) {
        setSug({ slot, items: [{ name: told }] });
        const q = `${prefix}ผู้ป่วยแจ้งมาว่า${told} วันนี้ตรวจแล้วเป็นตามนี้ไหมคะ หรือเล่าสิ่งที่ตรวจพบได้เลย`;
        say("ai", q, slot);
        void voice(q);
        return;
      }
    }
    if (slot === "pain" && held.current.pain !== undefined) {
      const n = held.current.pain;
      setSug({ slot, items: [{ name: String(n) }] });
      const q = `${prefix}เมื่อกี้บอกว่าหลังนวดปวดเหลือ ${n} ใช่ไหมคะ`;
      say("ai", q, slot);
      void voice(q);
      return;
    }
    if (slot === "dx" || slot === "proc") {
      const l = latest.current;
      const recorded: Sug[] = editing.current === slot ? (slot === "dx" ? l.dx.map((d) => ({ name: d.name, why: "บันทึกไว้แล้ว" })) : l.pr.map((x) => ({ name: x.name, area: x.area, minutes: x.minutes ?? null, why: "บันทึกไว้แล้ว" }))) : [];
      const early: Sug[] | undefined = slot === "dx" ? held.current.dx?.map((name) => ({ name, why: "จากที่บอกไว้" })) : held.current.proc?.map((x) => ({ ...x, why: "จากที่บอกไว้" }));
      setThinking(true);
      const items = recorded.length ? recorded : early?.length ? early : await suggest(slot);
      setThinking(false);
      setSug({ slot, items });
      setPick(items.length ? (slot === "dx" && !recorded.length ? [items[0].name] : items.map((x) => x.name)) : []);
      const top = items[0];
      if (recorded.length) {
        const q = `${prefix}ตอนนี้บันทึก${slot === "dx" ? "วินิจฉัย" : "หัตถการ"}ไว้ว่า ${items.map((x) => `${short(x.name)}${x.area ? `ที่${x.area}` : ""}${x.minutes ? ` ${x.minutes} นาที` : ""}`).join(" และ ")} ${slot === "dx" ? "เลือกใหม่" : "แตะหุ่น"}หรือพูดเพื่อแก้ได้เลยค่ะ เสร็จแล้วตอบ “ใช่”`;
        say("ai", q, slot);
        void voice(q);
        return;
      }
      const lastDx = prevVisits()[0]?.diagnoses?.map((d) => d.name) ?? [];
      const q = !top
        ? question(slot)
        : early?.length
          ? `เมื่อกี้บอกว่า${slot === "dx" ? short(top.name) : items.map((x) => `${x.name}${x.area ? `ที่${x.area}` : ""}${x.minutes ? ` ${x.minutes} นาที` : ""}`).join(" และ ")} ใช่ไหมคะ`
          : slot === "dx"
            ? `จากที่ตรวจพบ น่าจะเป็น${short(top.name)}${lastDx.includes(top.name) ? " เหมือนครั้งก่อน" : ""}ค่ะ ใช่ไหมคะ หรือบอกการวินิจฉัยอื่นได้เลย`
            : `วันนี้${items.map((x) => `${x.name}${x.area ? `ที่${x.area}` : ""}${x.minutes ? ` ${x.minutes} นาที` : ""}`).join(" และ ")} ใช่ไหมคะ${avoidWarn(items)}`;
      say("ai", prefix + q, slot);
      void voice(prefix + q);
      return;
    }
    setSug(null);
    const q = question(slot);
    say("ai", prefix + q, slot);
    void voice(prefix + q);
  };

  const apply = (x: Extract) => {
    const l = latest.current;
    const ndx = [...l.dx];
    for (const n of x.diagnoses ?? []) if (n && !ndx.some((d) => d.name === n)) ndx.push({ name: n, code: dxCode(n)?.code, kind: ndx.length ? "secondary" : "principal" });
    const npr = [...l.pr];
    for (const q of x.procedures ?? []) if (q?.name && !npr.some((y) => y.name === q.name)) npr.push({ name: q.name, code: procCode(q.name)?.code, area: q.area || undefined, minutes: q.minutes ?? (npr.length ? undefined : s.minutes) });
    const xf = x.findings?.trim() ?? "";
    const nf = xf && editing.current === "finding" ? xf : !xf || l.findings.includes(xf) ? l.findings : xf.includes(l.findings.trim()) || !l.findings.trim() ? xf : `${l.findings.trim()} · ${xf}`;
    if (ndx.length !== l.dx.length || npr.length !== l.pr.length || nf !== l.findings) {
      store.dispatch({ type: "updateAppointment", id: appt.id, patch: { diagnoses: ndx, procedures: npr, findings: nf || undefined }, log: "บันทึกด้วยเสียง: ผู้ช่วย AI เติมบันทึกการรักษา" });
      latest.current = { ...latest.current, findings: nf, dx: ndx, pr: npr };
    }
    if (typeof x.painAfter === "number" && x.painAfter >= 0 && x.painAfter <= 10) savePain(Math.round(x.painAfter));
    if (x.advice?.trim() && !latest.current.advice.trim()) saveAdvice(x.advice.trim());
    return [
      xf && !l.findings.includes(xf) ? `ตรวจพบ ${xf}` : "",
      x.diagnoses?.length ? `วินิจฉัย ${x.diagnoses.join(", ")}` : "",
      x.procedures?.length ? `หัตถการ ${x.procedures.map((q) => q.name + (q.minutes ? ` ${q.minutes} นาที` : "")).join(", ")}` : "",
      typeof x.painAfter === "number" ? `ปวดหลังนวด ${x.painAfter}` : "",
    ].filter(Boolean);
  };

  /** one user turn (spoken or typed): fix the transcript, take the answer to the question asked, reply naturally */
  const onUser = async (text: string, spoken = false) => {
    const t = text.trim();
    if (!t) return;
    const me = say("me", t);
    // a section name opens that section with its recorder
    const topic = topicOf(t);
    if (topic) {
      stopSpeaking();
      editing.current = topic;
      setEditAdvice(false);
      await ask(topic);
      return;
    }
    setThinking(true);
    const { pending: asked } = turn.current;
    if (asked === "advice" || asked === "summary") {
      // a request to change the advice
      const a = await draftAdvice(t);
      saveAdvice(a);
      setThinking(false);
      const r = "ปรับให้แล้วค่ะ ลองดูอีกทีนะคะ";
      say("ai", r, "advice");
      void voice(r);
      return;
    }
    const slot: Slot = asked && asked !== "intro" ? asked : missing();
    const yes = /^(ใช่|ถูก|โอเค|ok|ตามนั้น|ได้|ครับ|ค่ะ)/i.test(t);
    // procedures are confirmed on the body: "ใช่" records what is shown
    if (slot === "proc" && yes && sugRef.current?.slot === "proc" && sugRef.current.items.length) {
      // the proposal is the whole list → it replaces what was recorded
      const procedures = sugRef.current.items.map((x) => ({ name: x.name, code: procCode(x.name)?.code, area: x.area || undefined, minutes: x.minutes ?? undefined }));
      store.dispatch({ type: "updateAppointment", id: appt.id, patch: { procedures }, log: "บันทึกด้วยเสียง: หัตถการ" });
      latest.current = { ...latest.current, pr: procedures };
      held.current.proc = undefined;
      editing.current = null;
      setThinking(false);
      await askNext("บันทึกหัตถการแล้วค่ะ ");
      return;
    }
    const nextSlot = (SET[SET.findIndex((x) => x.slot === slot) + 1]?.slot ?? "summary") as Slot;
    // held answers are confirmed by ask() ("เมื่อกี้บอกว่า…"), so the model only writes the next question when nothing is held
    const nextQ = nextSlot === "pain" && held.current.pain === undefined ? question("pain") : null;
    type Turn = Extract & { heard?: string; got?: boolean; reply?: string };
    let x: Turn;
    let local = false;
    try {
      x = await chatJSON<Turn>(
        `คุณคือ "ผู้ช่วยบันทึกการรักษา" ในคลินิกแพทย์แผนไทย ผู้หญิง พูดภาษาไทยเป็นธรรมชาติ อบอุ่น กระชับ เหมือนเพื่อนร่วมงานคุยกัน ลงท้าย ค่ะ/นะคะ
งานของคุณในแต่ละตา:
1) heard: แก้ข้อความที่ได้จากระบบถอดเสียงให้ถูกต้องตามศัพท์แพทย์แผนไทย (เช่น "เอตา"→"อิทา", "ปัตตคาด"→"ปัตคาด", ตัวเลขที่พูดเป็นคำให้เป็นเลข) โดยไม่เปลี่ยนความหมาย ถ้าเป็นข้อความที่พิมพ์มาให้คงเดิม
2) ดึงข้อมูลเรื่องที่ถาม (${SET.find((x) => x.slot === slot)?.label}) และถ้าผู้ใช้พูดเรื่องอื่นในชุดมาด้วย (วินิจฉัย หัตถการ ปวดหลังนวด) ให้ใส่ด้วย แต่ห้ามอนุมานหรือเดาสิ่งที่ไม่ได้พูด · ถ้าผู้ใช้ตอบรับสิ่งที่คุณเสนอ (เช่น "ใช่" "ถูก" "โอเค" "ตามนั้น") ให้ใช้รายการที่เสนอทั้งหมด (พร้อม area/minutes; ถ้าเรื่องที่ถามคือปวดหลังนวด ตัวเลขที่เสนอคือ painAfter) · ถ้าแก้บางส่วน ให้ใช้ตามที่แก้ · ห้ามใช้ตัวเลขหรือข้อมูลจาก "ครั้งก่อน" เป็นคำตอบของวันนี้ · ถ้าตอบ "ใช่" แต่ไม่ได้เสนออะไรไว้ ให้ got=false
3) reply: ถ้าได้คำตอบ (got=true) ทวนสั้น ๆ แบบธรรมชาติ 1 ประโยค เฉพาะเรื่องที่ถาม (เรื่องอื่นที่พูดมาจะถามยืนยันทีหลัง ห้ามบอกว่าบันทึกแล้ว) แล้วถาม "คำถามถัดไป" ด้วยสำนวนพูดของคุณเอง ถ้าคำถามถัดไปเป็น null ให้ตอบรับสั้น ๆ อย่างเดียว · ถ้ายังไม่ได้คำตอบ (got=false) ขอให้ตอบเรื่องที่ถามอีกครั้งอย่างสุภาพ · ไม่เกิน 2 ประโยคสั้น ไม่ใช้ bullet ไม่ใช้อีโมจิ ไม่ใส่รหัสโรค
ตอบ JSON เท่านั้น: {"heard":"...","got":true,"findings":"","diagnoses":[],"procedures":[{"name":"","area":"","minutes":null}],"painAfter":null,"reply":"..."}
ชื่อที่ใช้ได้ถ้าตรงความหมาย: วินิจฉัย ${JSON.stringify(DX_PICK)} · หัตถการ ${JSON.stringify(PROC_PICK)}`,
        JSON.stringify({ ข้อมูลผู้ป่วยและการรักษา: context(), เรื่องที่ถาม: question(slot), ข้อความล่าสุดของคุณ: turn.current.last?.role === "ai" ? turn.current.last.text : null, สิ่งที่คุณเสนอไว้: sugRef.current?.slot === slot ? (slot === "dx" ? sugRef.current.items.slice(0, 1) : sugRef.current.items) : null, ข้อความ: t, มาจากเสียงพูด: spoken, คำถามถัดไป: nextQ, บริการวันนี้: s.name, ปวดก่อนนวด: appt.painBefore }),
      );
    } catch {
      x = parseLocal(t, s.name);
      local = true;
    }
    const heard = spoken && x.heard?.trim() ? x.heard.trim() : t;
    if (heard !== t) setMsgs((ms) => ms.map((m) => (m.id === me.id ? { ...m, text: heard } : m)));
    // one question at a time: keep only the answer to the question that was asked
    const only: Extract = { diagnoses: [], procedures: [], painAfter: null, advice: "" };
    if (slot === "finding") only.findings = x.findings?.trim() || (/^(ใช่|ถูก|โอเค|ตามนั้น)/.test(heard) && sugRef.current?.slot === "finding" ? sugRef.current.items[0].name : heard);
    if (slot === "dx") only.diagnoses = x.diagnoses ?? [];
    if (slot === "pain") only.painAfter = x.painAfter;
    if (slot === "proc") {
      // what was said becomes the proposal on the body; recorded after "ใช่"
      const said = (x.procedures ?? []).filter((q) => q?.name);
      const places = areasIn(heard).join(" ");
      const base = said.length ? said : (sugRef.current?.slot === "proc" ? sugRef.current.items : [{ name: s.name, minutes: s.minutes }]);
      // "เพิ่มหลังส่วนบน" adds, "เอาเข่าออก" removes, otherwise the spoken places replace the first procedure's
      const adding = /เพิ่ม/.test(heard);
      const removing = /ออก|ลบ|ไม่ต้อง/.test(heard);
      const placeFor = (cur: string | undefined) => {
        if (!places) return cur;
        const now = areasIn(cur ?? "");
        const spoken = areasIn(heard);
        if (removing) return now.filter((a) => !spoken.includes(a)).join(" ");
        if (adding) return [...new Set([...now, ...spoken])].join(" ");
        return places;
      };
      const minutesSaid = Number((heard.match(/(\d{2,3})\s*นาที/) ?? [])[1]) || null;
      const items: Sug[] = base.map((q, i) => ({ name: q.name, minutes: (i === 0 && minutesSaid) || q.minutes || null, area: (said.length ? q.area : undefined) || (i === 0 ? placeFor(q.area) : q.area) || undefined }));
      setThinking(false);
      setSug({ slot: "proc", items });
      setPick(items.map((q) => q.name));
      const r = `${items.map((q) => `${q.name}${q.area ? `ที่${q.area}` : ""}${q.minutes ? ` ${q.minutes} นาที` : ""}`).join(" และ ")} ใช่ไหมคะ ดูตำแหน่งบนหุ่นได้เลยค่ะ${avoidWarn(items)}`;
      say("ai", r, "proc");
      void voice(r);
      return;
    }
    const got = apply(only);
    if (got.length) editing.current = null;
    // anything said ahead of its question is kept and confirmed later
    if (slot !== "dx" && x.diagnoses?.length) held.current.dx = x.diagnoses;
    if (x.procedures?.some((q) => q?.name)) held.current.proc = x.procedures.filter((q) => q?.name);
    if (slot !== "pain" && typeof x.painAfter === "number") held.current.pain = x.painAfter;
    if (slot === "dx") held.current.dx = undefined;
    if (slot === "pain") held.current.pain = undefined;
    setThinking(false);
    const reply = !local ? x.reply?.trim() : "";
    if (!got.length) {
      setPick([]);
      const r = reply && x.got === false ? reply : `ขอโทษค่ะ ยังไม่ได้ยินเรื่องนี้ชัด ${question(slot)}`;
      say("ai", r, slot);
      void voice(r);
      return;
    }
    if (!nextQ || missing() !== nextSlot) {
      await askNext(reply ? `${reply} ` : "รับทราบค่ะ ");
      return;
    }
    setPick([]);
    const r = reply || `รับทราบค่ะ ${got.join(" · ")} ${nextQ}`;
    say("ai", r, nextSlot);
    void voice(r);
  };

  // ── microphone with live transcript ──
  const listen = async () => {
    if (!canRecord || mic.current) return;
    stopSpeaking();
    setSpeaking(false);
    heardSpeech.current = false;
    quietSince.current = 0;
    try {
      const started = Date.now();
      // learn the room's noise for ~0.6 s, then speech = clearly above it
      let floorSum = 0;
      let floorN = 0;
      let thr = 0.3;
      mic.current = await startMic((v) => {
        setLevel(v);
        const now = Date.now();
        if (now - started < 600) {
          floorSum += v;
          floorN++;
          thr = Math.max(0.16, Math.min(0.5, (floorSum / floorN) * 2.2 + 0.06));
          return;
        }
        if (v > thr) {
          heardSpeech.current = true;
          quietSince.current = 0;
        } else if (heardSpeech.current) {
          quietSince.current ||= now;
          // stopped talking → send by itself
          if (now - quietSince.current > 1300) void finish();
        }
      });
      liveAt.current = Date.now();
      setLive("");
      setRec(true);
    } catch {
      setRec(false);
      say("ai", "เปิดไมโครโฟนไม่ได้ค่ะ อนุญาตการใช้ไมค์ หรือพิมพ์ตอบแทนได้");
    }
  };
  // live transcript while speaking
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(async () => {
      const m = mic.current;
      if (!m || peeking.current) return;
      peeking.current = true;
      try {
        const { wav, seconds } = await m.peek(30);
        if (seconds > 0.8 && mic.current === m) {
          const txt = await transcribe(wav);
          if (mic.current === m && txt) {
            setLive((prev) => {
              if (prev !== txt) liveAt.current = Date.now();
              return txt;
            });
            // the words stopped changing for a while → treat as done (noisy rooms never go quiet)
            if (Date.now() - liveAt.current > 2200 && seconds > 1.5) void finish();
          }
        }
      } catch {
        /* keep the last text */
      } finally {
        peeking.current = false;
      }
    }, 1100);
    return () => window.clearInterval(t);
  }, [rec]);

  const finish = async () => {
    const m = mic.current;
    if (!m) return;
    mic.current = null;
    setRec(false);
    setLevel(0);
    const { wav, seconds } = await m.stop();
    if (seconds < 0.8) {
      setLive("");
      if (vm.current) void listen();
      return;
    }
    setSending(true); // the live bubble stays with what was heard
    try {
      const heard = await transcribe(wav);
      setSending(false);
      setLive("");
      if (heard) await onUser(heard, true);
      else if (vm.current) void listen();
    } catch {
      setSending(false);
      setLive("");
      say("ai", "ถอดเสียงไม่สำเร็จค่ะ ลองพูดอีกครั้ง หรือพิมพ์ตอบแทน");
    }
  };
  const cancel = () => {
    mic.current?.cancel();
    mic.current = null;
    setRec(false);
    setLive("");
    setLevel(0);
  };

  const intro = () => `สวัสดีค่ะ มาบันทึกการรักษาของคุณ${p.name.replace(/^(นางสาว|นาง|นาย)\s*/, "")}กันนะคะ วันนี้มี ${SET.length} เรื่อง เดี๋ยวถามไปทีละข้อค่ะ จะพิมพ์หรือแตะปุ่มคลื่นเสียงเพื่อคุยกันก็ได้นะคะ`;
  /** intro with the question set, then the first unanswered question */
  const begin = () => {
    seq.current = 0;
    setMsgs([{ id: ++seq.current, role: "ai", text: intro(), kind: "intro" }]);
    void askNext();
  };
  useEffect(() => {
    begin();
  }, [appt.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** start over: clear what the assistant filled (undo from the toast) */
  const restart = () => {
    cancel();
    stopSpeaking();
    const before = { findings: appt.findings, diagnoses: appt.diagnoses, procedures: appt.procedures, pain, advice };
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: { findings: undefined, diagnoses: [], procedures: [] }, log: "เริ่มบันทึกการรักษาใหม่" });
    window.dispatchEvent(new CustomEvent<VoiceFill>(VOICE_FILL, { detail: { apptId: appt.id, clear: true } }));
    setPain(undefined);
    setAdvice("");
    setEditAdvice(false);
    latest.current = { findings: "", dx: [], pr: [], pain: undefined, advice: "" };
    begin();
    toast({
      message: "ล้างบันทึกการรักษาและเริ่มใหม่แล้ว",
      action: {
        label: "เลิกทำ",
        onClick: () => {
          store.dispatch({ type: "updateAppointment", id: appt.id, patch: { findings: before.findings, diagnoses: before.diagnoses, procedures: before.procedures }, log: "ย้อนการเริ่มใหม่" });
          fill({ painAfter: before.pain, advice: before.advice });
          setPain(before.pain);
          setAdvice(before.advice);
        },
      },
    });
  };

  const toggleVoice = () => {
    const on = !voiceMode;
    setVoiceMode(on);
    vm.current = on;
    if (on) {
      unlockAudio(); // inside the tap, so the AI's spoken replies can play later
      void listen();
    } else {
      stopSpeaking();
      setSpeaking(false);
      cancel();
    }
  };

  const sendDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    void onUser(t);
  };

  const removeDx = (name: string) => store.dispatch({ type: "updateAppointment", id: appt.id, patch: { diagnoses: dx.filter((d) => d.name !== name).map((d, i) => ({ ...d, kind: i ? "secondary" : "principal" })) }, log: `ลบวินิจฉัย: ${name}` });
  const removePr = (name: string) => store.dispatch({ type: "updateAppointment", id: appt.id, patch: { procedures: pr.filter((x) => x.name !== name) } });

  const lastAiId = useMemo(() => [...msgs].reverse().find((m) => m.role === "ai")?.id, [msgs]);

  /** the question set, shown as a strip above the chat */
  const value: Record<Exclude<Slot, "summary">, string | undefined> = {
    finding: findings.trim() || undefined,
    dx: dx.map((d) => d.name.replace(/\s*\(.*\)/, "")).join(", ") || undefined,
    proc: pr.map((x) => x.name.replace("เพื่อการรักษา", "รักษา").replace("เพื่อสุขภาพ", "สุขภาพ") + (x.minutes ? ` ${x.minutes}น.` : "")).join(", ") || undefined,
    pain: pain !== undefined ? `${appt.painBefore} → ${pain}` : undefined,
    advice: advice.trim() ? `${advice.trim().split("\n").length} ข้อ` : undefined,
  };
  const steps = SET.map((x) => ({ ...x, value: value[x.slot] }));


  /** quick replies under the current question */
  const QUICK: Partial<Record<Slot, string[]>> = {
    finding: ["ใช่ ตามที่แจ้งมา", "บ่าขวาตึง กดเจ็บ ยกแขนลำบาก", "ปวดหลังส่วนล่าง ร้าวลงสะโพกซ้าย"],
    advice: ["เพิ่มท่าฤาษีดัดตน", "เน้นประคบร้อนที่บ้าน", "เพิ่มอาหารที่ควรเลี่ยง", "ให้สั้นลง"],
    summary: ["เพิ่มนัดติดตามอาการใน 1 สัปดาห์", "ให้สั้นลง"],
  };
  const quickFor = (m: Msg) => {
    if (m.id !== lastAiId || thinking || rec) return [];
    return m.kind && m.kind !== "intro" ? (QUICK[m.kind] ?? []) : [];
  };

  const PainRow = ({ sm, onPick }: { sm?: boolean; onPick: (n: number) => void }) => (
    <div className={clsx("rc-pain", sm && "is-sm")} role="group" aria-label="คะแนนปวดหลังนวด">
      {Array.from({ length: 11 }, (_, n) => (
        <button key={n} type="button" aria-pressed={pain === n} className={n >= 7 ? "is-hi" : n >= 4 ? "is-mid" : undefined} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );

  /** advice to the patient: read / edit / rewrite (used by the advice question and the summary) */
  const adviceBox = (asking: boolean) => (
    <div className="rc-adv">
      <header>
        <b>คำแนะนำถึงผู้ป่วย</b>
        <button type="button" onClick={() => setEditAdvice((v) => !v)}>
          {editAdvice ? <Check size={13} /> : <Pencil size={13} />} {editAdvice ? "เสร็จ" : "แก้ไข"}
        </button>
      </header>
      {editAdvice ? <textarea value={advice} rows={5} onChange={(e) => saveAdvice(e.target.value)} aria-label="แก้คำแนะนำถึงผู้ป่วย" autoFocus /> : <p className="rc-adv__text">{advice || "—"}</p>}
      <div className="rc-adv__acts">
        <button
          type="button"
          onClick={async () => {
            setThinking(true);
            saveAdvice(await draftAdvice());
            setThinking(false);
          }}
        >
          <RefreshCw size={13} /> เขียนใหม่
        </button>
        {asking && (
          <button
            type="button"
            className="is-go"
            onClick={() => {
              setEditAdvice(false);
              say("me", "ใช้คำแนะนำนี้");
              void askNext();
            }}
          >
            <Check size={13} strokeWidth={3} /> ใช้คำแนะนำนี้
          </button>
        )}
      </div>
    </div>
  );

  /** the treatment summary: every answer in one card, editable, saved from here */
  const summary = () => {
    const done = steps.filter((x) => x.value).length;
    const drop = pain !== undefined ? appt.painBefore - pain : 0;
    const ready = pain !== undefined && dx.length > 0 && pr.length > 0;
    const row = (n: number, label: string, body: ReactNode, ok: boolean) => (
      <div className={clsx("rs2__row", ok && "is-ok")}>
        <i>{ok ? <Check size={11} strokeWidth={3.2} /> : n}</i>
        <div>
          <small>{label}</small>
          {body}
        </div>
      </div>
    );
    return (
      <div className="rs2">
        <header className="rs2__head">
          <span>
            <b>สรุปการรักษา</b>
            <small>
              {p.name} · {s.name}
            </small>
          </span>
          <em className={done === SET.length ? "is-ok" : undefined}>
            {done === SET.length ? <Check size={12} strokeWidth={3} /> : null} ครบ {done}/{SET.length}
          </em>
        </header>
        {row(
          1,
          "ตรวจร่างกาย",
          editF ? (
            <div className="rs2__edit">
              <textarea rows={2} value={fText} onChange={(e) => setFText(e.target.value)} aria-label="แก้อาการที่ตรวจพบ" autoFocus />
              <button
                type="button"
                onClick={() => {
                  store.dispatch({ type: "updateAppointment", id: appt.id, patch: { findings: fText.trim() || undefined }, log: "แก้อาการที่ตรวจพบ" });
                  setEditF(false);
                }}
              >
                <Check size={13} /> เสร็จ
              </button>
            </div>
          ) : (
            <p
              className="rs2__t"
              onClick={() => {
                setFText(findings);
                setEditF(true);
              }}
              role="button"
              title="แตะเพื่อแก้"
            >
              {findings || "—"} <Pencil size={11} />
            </p>
          ),
          !!findings,
        )}
        {row(
          2,
          "วินิจฉัย",
          <div className="rs2__chips">
            {dx.map((d) => (
              <span key={d.name}>
                {d.name.replace(/\s*\(.*\)/, "")}
                {d.code && <u>{d.code}</u>}
                <button type="button" aria-label={`ลบ ${d.name}`} onClick={() => removeDx(d.name)}>
                  <X size={11} />
                </button>
              </span>
            ))}
            {!dx.length && <p className="rs2__t">—</p>}
          </div>,
          dx.length > 0,
        )}
        {row(
          3,
          "หัตถการ",
          <div className="rs2__chips">
            {pr.map((x) => (
              <span key={x.name} className="is-proc">
                <span>
                  <b>{x.name}</b>
                  {(x.area || x.minutes) && <small>{[x.area, x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")}</small>}
                </span>
                <button type="button" aria-label={`ลบ ${x.name}`} onClick={() => removePr(x.name)}>
                  <X size={11} />
                </button>
              </span>
            ))}
            {!pr.length && <p className="rs2__t">—</p>}
          </div>,
          pr.length > 0,
        )}
        {row(
          4,
          "ปวดหลังนวด",
          <>
            <div className="rs2__pain">
              <b>
                {appt.painBefore} <span>→</span> {pain ?? "?"}
              </b>
              {pain !== undefined && <em className={drop > 0 ? "is-down" : undefined}>{drop > 0 ? `ลดลง ${drop} (${Math.round((drop / Math.max(1, appt.painBefore)) * 100)}%)` : drop === 0 ? "เท่าเดิม" : `เพิ่มขึ้น ${-drop}`}</em>}
              <button type="button" className="rs2__link" onClick={() => setEditPain((v) => !v)}>
                {editPain ? <Check size={12} /> : <Pencil size={12} />} {editPain ? "เสร็จ" : "แก้"}
              </button>
            </div>
            {(editPain || pain === undefined) && <PainRow sm onPick={(n) => (savePain(n), setEditPain(false))} />}
          </>,
          pain !== undefined,
        )}
        {row(5, "", adviceBox(false), !!advice.trim())}
        <button
          type="button"
          className="rs2__save"
          disabled={!ready}
          onClick={() => {
            window.dispatchEvent(new CustomEvent<VoiceFill>(RECORD_SAVE, { detail: { apptId: appt.id } }));
          }}
        >
          <Check size={15} strokeWidth={3} /> {ready ? "บันทึกการรักษา" : "ยังกรอกไม่ครบ"}
        </button>
      </div>
    );
  };

  /** the component attached to an AI question */
  const widget = (m: Msg) => {
    if (m.kind === "intro")
      return (
        <ol className="rc-set">
          {steps.map((x, i) => (
            <li key={x.slot} className={x.value ? "is-done" : undefined}>
              <i>{x.value ? <Check size={10} strokeWidth={3.2} /> : i + 1}</i> {x.label}
            </li>
          ))}
        </ol>
      );
    if (m.id !== lastAiId || thinking) return null;
    if (m.kind === "pain")
      return (
        <>
          <PainRow
            onPick={(n) => {
              savePain(n);
              say("me", `ปวดหลังนวด ${n}`);
              void askNext();
            }}
          />
          {/* ไม่บังคับ: ผู้ป่วยไม่ประเมิน → ข้ามไปข้อถัดไป */}
          <button
            type="button"
            className="rc-skip"
            onClick={() => {
              fill({ skipPain: true });
              say("me", "ข้าม (ไม่ได้ประเมินปวดหลังนวด)");
              void askNext();
            }}
          >
            ข้าม (ไม่ประเมิน)
          </button>
        </>
      );
    if (m.kind === "dx" || m.kind === "proc") {
      const ai = sug?.slot === m.kind ? sug.items : [];
      if (m.kind === "proc") {
        // heat = the proposed places + whatever is being said right now
        const marked = new Set<BodyArea>([...ai.flatMap((x) => areasIn(x.area ?? "")), ...(rec ? areasIn(live) : [])]);
        const heat = Object.fromEntries([...marked].map((a) => [a, 0.9])) as Partial<Record<BodyArea, number>>;
        const avoid = avoidAreas();
        const clash = [...marked].filter((a) => avoid.includes(a));
        const toggleArea = (a: BodyArea) => {
          if (!ai.length) return;
          const cur = areasIn(ai[0].area ?? "");
          const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a];
          setSug({ slot: "proc", items: ai.map((x, i) => (i === 0 ? { ...x, area: next.join(" ") } : x)) });
        };
        return (
          <div className="rc-body">
            <Body3D compact sex={p.gender} element={elementProfile(p).birth} heatmap={heat} avoid={avoid} onToggle={toggleArea} heatLabel="ตำแหน่งที่นวด" />
            <div className="rc-body__list">
              {ai.map((x) => (
                <span key={x.name}>
                  <b>{x.name}</b>
                  <small>{[x.area || "แตะหุ่นหรือพูดตำแหน่ง", x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")}</small>
                </span>
              ))}
              {clash.length > 0 ? <em className="is-clash">ตรงกับจุดที่ผู้ป่วยไม่ให้นวด: {clash.join(", ")}</em> : avoid.length > 0 && <em>ไม่ให้นวด: {avoid.join(", ")}</em>}
            </div>
            <div className="rc-body__acts">
              <span>พูดหรือแตะเพื่อเปลี่ยนตำแหน่ง · ได้หลายจุด</span>
              <button type="button" className="rc-ok" disabled={!ai.length} onClick={() => void onUser("ใช่")}>
                <Check size={13} strokeWidth={3} /> ยืนยัน
              </button>
            </div>
          </div>
        );
      }
      const opts = (m.kind === "dx" ? DX_PICK : PROC_PICK).filter((o) => !ai.some((x) => x.name === o));
      const toggle = (o: string) => setPick((x) => (x.includes(o) ? x.filter((y) => y !== o) : [...x, o]));
      return (
        <div className="rc-chips">
          {ai.length > 0 && (
            <div className="rc-ai">
              <small>
                <Sparkles size={12} /> AI แนะนำ
              </small>
              {ai.map((x) => (
                <button key={x.name} type="button" aria-pressed={pick.includes(x.name)} onClick={() => toggle(x.name)}>
                  <span>
                    {pick.includes(x.name) && <Check size={12} strokeWidth={3} />} <b>{x.name}</b>
                  </span>
                  {(x.area || x.minutes || x.why) && <small>{[x.area, x.minutes ? `${x.minutes} นาที` : "", x.why && x.why.length > 48 ? `${x.why.slice(0, 46)}…` : x.why].filter(Boolean).join(" · ")}</small>}
                </button>
              ))}
            </div>
          )}
          {ai.length > 0 && !others ? (
            <button type="button" className="rc-other" onClick={() => setOthers(true)}>
              ตัวเลือกอื่น ▾
            </button>
          ) : (
            opts.map((o) => (
              <button key={o} type="button" aria-pressed={pick.includes(o)} onClick={() => toggle(o)}>
                {pick.includes(o) && <Check size={12} strokeWidth={3} />} {o}
              </button>
            ))
          )}
          <button
            type="button"
            className="rc-ok"
            disabled={!pick.length}
            onClick={() => {
              const known = (n: string) => sug?.items.find((y) => y.name === n);
              const x: Extract = m.kind === "dx" ? { diagnoses: pick, procedures: [], painAfter: null, advice: "" } : { diagnoses: [], procedures: pick.map((name) => ({ name, area: known(name)?.area, minutes: known(name)?.minutes ?? null })), painAfter: null, advice: "" };
              say("me", pick.join(", "));
              if (m.kind === "dx") {
                // the chips are the whole selection → replace
                const diagnoses = pick.map((n, i) => ({ name: n, code: dxCode(n)?.code, kind: (i ? "secondary" : "principal") as "secondary" | "principal" }));
                store.dispatch({ type: "updateAppointment", id: appt.id, patch: { diagnoses }, log: "บันทึกด้วยเสียง: วินิจฉัย" });
                latest.current = { ...latest.current, dx: diagnoses };
              } else apply(x);
              editing.current = null;
              void askNext("ได้เลยค่ะ ");
            }}
          >
            ยืนยัน
          </button>
        </div>
      );
    }
    if (m.kind === "summary") return summary();
    if (m.kind === "advice")
      return (
        <div className="rc-card">
          {adviceBox(true)}
        </div>
      );
    return null;
  };

  return (
    <section className="rc" aria-label="ผู้ช่วยบันทึกการรักษา">

      <div className="rc-list scroll-y scroll-y--light" ref={list}>
        {msgs.map((m) => (
          <motion.div key={m.id} className={`rc-msg is-${m.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            {m.role === "ai" && (
              <span className="rc-av">
                <Sparkles size={12} />
              </span>
            )}
            <div className="rc-bub">
              {m.step && (
                <span className="rc-tag">
                  ข้อ {m.step}/{SET.length}
                </span>
              )}
              <p>{m.text}</p>
              {m.role === "ai" && !voiceMode && (
                <button
                  type="button"
                  className="rc-play"
                  aria-label="ฟังเสียง"
                  onClick={() => {
                    unlockAudio();
                    void speak(m.text, voiceId);
                  }}
                >
                  <Volume2 size={13} />
                </button>
              )}
              {widget(m)}
              {quickFor(m).length > 0 && (
                <div className="rc-quick">
                  {quickFor(m).map((q) => (
                    <button key={q} type="button" onClick={() => void onUser(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {(rec || sending) && (
          <div className={clsx("rc-msg is-me is-live", sending && "is-sending")}>
            <div className="rc-bub">
              <p>{live || (sending ? "กำลังแปลงเสียงเป็นข้อความ…" : "…")}</p>
            </div>
          </div>
        )}
        {thinking && (
          <div className="rc-msg is-ai">
            <span className="rc-av">
              <Sparkles size={12} />
            </span>
            <div className="rc-bub rc-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {voiceMode ? (
          <motion.div key="live" className="rc-bar is-rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            <span
              className="rc-live"
              role="button"
              aria-label="พูดแทรก"
              onClick={() => {
                // tap the wave while the AI talks = interrupt and speak
                if (speaking) {
                  stopSpeaking();
                  setSpeaking(false);
                  void listen();
                }
              }}
            >
              <VoiceWave level={level} speak={speaking} calm={!rec && !speaking} height={44} />
              <small>{rec ? "กำลังฟัง · หยุดพูดแล้วส่งให้เอง" : sending ? "กำลังส่ง…" : speaking ? "AI กำลังตอบ · แตะเพื่อพูดแทรก" : thinking ? "AI กำลังคิด…" : "กำลังเปิดไมค์…"}</small>
            </span>
            <button type="button" className="rc-x" onClick={toggleVoice} aria-label="จบการคุยด้วยเสียง" title="จบการคุยด้วยเสียง">
              <X size={17} />
            </button>

          </motion.div>
        ) : (
          <motion.div key="type" className="rc-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="rc-ic" onClick={() => fileIn.current?.click()} aria-label="แนบไฟล์เสียง" title="แนบไฟล์เสียง">
              <FileAudio size={17} />
            </button>
            <textarea
              value={draft}
              rows={1}
              placeholder={pending === "advice" || pending === "summary" ? "บอกให้ปรับคำแนะนำ หรือพิมพ์ชื่อหัวข้อ…" : "พิมพ์ตอบ หรือพิมพ์ชื่อหัวข้อ เช่น หัตถการ"}
              aria-label="สรุปการรักษา"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendDraft();
                }
              }}
            />
            {draft.trim() ? (
              <button type="button" className="rc-send" onClick={sendDraft} aria-label="ส่งข้อความ" disabled={thinking}>
                <Send size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="rc-send is-mic"
                onClick={toggleVoice}
                aria-label="เปิดคุยด้วยเสียง"
                title="คุยกับ AI ด้วยเสียง"
                disabled={!canRecord || thinking}
              >
                <AudioLines size={19} strokeWidth={2.3} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="rc-foot">
        {!canRecord ? <span>ไมค์ใช้ได้เมื่อเปิดผ่าน https หรือในแอป · พิมพ์ตอบได้ตามปกติ</span> : <span>ทุกคำตอบเติมลงฟอร์มด้านซ้ายทันที</span>}
        <button type="button" onClick={restart}>
          <RotateCcw size={12} /> เริ่มใหม่ทั้งหมด
        </button>
      </div>
      <input
        ref={fileIn}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.aac"
        hidden
        aria-label="ไฟล์เสียงสรุปการรักษา"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setThinking(true);
          try {
            const { wav } = await fileToWav(f);
            const heard = await transcribe(wav);
            setThinking(false);
            if (heard) await onUser(heard, true);
          } catch {
            setThinking(false);
            say("ai", "เปิดไฟล์เสียงนี้ไม่ได้ค่ะ ลองไฟล์ .m4a .mp3 หรือ .wav");
          }
        }}
      />
    </section>
  );
}
