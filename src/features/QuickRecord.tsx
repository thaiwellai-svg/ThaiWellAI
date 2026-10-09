import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AudioLines, Check, CircleCheck, CircleHelp, ClipboardList, FileAudio, Hand, MessageSquareHeart, Mic, Pencil, Send, SkipForward, Sparkles, Square, Stethoscope, Volume2, VolumeX, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { THAI_MASSAGE_KNOWLEDGE, chatJSON, fileToWav, startMic, transcribe, type Mic as MicRec } from "./ai";
import { DX_PICK, PROC_PICK } from "./ClinicalRecord";
import { dxCode, procCode } from "../data/codes";
import { samuthan } from "../data/samuthan";
import { intakeOfVisit } from "../data/intake";
import { DEFAULT_CALL_VOICE, speak, stopSpeaking, unlockAudio } from "./tts";
import { VoiceWave } from "./VoiceWave";
import { RECORD_DRAFT, RECORD_SAVE, VOICE_FILL, parseLocal, type VoiceFill } from "./VoiceNote";
import type { Appointment } from "../data/types";
import "./quick-record.css";

/**
 * ผู้ช่วยบันทึกการรักษา (แบบใหม่)
 * ─ พูด/พิมพ์/แนบไฟล์เสียง ครั้งเดียว → AI แยกใส่ 5 ช่อง (ตรวจพบ · วินิจฉัย · หัตถการ · ปวดหลังนวด · คำแนะนำ)
 * ─ แม่นก่อนเร็ว: ใส่เฉพาะที่พูดจริง (มีคำพูดอ้างอิง) · ชื่อวินิจฉัย/หัตถการตามรายการของคลินิก · ปวดหลังนวดตรวจซ้ำด้วยกฎ
 *   ไม่แน่ใจ/กำกวม → ช่องนั้นขึ้น "ให้ยืนยัน" และ AI ถามเฉพาะข้อนั้น
 * ─ แชตถามต่อเฉพาะช่องที่ยังขาด พร้อมปุ่มตอบเร็ว · สั่งแก้ด้วยคำพูดได้ ("เปลี่ยนวินิจฉัยเป็น…")
 * ─ โหมดคุยด้วยเสียง: AI อ่านออกเสียงแล้วฟังต่อเอง
 */
type Field = "finding" | "dx" | "proc" | "pain" | "advice";
const FIELDS: { key: Field; label: string; ask: string }[] = [
  { key: "finding", label: "ตรวจพบ", ask: "ตรวจร่างกายพบอะไรบ้างคะ เช่น ตำแหน่งที่ตึง กดเจ็บ หรือขยับได้น้อย" },
  { key: "dx", label: "วินิจฉัย", ask: "วินิจฉัยว่าเป็นอะไรคะ" },
  { key: "proc", label: "หัตถการ", ask: "วันนี้ทำหัตถการอะไร ตรงไหน กี่นาทีคะ" },
  { key: "pain", label: "ปวดหลังนวด", ask: "หลังนวดผู้ป่วยปวดเหลือเท่าไรคะ (0–10)" },
  { key: "advice", label: "คำแนะนำ", ask: "มีคำแนะนำถึงผู้ป่วยไหมคะ หรือให้ AI ร่างให้" },
];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<Field, string>;

type Chip = { label: string; run: () => void; tone?: "primary" | "ghost"; cls?: string };
type Msg = {
  id: number;
  role: "ai" | "me";
  text: string;
  chips?: Chip[];
  field?: Field;
  /** การ์ดคำถาม (หัวข้อ · ความคืบหน้า · คำตอบตัวอย่าง · ตอบด้วยเสียง/ข้าม) */
  q?: boolean;
  hint?: string;
  /** คำตอบตัวอย่าง: แตะแล้วเติมลงช่องพิมพ์ (เลือกได้หลายคำ แล้วกดส่ง) */
  taps?: string[];
  /** ข้อความยืนยันสั้น ๆ ว่าบันทึกอะไรไปแล้ว */
  note?: boolean;
  /** ตัวเลือกหัตถการ (เลือกได้หลายข้อ แล้วกดส่ง) พร้อมที่มา */
  opts?: { name: string; area?: string | null; minutes?: number | null; src: string }[];
};
const ICON: Record<Field, typeof Activity> = { finding: Stethoscope, dx: ClipboardList, proc: Hand, pain: Activity, advice: MessageSquareHeart };
const HINT: Record<Field, string> = {
  finding: "แตะเลือกได้หลายข้อ แล้วกดส่ง · หรือพิมพ์/พูดเอง",
  dx: "แตะตัวเลือกที่ AI แนะนำ หรือบอกการวินิจฉัยเอง",
  proc: "เลือกได้หลายข้อ แล้วกดส่ง · หรือบอกหัตถการ ตำแหน่ง และเวลาเอง",
  pain: "ถามผู้ป่วยแล้วแตะคะแนน · หรือให้ผู้ป่วยประเมินเองในแอปทีหลัง",
  advice: "ให้ AI ร่างจากการรักษาวันนี้ หรือแตะเลือกคำแนะนำแล้วกดส่ง",
};
type Extract = {
  fixed?: string;
  findings?: string | null;
  diagnoses?: string[] | null;
  procedures?: { name: string; area?: string | null; minutes?: number | null }[] | null;
  painAfter?: number | null;
  skipPain?: boolean;
  advice?: string | null;
  replace?: Field[];
  unsure?: Field[];
};

/** คำตอบจาก AI บางครั้งรูปแบบไม่ตรง (ข้อความแทนรายการ ตัวเลขเป็นข้อความ) → ปรับให้ถูกชนิดก่อนใช้ */
function normalize(r: unknown): Extract {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() && !/^(null|none|-|ไม่มี)$/i.test(v.trim()) ? v.trim() : null);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
    return v === null || v === "" || !Number.isFinite(n) ? null : n;
  };
  const fields = (v: unknown) => arr(v).filter((x): x is Field => typeof x === "string" && ["finding", "dx", "proc", "pain", "advice"].includes(x));
  const dx = arr(o.diagnoses).map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name)).map(str).filter((x): x is string => !!x);
  const pr = arr(o.procedures)
    .map((x) => (typeof x === "string" ? { name: x } : (x as { name?: string; area?: string; minutes?: unknown })))
    .filter((x) => x && str(x.name))
    .map((x) => ({ name: str(x.name)!, area: str(x.area), minutes: num(x.minutes) }));
  return {
    fixed: str(o.fixed) ?? undefined,
    findings: str(o.findings),
    diagnoses: dx.length ? dx : null,
    procedures: pr.length ? pr : null,
    painAfter: num(o.painAfter),
    skipPain: o.skipPain === true || o.skipPain === "true",
    advice: str(o.advice),
    replace: fields(o.replace),
    unsure: fields(o.unsure),
  };
}

/** วินิจฉัย/หัตถการต้องมีคำในสิ่งที่พูดจริง (กัน AI เดาจากอาการ) */
const core = (n: string) => n.replace(/\s*\(.*\)$/, "").replace(/\s+/g, "");
function saidDx(name: string, text: string) {
  const t = text.replace(/\s+/g, "");
  const c = core(name);
  // ชื่อโรค (หรือต้นชื่อ) ต้องอยู่ในที่พูด หรือพูดคำว่า "วินิจฉัย" เอง · ชื่ออวัยวะอย่างเดียว (บ่า ไหล่) ไม่นับ
  return t.includes(c) || (c.length > 6 && t.includes(c.slice(0, 7))) || /วินิจฉัย|เป็นโรค|เป็นลม/.test(t);
}
const PROC_WORDS = ["นวด", "ประคบ", "อบ", "พอก", "กดจุด", "ฤาษี", "ยืด", "ดัด", "แช่"];
function saidProc(name: string, text: string) {
  const w = PROC_WORDS.find((k) => name.includes(k));
  return !w || text.includes(w);
}
const CORRECT = /เปลี่ยน|แก้เป็น|แก้ไข|ไม่ใช่|ลบ|เอาออก/;

const shortDx = (n: string) => n.replace(/\s*\(.*\)$/, "");
const matchPick = (name: string, list: string[]) => list.find((x) => x === name) ?? list.find((x) => shortDx(x) === shortDx(name)) ?? list.find((x) => name.length > 3 && (x.includes(name) || name.includes(shortDx(x))));

export function QuickRecord({ appt, mode = "panel" }: { appt: Appointment; bare?: boolean; /** bar = แถบเดียวบนฟอร์มบันทึก: พูด/พิมพ์ → กรอกฟอร์มให้เลย ไม่มีแชต */ mode?: "panel" | "bar" }) {
  const bar = mode === "bar";
  /** ผลรอบล่าสุด (โหมดแถบ): กรอกอะไรไปแล้ว */
  const [result, setResult] = useState<{ filled: string[]; heard: string } | null>(null);
  const store = useStore();
  const p = store.patientById(appt.patientId);
  const s = store.serviceById(appt.serviceId);
  const voiceId = store.settings.callVoice ?? DEFAULT_CALL_VOICE;
  const dx = appt.diagnoses ?? [];
  const pr = appt.procedures ?? [];
  const findings = appt.findings ?? "";
  // ปวดหลังนวด · คำแนะนำ อยู่ในฟอร์มบันทึก (ร่างในหน้า) → ส่งค่าไปด้วยอีเวนต์ และฟังค่าที่ฟอร์มถืออยู่
  const [pain, setPain] = useState<number | undefined>(appt.painAfter);
  const [skipPain, setSkipPain] = useState(false);
  const [advice, setAdvice] = useState(appt.advice ?? "");
  const [unsure, setUnsure] = useState<Field[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [rec, setRec] = useState(false);
  const [live, setLive] = useState("");
  const [level, setLevel] = useState(0);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [editing, setEditing] = useState<Field | null>(null);
  /** การ์ดบันทึก: ย่อเป็นแถบสถานะ (ให้พื้นที่กับคำถาม) · แตะเพื่อดู/แก้ทุกช่อง */
  const [cardOpen, setCardOpen] = useState(false);
  /** คำตอบตัวอย่างที่เลือกในการ์ดคำถามข้อปัจจุบัน (แตะเลือกได้หลายคำ แล้วกดส่ง) */
  const [picked, setPicked] = useState<string[]>([]);
  const [editText, setEditText] = useState("");
  const mic = useRef<MicRec | null>(null);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const vm = useRef(voiceMode);
  vm.current = voiceMode;
  const latest = useRef({ findings, dx, pr, pain, skipPain, advice, unsure });
  latest.current = { findings, dx, pr, pain, skipPain, advice, unsure };
  const secure = typeof window === "undefined" || window.isSecureContext;
  /** สิทธิ์ไมโครโฟน (เบราว์เซอร์): denied → บอกวิธีเปิด · ยังไม่ถาม → กดไมค์ครั้งแรกเบราว์เซอร์จะถาม */
  const [micPerm, setMicPerm] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  useEffect(() => {
    let st: PermissionStatus | undefined;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((x) => {
        st = x;
        setMicPerm(x.state as "granted" | "denied" | "prompt");
        x.onchange = () => setMicPerm(x.state as "granted" | "denied" | "prompt");
      })
      .catch(() => setMicPerm("unknown"));
    return () => {
      if (st) st.onchange = null;
    };
  }, []);
  const canRecord = secure && !!navigator.mediaDevices?.getUserMedia;

  const fill = (d: Omit<VoiceFill, "apptId">) => window.dispatchEvent(new CustomEvent<VoiceFill>(VOICE_FILL, { detail: { apptId: appt.id, ...d } }));
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<VoiceFill>).detail;
      if (d.apptId !== appt.id) return;
      setPain(d.painAfter);
      setSkipPain(!!d.skipPain && d.painAfter === undefined);
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

  // ── สถานะแต่ละช่อง ──
  const has = (f: Field, l = latest.current) =>
    f === "finding" ? !!l.findings.trim() : f === "dx" ? l.dx.length > 0 : f === "proc" ? l.pr.length > 0 : f === "pain" ? l.pain !== undefined || l.skipPain : !!l.advice.trim();
  const stateOf = (f: Field) => (!has(f) ? "empty" : unsure.includes(f) ? "check" : "done");
  // ข้ามไว้ → ถามข้อที่ยังไม่ข้ามก่อน แล้วค่อยวนกลับมา
  const skipped = useRef<Set<Field>>(new Set());
  const nextField = (l = latest.current): Field | null =>
    FIELDS.find((f) => has(f.key, l) && l.unsure.includes(f.key))?.key ??
    FIELDS.find((f) => !has(f.key, l) && !skipped.current.has(f.key))?.key ??
    FIELDS.find((f) => !has(f.key, l))?.key ??
    null;
  const doneCount = FIELDS.filter((f) => stateOf(f.key) === "done").length;

  const say = (role: Msg["role"], text: string, extra?: Partial<Msg>) => {
    const m: Msg = { id: ++seq.current, role, text, ...extra };
    msgsRef.current = [...msgsRef.current, m];
    setMsgs((x) => [...x, m]);
    return m;
  };
  const voice = async (text: string) => {
    if (!vm.current) return;
    setSpeaking(true);
    await speak(text.replace(/[“”"•]/g, ""), voiceId);
    setSpeaking(false);
    if (vm.current && !mic.current) void listen();
  };

  // ── บันทึกลงช่อง ──
  const setUns = (f: Field, on: boolean) => {
    const next = on ? [...new Set([...latest.current.unsure, f])] : latest.current.unsure.filter((x) => x !== f);
    latest.current = { ...latest.current, unsure: next };
    setUnsure(next);
  };
  const savePain = (n: number) => {
    setPain(n);
    setSkipPain(false);
    latest.current = { ...latest.current, pain: n, skipPain: false };
    fill({ painAfter: n });
  };
  const savePainSkip = () => {
    setPain(undefined);
    setSkipPain(true);
    latest.current = { ...latest.current, pain: undefined, skipPain: true };
    fill({ skipPain: true });
  };
  const saveAdvice = (t: string) => {
    setAdvice(t);
    latest.current = { ...latest.current, advice: t };
    fill({ advice: t });
  };
  const saveRecord = (patch: { findings?: string; dx?: typeof dx; pr?: typeof pr }, log: string) => {
    const l = latest.current;
    const next = { findings: patch.findings ?? l.findings, dx: patch.dx ?? l.dx, pr: patch.pr ?? l.pr };
    latest.current = { ...l, ...next };
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: { findings: next.findings.trim() || undefined, diagnoses: next.dx, procedures: next.pr }, log });
  };
  const toDx = (names: string[]) => names.map((n, i) => ({ name: n, code: dxCode(n)?.code, kind: (i ? "secondary" : "principal") as "principal" | "secondary" }));
  const toPr = (xs: { name: string; area?: string | null; minutes?: number | null }[]) => xs.map((x, i) => ({ name: x.name, code: procCode(x.name)?.code, area: x.area || undefined, minutes: x.minutes ?? (i === 0 ? s.minutes : undefined) }));

  // ── AI: แยกข้อมูลจากที่พูด (ไม่เดา) ──
  const context = () => {
    const ik = intakeOfVisit(appt, p);
    const l = latest.current;
    return {
      บริการที่นัด: `${s.name} ${s.minutes} นาที`,
      อาการสำคัญ: p.complaint,
      ปวดก่อนนวด: appt.painBefore,
      จุดที่ไม่ให้นวด: ik?.avoidAreas ?? [],
      บันทึกตอนนี้: { ตรวจพบ: l.findings, วินิจฉัย: l.dx.map((d) => d.name), หัตถการ: l.pr.map((x) => [x.name, x.area, x.minutes && `${x.minutes} นาที`].filter(Boolean).join(" ")), ปวดหลังนวด: l.pain ?? null, คำแนะนำ: l.advice },
    };
  };
  const extract = async (text: string, asking: Field | null): Promise<Extract> => {
    try {
      const r = await chatJSON<unknown>(
        `คุณคือผู้ช่วยบันทึกเวชระเบียนแพทย์แผนไทย หน้าที่เดียวคือ "แยกข้อมูล" จากสิ่งที่ผู้บำบัดพูดหรือพิมพ์ ลงช่องบันทึก
กติกาความแม่นยำ (สำคัญที่สุด):
1) ใส่เฉพาะสิ่งที่พูดถึงจริงในข้อความนี้ ห้ามเดา ห้ามเติมจากความรู้ ห้ามสรุปเกินที่พูด · ช่องไหนไม่ได้พูดถึง = null
2) fixed = ข้อความเดิมที่แก้คำผิดจากระบบถอดเสียงตามศัพท์แพทย์แผนไทย (เช่น "เอตา"→"อิทา", "ปัตตคาด"→"ปัตคาด", ตัวเลขที่พูดเป็นคำ→ตัวเลข) โดยไม่เปลี่ยนความหมาย
3) findings = สิ่งที่ตรวจพบ ตามคำที่พูด สั้น กระชับ
4) diagnoses = ชื่อจากรายการนี้เมื่อความหมายตรงกัน ${JSON.stringify(DX_PICK)} ถ้าไม่ตรงรายการให้ใส่ตามที่พูด
5) procedures = [{"name": ชื่อจากรายการนี้ ${JSON.stringify(PROC_PICK)}, "area": ตำแหน่ง/เส้นที่พูดถึง หรือ null, "minutes": นาทีที่พูดถึง หรือ null}]
6) painAfter = ตัวเลข 0–10 เฉพาะเมื่อพูดถึงความปวด "หลังนวด / ตอนนี้ / เหลือ" ชัดเจน · ปวดก่อนนวดไม่ใช่ painAfter · skipPain = true ถ้าบอกว่าผู้ป่วยไม่ประเมิน/ข้าม
7) advice = คำแนะนำถึงผู้ป่วยที่พูดถึง (ข้อความตามที่พูด)
8) replace = ช่องที่เป็นการสั่งแก้/เปลี่ยน ("ไม่ใช่…", "เปลี่ยนเป็น…", "แก้…", "ลบ…") ใช้ชื่อช่อง finding|dx|proc|pain|advice
9) unsure = ช่องที่ได้ยินไม่ชัด กำกวม หรือตีความได้หลายแบบ
ถ้ากำลังถามช่องใดอยู่ (ช่องที่ถาม) และคำตอบสั้น ให้ตีความเป็นคำตอบของช่องนั้น
ตอบ JSON เท่านั้น: {"fixed":"","findings":null,"diagnoses":null,"procedures":null,"painAfter":null,"skipPain":false,"advice":null,"replace":[],"unsure":[]}
${THAI_MASSAGE_KNOWLEDGE}`,
        JSON.stringify({ สิ่งที่พูด: text, ช่องที่ถาม: asking ? LABEL[asking] : null, ...context() }),
      );
      return normalize(r);
    } catch {
      // ออฟไลน์: กฎคำไทยง่าย ๆ · ทุกช่องที่ได้ถือว่าให้ยืนยัน
      const x = parseLocal(text, s.name);
      const out: Extract = { diagnoses: x.diagnoses.length ? x.diagnoses : null, procedures: x.procedures.length ? x.procedures : null, painAfter: x.painAfter, advice: x.advice || null, unsure: [] };
      if (asking === "finding" && !out.diagnoses && !out.procedures) out.findings = text;
      if (asking === "advice" && !out.advice) out.advice = text;
      out.unsure = (["dx", "proc", "pain"] as Field[]).filter((f) => (f === "dx" ? out.diagnoses : f === "proc" ? out.procedures : out.painAfter != null));
      return out;
    }
  };

  /** รวมผล AI เข้าบันทึก · คืนรายการที่เติม */
  const apply = (x: Extract, raw: string, asking: Field | null) => {
    const l = latest.current;
    const rep = new Set(x.replace ?? []);
    const uns = new Set<Field>((x.unsure ?? []).filter((f) => FIELDS.some((y) => y.key === f)));
    const filled: string[] = [];
    let nf = l.findings;
    let ndx = l.dx;
    let npr = l.pr;
    if (x.findings?.trim()) {
      const t = x.findings.trim();
      nf = rep.has("finding") || !l.findings.trim() ? t : l.findings.includes(t) ? l.findings : `${l.findings.trim()} · ${t}`;
      filled.push(`ตรวจพบ ${t}`);
    }
    if (x.diagnoses?.length) {
      const names = x.diagnoses.map((n) => matchPick(n, DX_PICK) ?? n);
      // ชื่อที่ไม่อยู่ในรายการของคลินิก → ให้ยืนยัน
      if (names.some((n) => !DX_PICK.includes(n))) uns.add("dx");
      const merged = rep.has("dx") ? names : [...l.dx.map((d) => d.name), ...names.filter((n) => !l.dx.some((d) => d.name === n))];
      ndx = toDx(merged);
      filled.push(`วินิจฉัย ${names.map(shortDx).join(", ")}`);
    }
    if (x.procedures?.length) {
      const items = x.procedures.filter((q) => q?.name).map((q) => ({ ...q, name: matchPick(q.name, PROC_PICK) ?? q.name }));
      if (items.some((q) => !PROC_PICK.includes(q.name))) uns.add("proc");
      const merged = rep.has("proc") ? items : [...l.pr, ...items.filter((q) => !l.pr.some((y) => y.name === q.name))];
      npr = toPr(merged);
      filled.push(`หัตถการ ${items.map((q) => [q.name, q.area, q.minutes && `${q.minutes} นาที`].filter(Boolean).join(" ")).join(", ")}`);
    }
    if (nf !== l.findings || ndx !== l.dx || npr !== l.pr) saveRecord({ findings: nf, dx: ndx, pr: npr }, "ผู้ช่วย AI เติมบันทึกการรักษา");
    if (x.skipPain) {
      savePainSkip();
      filled.push("ไม่ประเมินปวดหลังนวด");
    } else if (typeof x.painAfter === "number" && Number.isFinite(x.painAfter)) {
      const n = Math.round(x.painAfter);
      if (n >= 0 && n <= 10) {
        // ตรวจซ้ำด้วยกฎคำไทย: เลขไม่ตรงกัน / ตอบช่องอื่นอยู่ → ให้ยืนยัน
        const local = parseLocal(raw, s.name).painAfter;
        if ((local != null && local !== n) || (asking && asking !== "pain" && !/หลัง|เหลือ|ตอนนี้/.test(raw))) uns.add("pain");
        savePain(n);
        filled.push(`ปวดหลังนวด ${n}/10`);
      }
    }
    if (x.advice?.trim()) {
      const t = x.advice.trim();
      saveAdvice(rep.has("advice") || !l.advice.trim() ? t : `${l.advice.trim()}\n${t}`);
      filled.push("คำแนะนำ");
    }
    // ช่องที่เติมรอบนี้และมั่นใจ → ไม่ต้องยืนยันแล้ว
    for (const f of FIELDS.map((y) => y.key)) {
      const touched = f === "finding" ? !!x.findings : f === "dx" ? !!x.diagnoses?.length : f === "proc" ? !!x.procedures?.length : f === "pain" ? x.painAfter != null || !!x.skipPain : !!x.advice;
      if (touched) setUns(f, uns.has(f));
    }
    return filled;
  };

  // ── คำแนะนำ AI: วินิจฉัย/หัตถการ/คำแนะนำ (ให้แตะเลือก ไม่ใส่เอง) ──
  const suggest = async (f: "dx" | "proc"): Promise<{ name: string; area?: string; minutes?: number | null }[]> => {
    try {
      const r = await chatJSON<{ items: { name: string; area?: string; minutes?: number | null }[] }>(
        f === "dx"
          ? `คุณเป็นแพทย์แผนไทย เสนอการวินิจฉัยที่น่าจะเป็น 1–3 ข้อ จากสิ่งที่ตรวจพบวันนี้เป็นหลัก ใช้ชื่อจากรายการนี้เท่านั้น ${JSON.stringify(DX_PICK)} ตอบ JSON {"items":[{"name":""}]}`
          : `คุณเป็นแพทย์แผนไทย เสนอหัตถการ 1–2 ข้อ ใช้ชื่อจากรายการนี้เท่านั้น ${JSON.stringify(PROC_PICK)} พร้อม area สั้น ๆ และ minutes (รวมไม่เกินเวลาบริการ) ห้ามเสนอตำแหน่งที่ไม่ให้นวด ตอบ JSON {"items":[{"name":"","area":"","minutes":0}]}`,
        JSON.stringify(context()),
      );
      const pick = f === "dx" ? DX_PICK : PROC_PICK;
      return (r.items ?? []).filter((x) => x?.name && pick.includes(matchPick(x.name, pick) ?? "")).map((x) => ({ ...x, name: matchPick(x.name, pick)! })).slice(0, 3);
    } catch {
      return f === "dx" ? parseLocal(`${latest.current.findings} ${p.complaint}`, s.name).diagnoses.map((name) => ({ name })) : [{ name: s.name, minutes: s.minutes }];
    }
  };
  const draftAdvice = async () => {
    const l = latest.current;
    const sm = samuthan(p, { time: appt.start });
    try {
      const r = await chatJSON<{ advice: string }>(
        `คุณเป็นแพทย์แผนไทย เขียน "คำแนะนำถึงผู้ป่วย" หลังรับบริการ ภาษาไทยสุภาพ 2–4 ข้อสั้น ๆ ขึ้นบรรทัดใหม่ทีละข้อ ขึ้นต้นด้วย "• " ให้สอดคล้องกับสิ่งที่ตรวจพบ วินิจฉัย และหัตถการวันนี้ ตอบ JSON {"advice":"..."}\n${THAI_MASSAGE_KNOWLEDGE}`,
        JSON.stringify({ ...context(), ธาตุที่เสี่ยง: sm.top, แนวทางตามธาตุ: sm.plan, ปวดก่อนหลัง: `${appt.painBefore} → ${l.pain ?? "?"}` }),
      );
      return r.advice?.trim() || "";
    } catch {
      return "• ประคบอุ่นบริเวณที่ปวดวันละ 15–20 นาที\n• ยืดเหยียดเบา ๆ ไม่ยกของหนัก\n• ถ้าปวดมากขึ้นหรือชา ให้กลับมาพบ";
    }
  };

  /** ตัวเลือกหัตถการ: ตามแผนการรักษา · บริการของนัดนี้ · ครั้งก่อน · AI แนะนำ (ไม่ซ้ำ ชื่อตามรายการของคลินิก) */
  const procOptions = async (): Promise<NonNullable<Msg["opts"]>> => {
    const out: NonNullable<Msg["opts"]> = [];
    const add = (name: string | undefined, src: string, area?: string | null, minutes?: number | null) => {
      const n = name ? (matchPick(name, PROC_PICK) ?? name) : "";
      if (!n || out.some((x) => x.name === n)) return;
      out.push({ name: n, area: area || null, minutes: minutes ?? null, src });
    };
    const extrasOf = (text: string) => PROC_PICK.filter((x) => x !== s.name && !x.startsWith("นวด") && PROC_WORDS.some((w) => x.includes(w) && text.includes(w)));
    // 1) แผนการรักษา (ระยะของแผน: บริการ · จุดที่เน้น · เทคนิค)
    for (const ph of p.aiPlan?.phases ?? []) {
      const svc = store.serviceById(ph.serviceId);
      add(svc.name.replace(/ร่วมประคบสมุนไพร$/, ""), "ตามแผน", ph.focus, svc.minutes);
      for (const x of extrasOf(`${svc.name} ${ph.technique}`)) add(x, "ตามแผน", ph.focus);
    }
    // 2) บริการของนัดนี้
    add(s.name.replace(/ร่วมประคบสมุนไพร$/, ""), "นัดนี้", intakeOfVisit(appt, p)?.focusAreas?.join(" ") || null, s.minutes);
    for (const x of extrasOf(s.name)) add(x, "นัดนี้");
    // 3) ครั้งก่อน
    const prev = store.appointments
      .filter((a) => a.patientId === p.id && a.id !== appt.id && a.status === "done" && a.procedures?.length)
      .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0];
    for (const x of prev?.procedures ?? []) add(x.name, "ครั้งก่อน", x.area, x.minutes);
    // 4) AI แนะนำ
    for (const x of await suggest("proc")) add(x.name, "AI แนะนำ", x.area, x.minutes);
    // 5) ยังน้อย → เติมหัตถการที่คลินิกใช้บ่อย
    for (const x of PROC_PICK) {
      if (out.length >= 5) break;
      add(x, "ใช้บ่อย");
    }
    return out.slice(0, 7);
  };

  // ── ถามช่องถัดไป (ข้อความตายตัว แม่นและสั้น) ──
  const askField = async (f: Field, prefix = "") => {
    const l = latest.current;
    if (prefix.trim()) say("ai", prefix.trim(), { note: true });
    prefix = "";
    if (has(f, l) && l.unsure.includes(f)) {
      const v =
        f === "pain"
          ? `${l.pain}/10`
          : f === "dx"
            ? l.dx.map((d) => shortDx(d.name)).join(", ")
            : f === "proc"
              ? l.pr.map((x) => [x.name, x.area].filter(Boolean).join(" ")).join(", ")
              : f === "finding"
                ? l.findings
                : "คำแนะนำที่ร่างไว้";
      const q = `${prefix}ขอยืนยัน${LABEL[f]}: “${v}” ถูกไหมคะ`;
      say("ai", q, { field: f, chips: [{ label: "ถูกต้อง", tone: "primary", run: () => confirmField(f) }, { label: "แก้", run: () => openEdit(f) }] });
      void voice(q);
      return;
    }
    const base = FIELDS.find((x) => x.key === f)!.ask;
    let chips: Chip[] = [];
    let opts: Msg["opts"];
    if (f === "pain") {
      chips = [...Array.from({ length: 11 }, (_, n) => ({ label: String(n), cls: n >= 7 ? "is-hi" : n >= 4 ? "is-mid" : "is-lo", run: () => void onUser(`ปวดหลังนวด ${n}`) }))];
    } else if (f === "dx") {
      setThinking(true);
      const items = await suggest(f);
      setThinking(false);
      chips = items.map((x) => ({
        label: shortDx(x.name),
        run: () => {
          saveRecord({ dx: toDx([...latest.current.dx.map((d) => d.name), x.name]) }, `เลือกวินิจฉัย: ${x.name}`);
          setUns(f, false);
          say("me", shortDx(x.name));
          void next("บันทึกแล้วค่ะ ");
        },
      }));
    } else if (f === "proc") {
      setThinking(true);
      opts = await procOptions();
      setThinking(false);
    } else if (f === "advice") {
      chips = [
        {
          label: "ให้ AI ร่าง",
          tone: "primary",
          run: async () => {
            say("me", "ให้ AI ร่างคำแนะนำ");
            setThinking(true);
            const a = await draftAdvice();
            setThinking(false);
            if (a) saveAdvice(a);
            void next("ร่างคำแนะนำให้แล้วค่ะ แก้ได้ที่การ์ดด้านบน ");
          },
        },
        { label: "ไม่มีคำแนะนำ", tone: "ghost", run: () => (saveAdvice("-"), say("me", "ไม่มีคำแนะนำ"), void next()) },
      ];
    }
    const ik = intakeOfVisit(appt, p);
    const areas = (ik?.focusAreas ?? []).slice(0, 3);
    const taps =
      f === "finding"
        ? [...areas.flatMap((a) => [`${a}ตึง`, `${a}กดเจ็บ`]), "ขยับได้น้อย", "ชา", "บวม"].slice(0, 7)
        : f === "advice"
          ? ["ประคบอุ่นวันละ 15 นาที", "ท่าฤาษีดัดตนวันละ 2 รอบ", "เลี่ยงยกของหนัก", "กลับมาพบถ้าปวดมากขึ้น"]
          : undefined;
    const q = base;
    setPicked([]);
    say("ai", q, { field: f, chips, q: true, hint: HINT[f], taps, opts });
    void voice(q);
  };
  const skipField = (f: Field) => {
    skipped.current.add(f);
    say("me", `ข้าม${LABEL[f]}`);
    void next();
  };
  const next = async (prefix = "") => {
    const f = nextField();
    if (f) return askField(f, prefix);
    if (prefix.trim()) say("ai", prefix.trim(), { note: true });
    const q = `ครบทั้ง 5 ช่องแล้วค่ะ ตรวจการ์ดด้านบนแล้วกดบันทึกได้เลย`;
    say("ai", q, { chips: [{ label: "บันทึกการรักษา", tone: "primary", run: () => window.dispatchEvent(new CustomEvent<VoiceFill>(RECORD_SAVE, { detail: { apptId: appt.id } })) }] });
    void voice(q);
  };
  const confirmField = (f: Field) => {
    setUns(f, false);
    say("me", "ถูกต้อง");
    void next();
  };

  /** ผู้ใช้พูด/พิมพ์ 1 ครั้ง */
  const onUser = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    stopSpeaking();
    const me = say("me", t);
    const asking = [...msgsRef.current].reverse().find((m) => m.role === "ai")?.field ?? null;
    // ตอบยืนยันสั้น ๆ
    if (asking && latest.current.unsure.includes(asking) && /^(ใช่|ถูก|โอเค|ok|ตามนั้น|ครับ|ค่ะ)/i.test(t)) return confirmField(asking);
    setThinking(true);
    const x = await extract(t, asking);
    setThinking(false);
    const said = `${t} ${x.fixed ?? ""}`;
    // ความแม่น: ตัดสิ่งที่ไม่ได้พูดถึงจริงออก
    if (x.diagnoses) x.diagnoses = x.diagnoses.filter((n) => saidDx(matchPick(n, DX_PICK) ?? n, said)) || null;
    if (x.procedures) x.procedures = x.procedures.filter((q) => saidProc(q.name, said));
    // คำสั่งแก้ ("เปลี่ยนวินิจฉัยเป็น…") → แทนที่ของเดิม · AI ไม่ได้แยกมา → ใช้กฎคำไทยช่วย
    if (CORRECT.test(t)) {
      const local = parseLocal(t, s.name);
      const rep = new Set(x.replace ?? []);
      if (/วินิจฉัย/.test(t)) {
        rep.add("dx");
        if (!x.diagnoses?.length && local.diagnoses.length) x.diagnoses = local.diagnoses;
      }
      if (/หัตถการ|นวด|ประคบ/.test(t) && !/วินิจฉัย/.test(t)) {
        rep.add("proc");
        if (!x.procedures?.length && local.procedures.length) x.procedures = local.procedures;
      }
      if (/ปวด/.test(t) && x.painAfter != null) rep.add("pain");
      if (/แนะนำ/.test(t)) rep.add("advice");
      if (/ตรวจ/.test(t)) rep.add("finding");
      x.replace = [...rep];
    }
    if (x.fixed && x.fixed.trim() && x.fixed.trim() !== t) setMsgs((ms) => ms.map((m) => (m.id === me.id ? { ...m, text: x.fixed!.trim() } : m)));
    const filled = apply(x, x.fixed || t, asking);
    if (bar) {
      setResult({ filled, heard: (x.fixed || t).trim() });
      return;
    }
    if (!filled.length) {
      const q = asking ? `ยังไม่ได้ยินเรื่อง${LABEL[asking]}ค่ะ ` : "ยังไม่พบข้อมูลที่ใช้บันทึกได้ค่ะ ";
      return next(q);
    }
    void next(`บันทึกแล้ว: ${filled.join(" · ")}\n`);
  };

  // ── แก้ในการ์ด ──
  const openEdit = (f: Field) => {
    const l = latest.current;
    setCardOpen(true);
    setEditing(f);
    setEditText(f === "finding" ? l.findings : f === "advice" ? (l.advice === "-" ? "" : l.advice) : f === "dx" ? l.dx.map((d) => d.name).join("\n") : f === "proc" ? l.pr.map((x) => [x.name, x.area, x.minutes && `${x.minutes} นาที`].filter(Boolean).join(" ")).join("\n") : String(l.pain ?? ""));
  };
  const commitEdit = async () => {
    const f = editing;
    if (!f) return;
    setEditing(null);
    const t = editText.trim();
    if (f === "finding") saveRecord({ findings: t }, "แก้อาการที่ตรวจพบ");
    else if (f === "advice") saveAdvice(t);
    else if (f === "pain") {
      const n = Number(t);
      if (t && Number.isFinite(n) && n >= 0 && n <= 10) savePain(Math.round(n));
    } else {
      // วินิจฉัย/หัตถการ: แยกบรรทัด → ชื่อตามรายการ (ไม่ตรงรายการเก็บตามที่พิมพ์)
      const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      if (f === "dx") saveRecord({ dx: toDx(lines.map((n) => matchPick(n, DX_PICK) ?? n)) }, "แก้วินิจฉัย");
      else
        saveRecord(
          {
            pr: toPr(
              lines.map((ln) => {
                const name = PROC_PICK.find((x) => ln.startsWith(x)) ?? matchPick(ln.split(" ")[0], PROC_PICK) ?? ln;
                const rest = ln.slice(name.length).trim();
                const minutes = Number(/(\d+)\s*นาที/.exec(rest)?.[1]) || null;
                return { name, area: rest.replace(/\d+\s*นาที/, "").trim() || null, minutes };
              }),
            ),
          },
          "แก้หัตถการ",
        );
    }
    setUns(f, false);
  };
  const removeDx = (name: string) => saveRecord({ dx: toDx(latest.current.dx.filter((d) => d.name !== name).map((d) => d.name)) }, `ลบวินิจฉัย: ${name}`);
  const removePr = (name: string) => saveRecord({ pr: latest.current.pr.filter((x) => x.name !== name) }, `ลบหัตถการ: ${name}`);

  // ── เสียง ──
  const quiet = useRef({ heard: false, since: 0, liveAt: 0, peeking: false });
  const listen = async () => {
    if (!canRecord || mic.current) return;
    unlockAudio();
    stopSpeaking();
    setSpeaking(false);
    quiet.current = { heard: false, since: 0, liveAt: Date.now(), peeking: false };
    try {
      const started = Date.now();
      let sum = 0;
      let n = 0;
      let thr = 0.3;
      mic.current = await startMic((v) => {
        setLevel(v);
        const now = Date.now();
        if (now - started < 600) {
          sum += v;
          n++;
          thr = Math.max(0.16, Math.min(0.5, (sum / n) * 2.2 + 0.06));
          return;
        }
        // โหมดคุยด้วยเสียง: เงียบไปพักหนึ่ง = พูดจบ ส่งเอง
        if (v > thr) {
          quiet.current.heard = true;
          quiet.current.since = 0;
        } else if (quiet.current.heard && vm.current) {
          quiet.current.since ||= now;
          if (now - quiet.current.since > 1600) void finish();
        }
      });
      setLive("");
      setRec(true);
    } catch (e) {
      setRec(false);
      const denied = (e as { name?: string })?.name === "NotAllowedError";
      if (denied) setMicPerm("denied");
      say("ai", denied ? "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟนค่ะ เปิดสิทธิ์ไมค์แล้วลองใหม่ หรือพิมพ์แทนได้" : "เปิดไมโครโฟนไม่ได้ค่ะ ลองใหม่ หรือพิมพ์แทนได้");
    }
  };
  useEffect(() => {
    if (!rec) return;
    const t = window.setInterval(async () => {
      const m = mic.current;
      if (!m || quiet.current.peeking) return;
      quiet.current.peeking = true;
      try {
        const { wav, seconds } = await m.peek(30);
        if (seconds > 0.8 && mic.current === m) {
          const txt = await transcribe(wav);
          if (mic.current === m && txt) setLive(txt);
        }
      } catch {
        /* keep last */
      } finally {
        quiet.current.peeking = false;
      }
    }, 1200);
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
    setThinking(true);
    try {
      const heard = await transcribe(wav);
      setThinking(false);
      setLive("");
      if (heard) await onUser(heard);
      else if (vm.current) void listen();
    } catch {
      setThinking(false);
      setLive("");
      say("ai", "ถอดเสียงไม่สำเร็จค่ะ ลองพูดอีกครั้ง หรือพิมพ์แทน");
    }
  };
  const cancelRec = () => {
    mic.current?.cancel();
    mic.current = null;
    setRec(false);
    setLive("");
    setLevel(0);
  };
  const onFile = async (f: File) => {
    say("me", `ไฟล์เสียง ${f.name}`);
    setThinking(true);
    try {
      const { wav } = await fileToWav(f);
      const heard = await transcribe(wav);
      setThinking(false);
      if (heard) await onUser(heard);
      else say("ai", "ไม่ได้ยินเสียงพูดในไฟล์ค่ะ");
    } catch {
      setThinking(false);
      say("ai", "อ่านไฟล์เสียงไม่สำเร็จค่ะ");
    }
  };
  const toggleVoice = () => {
    const on = !voiceMode;
    setVoiceMode(on);
    vm.current = on;
    if (on) {
      unlockAudio();
      const f = nextField();
      if (f) void askField(f);
      else void listen();
    } else {
      stopSpeaking();
      setSpeaking(false);
      cancelRec();
    }
  };

  // เปิดมา: ทักครั้งเดียว บอกว่าพูดรวดเดียวได้
  useEffect(() => {
    if (msgs.length || bar) return;
    say("ai", `ตอบทีละข้อ หรือเล่ารวดเดียวก็ได้ค่ะ เช่น “บ่าขวาตึง กดเจ็บ ลมปลายปัตคาด นวดรักษา 45 นาที หลังนวดเหลือ 3” ระบบแยกใส่ให้ครบ`, { note: true });
    const f = nextField();
    if (f) void askField(f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── การ์ดบันทึก ──
  const value = (f: Field) => {
    if (f === "finding") return findings || null;
    if (f === "dx")
      return dx.length ? (
        <span className="qr-tags">
          {dx.map((d) => (
            <em key={d.name}>
              {shortDx(d.name)}
              <button type="button" aria-label={`ลบ ${d.name}`} onClick={() => removeDx(d.name)}>
                <X size={11} />
              </button>
            </em>
          ))}
        </span>
      ) : null;
    if (f === "proc")
      return pr.length ? (
        <span className="qr-tags">
          {pr.map((x) => (
            <em key={x.name}>
              {[x.name, x.area, x.minutes && `${x.minutes} นาที`].filter(Boolean).join(" · ")}
              <button type="button" aria-label={`ลบ ${x.name}`} onClick={() => removePr(x.name)}>
                <X size={11} />
              </button>
            </em>
          ))}
        </span>
      ) : null;
    if (f === "pain") return skipPain ? "ให้ผู้ป่วยประเมินในแอป" : pain !== undefined ? <b className="qr-pain">{appt.painBefore} → {pain}<small>/10</small></b> : null;
    return advice && advice !== "-" ? <span className="qr-adv">{advice}</span> : advice === "-" ? "ไม่มี" : null;
  };

  if (bar) {
    const missing = FIELDS.filter((f) => stateOf(f.key) === "empty");
    const check = FIELDS.filter((f) => stateOf(f.key) === "check");
    const goTo = (label: string) => {
      const key = label === "ปวดหลังนวด" ? "ความปวดหลังนวด" : label === "ตรวจพบ" ? "ตรวจร่างกาย" : label;
      const el = [...document.querySelectorAll<HTMLElement>(".rs-stack h3, .rs-stack h4, .rs-stack b, .rs-stack strong")].find((e) => e.textContent?.trim().startsWith(key));
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    return (
      <section className={clsx("qrb", rec && "is-rec", thinking && "is-busy")} aria-label="ผู้ช่วยบันทึกการรักษา">
        {rec ? (
          <div className="qrb__live">
            <div className="qrb__wave">
              <VoiceWave level={level} height={44} />
            </div>
            <p>{live || "กำลังฟัง… พูดสรุปการรักษาได้เลย"}</p>
            <div className="qrb__acts">
              <button type="button" className="qrb__cancel" onClick={cancelRec}>
                ยกเลิก
              </button>
              <button type="button" className="qrb__stop" onClick={() => void finish()}>
                <Square size={14} fill="currentColor" /> หยุด แล้วกรอกให้
              </button>
            </div>
          </div>
        ) : thinking ? (
          <div className="qrb__busy">
            <span className="qrb__spin" />
            <p>AI กำลังกรอกฟอร์มให้…</p>
          </div>
        ) : (
          <>
            <div className="qrb__main">
              <button type="button" className="qrb__mic" disabled={!canRecord} onClick={() => void listen()} title={canRecord ? undefined : "ต้องเปิดผ่าน https จึงใช้ไมค์ได้"}>
                <Mic size={22} />
              </button>
              <div className="qrb__text">
                <b>{result ? "พูดเพิ่ม หรือแก้ได้" : "แตะไมค์ แล้วเล่าการรักษา"}</b>
                <small>เช่น “บ่าขวาตึง กดเจ็บ ลมปลายปัตคาด นวดรักษา 45 นาที หลังนวดเหลือ 3” · AI กรอกฟอร์มด้านล่างให้</small>
              </div>
              <button type="button" className="qrb__ic" onClick={() => fileIn.current?.click()} aria-label="แนบไฟล์เสียง" title="แนบไฟล์เสียง">
                <FileAudio size={18} />
              </button>
              <input ref={fileIn} type="file" accept="audio/*" hidden aria-label="ไฟล์เสียงสรุปการรักษา" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
            </div>
            <div className="qrb__type">
              <input
                aria-label="สรุปการรักษา"
                value={draft}
                placeholder="หรือพิมพ์สรุปที่นี่ แล้วกด Enter"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    const t = draft;
                    setDraft("");
                    void onUser(t);
                  }
                }}
              />
              {draft.trim() && (
                <button
                  type="button"
                  aria-label="ส่งข้อความ"
                  onClick={() => {
                    const t = draft;
                    setDraft("");
                    void onUser(t);
                  }}
                >
                  <Send size={15} />
                </button>
              )}
            </div>
            {(!secure || micPerm === "denied") && (
              <p className="qrb__perm">
                {!secure
                  ? "ไมโครโฟนใช้ได้เฉพาะหน้าเว็บที่เป็น https · พิมพ์สรุปแทนได้"
                  : "ไมโครโฟนถูกปิดในเบราว์เซอร์ · กดไอคอนแม่กุญแจหน้าที่อยู่เว็บ → ไมโครโฟน → อนุญาต แล้วกดไมค์อีกครั้ง"}
              </p>
            )}
            {micPerm === "prompt" && !result && <p className="qrb__perm is-info">กดไมค์ครั้งแรก เบราว์เซอร์จะถามขอใช้ไมโครโฟน ให้กด “อนุญาต”</p>}
            {result && (
              <div className="qrb__res">
                {result.filled.length ? (
                  <p className="is-ok">
                    <Check size={14} strokeWidth={3} /> กรอกแล้ว: {result.filled.map((x) => x.split(" ")[0]).join(" · ")}
                  </p>
                ) : (
                  <p className="is-none">ไม่พบข้อมูลที่ใช้กรอกได้ ลองพูดใหม่อีกครั้ง</p>
                )}
                {check.length > 0 && (
                  <p className="is-check">
                    <CircleHelp size={14} /> ตรวจดูอีกที:
                    {check.map((f) => (
                      <button key={f.key} type="button" onClick={() => (setUns(f.key, false), goTo(f.label))}>
                        {f.label}
                      </button>
                    ))}
                  </p>
                )}
                {missing.length > 0 && (
                  <p className="is-miss">
                    ยังขาด:
                    {missing.map((f) => (
                      <button key={f.key} type="button" onClick={() => goTo(f.label)}>
                        {f.label}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="qr" aria-label="ผู้ช่วยบันทึกการรักษา">
      {/* การ์ดบันทึก 5 ช่อง */}
      <div className="qr-card">
        <button type="button" className="qr-card__head" aria-expanded={cardOpen} onClick={() => setCardOpen((v) => !v)}>
          <b>
            <Sparkles size={14} /> บันทึกการรักษา
          </b>
          <span className="qr-prog">
            <i style={{ width: `${(doneCount / FIELDS.length) * 100}%` }} />
          </span>
          <small>
            {doneCount}/{FIELDS.length}
          </small>
          <span className="qr-card__toggle">{cardOpen ? "ย่อ" : "ดู/แก้"}</span>
        </button>
        {!cardOpen && (
          <div className="qr-pills">
            {FIELDS.map((f) => {
              const st = stateOf(f.key);
              return (
                <button key={f.key} type="button" className={`is-${st}`} onClick={() => setCardOpen(true)}>
                  {st === "done" ? <Check size={11} strokeWidth={3} /> : st === "check" ? <CircleHelp size={11} /> : <i />}
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
        {cardOpen && (
        <ol className="qr-rows">
          {FIELDS.map((f) => {
            const st = stateOf(f.key);
            const v = value(f.key);
            return (
              <li key={f.key} className={clsx("qr-row", `is-${st}`)}>
                <span className="qr-dot">{st === "done" ? <Check size={11} strokeWidth={3} /> : st === "check" ? <CircleHelp size={12} /> : null}</span>
                <span className="qr-k">{f.label}</span>
                <div className="qr-v">
                  {editing === f.key ? (
                    <div className="qr-edit">
                      {f.key === "pain" ? (
                        <span className="qr-scale">
                          {Array.from({ length: 11 }, (_, n) => (
                            <button key={n} type="button" aria-pressed={editText === String(n)} onClick={() => setEditText(String(n))}>
                              {n}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <textarea autoFocus rows={f.key === "advice" ? 4 : 2} value={editText} onChange={(e) => setEditText(e.target.value)} placeholder={f.key === "dx" || f.key === "proc" ? "บรรทัดละ 1 รายการ" : ""} />
                      )}
                      <span className="qr-edit__acts">
                        <button type="button" onClick={() => setEditing(null)}>
                          ยกเลิก
                        </button>
                        <button type="button" className="is-primary" onClick={() => void commitEdit()}>
                          ตกลง
                        </button>
                      </span>
                    </div>
                  ) : v ? (
                    v
                  ) : (
                    <span className="qr-empty">ยังไม่มี</span>
                  )}
                </div>
                {editing !== f.key && (
                  <span className="qr-acts">
                    {st === "check" && (
                      <button type="button" className="is-ok" onClick={() => confirmField(f.key)} aria-label={`ยืนยัน${f.label}`}>
                        <Check size={13} />
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit(f.key)} aria-label={`แก้${f.label}`}>
                      <Pencil size={13} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        )}
      </div>

      {/* แชต */}
      <div className="qr-chat scroll-y scroll-y--light" ref={list}>
        {msgs.map((m) => (
          <div key={m.id} className={clsx("qr-msg", m.role === "ai" ? "is-ai" : "is-me", m.q && "is-card", m.note && "is-note")}>
            {m.role === "ai" && !m.q && !m.note && (
              <span className="qr-av">
                <Sparkles size={12} />
              </span>
            )}
            {m.q && m.field ? (
              (() => {
                const f = m.field;
                const Ic = ICON[f];
                const n = FIELDS.findIndex((x) => x.key === f) + 1;
                const live = m === msgs.filter((x) => x.role === "ai").slice(-1)[0];
                return (
                  <div className={clsx("qr-q", !live && "is-past")}>
                    <div className="qr-q__head">
                      <span className="qr-q__ic">
                        <Ic size={16} />
                      </span>
                      <span className="qr-q__t">
                        <small>
                          ข้อ {n}/{FIELDS.length}
                        </small>
                        <b>{LABEL[f]}</b>
                      </span>
                      <span className="qr-q__dots" aria-hidden>
                        {FIELDS.map((x) => (
                          <i key={x.key} className={clsx(stateOf(x.key) !== "empty" && "is-done", x.key === f && "is-now")} />
                        ))}
                      </span>
                    </div>
                    <p className="qr-q__text">{m.text}</p>
                    {live && (
                      <>
                        {m.hint && <small className="qr-q__hint">{m.hint}</small>}
                        {m.chips && m.chips.length > 0 && (
                          <div className={clsx("qr-chips", f === "pain" && "is-scale")}>
                            {m.chips.map((c) => (
                              <button key={c.label} type="button" className={clsx(c.tone && `is-${c.tone}`, c.cls)} disabled={thinking} onClick={c.run}>
                                {c.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {m.opts && m.opts.length > 0 && (
                          <div className="qr-q__opts">
                            {m.opts.map((o) => {
                              const on = picked.includes(o.name);
                              return (
                                <button key={o.name} type="button" className={on ? "is-on" : undefined} aria-pressed={on} onClick={() => setPicked((x) => (on ? x.filter((y) => y !== o.name) : [...x, o.name]))}>
                                  <i>{on ? <Check size={12} strokeWidth={3} /> : null}</i>
                                  <span>
                                    <b>{o.name}</b>
                                    {(o.area || o.minutes) && <small>{[o.area, o.minutes && `${o.minutes} นาที`].filter(Boolean).join(" · ")}</small>}
                                  </span>
                                  <em>{o.src}</em>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {m.taps && (
                          <div className="qr-q__taps">
                            {m.taps.map((t) => {
                              const on = picked.includes(t);
                              return (
                                <button key={t} type="button" className={on ? "is-on" : undefined} aria-pressed={on} onClick={() => setPicked((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}>
                                  {on ? <Check size={13} strokeWidth={3} /> : "+"} {t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="qr-q__foot">
                          {picked.length ? (
                            <button
                              type="button"
                              className="qr-q__send"
                              disabled={thinking}
                              onClick={() => {
                                if (m.opts) {
                                  const sel = m.opts.filter((o) => picked.includes(o.name));
                                  setPicked([]);
                                  saveRecord({ pr: toPr([...latest.current.pr, ...sel.filter((o) => !latest.current.pr.some((y) => y.name === o.name))]) }, `เลือกหัตถการ: ${sel.map((o) => o.name).join(", ")}`);
                                  setUns("proc", false);
                                  say("me", sel.map((o) => o.name).join(" · "));
                                  void next("บันทึกแล้วค่ะ ");
                                  return;
                                }
                                const t = picked.join(" ");
                                setPicked([]);
                                void onUser(f === "advice" ? `แนะนำ ${t}` : t);
                              }}
                            >
                              <Send size={14} /> ส่ง {picked.length} ข้อ
                            </button>
                          ) : (
                            f === "pain" ? (
                              // ข้ามข้อนี้ = ผู้ป่วยประเมินปวดหลังนวดเองในแอปทีหลัง (นับว่าตอบแล้ว ไม่ถามซ้ำ)
                              <button
                                type="button"
                                className="qr-q__skip"
                                disabled={thinking}
                                onClick={() => {
                                  savePainSkip();
                                  setUns("pain", false);
                                  say("me", "ให้ผู้ป่วยประเมินในแอป");
                                  void next();
                                }}
                              >
                                ให้ผู้ป่วยประเมินในแอป <SkipForward size={14} />
                              </button>
                            ) : (
                              <button type="button" className="qr-q__skip" disabled={thinking} onClick={() => skipField(f)}>
                                ข้ามไปก่อน <SkipForward size={14} />
                              </button>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className={clsx("qr-bub", m.note && "is-note")}>
                {m.note && <CircleCheck size={14} className="qr-note-ic" />}
                <p>{m.text}</p>
                {m.chips && m.chips.length > 0 && m === msgs.filter((x) => x.role === "ai").slice(-1)[0] && (
                  <div className="qr-chips">
                    {m.chips.map((c) => (
                      <button key={c.label} type="button" className={clsx(c.tone && `is-${c.tone}`, c.cls)} disabled={thinking} onClick={c.run}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {(thinking || (rec && live)) && (
          <div className={clsx("qr-msg", rec ? "is-me" : "is-ai")}>
            {!rec && (
              <span className="qr-av">
                <Sparkles size={12} />
              </span>
            )}
            <div className={clsx("qr-bub", !rec && "qr-typing")}>{rec ? <p className="qr-live">{live}</p> : <span><i /><i /><i /></span>}</div>
          </div>
        )}
      </div>

      {/* ช่องพูด/พิมพ์ */}
      <AnimatePresence mode="wait" initial={false}>
        {rec ? (
          <motion.div key="rec" className="qr-bar is-rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="qr-ic" onClick={cancelRec} aria-label="ยกเลิก">
              <X size={18} />
            </button>
            <div className="qr-wave">
              <VoiceWave level={level} height={40} />
              <small>{voiceMode ? "กำลังฟัง… หยุดพูดแล้วส่งเอง" : "กำลังฟัง… พูดจบแล้วแตะส่ง"}</small>
            </div>
            <button type="button" className="qr-send is-stop" onClick={() => void finish()} aria-label="ส่งเสียง">
              <Square size={16} fill="currentColor" />
            </button>
          </motion.div>
        ) : (
          <motion.div key="type" className="qr-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className={clsx("qr-ic", voiceMode && "is-on")} onClick={toggleVoice} aria-pressed={voiceMode} aria-label="โหมดคุยด้วยเสียง" title={voiceMode ? "ปิดโหมดคุยด้วยเสียง" : "คุยด้วยเสียง (AI อ่านออกเสียงแล้วฟังต่อเอง)"}>
              {voiceMode ? (speaking ? <Volume2 size={18} /> : <AudioLines size={18} />) : <VolumeX size={18} />}
            </button>
            <button type="button" className="qr-ic" onClick={() => fileIn.current?.click()} aria-label="แนบไฟล์เสียง" title="แนบไฟล์เสียง">
              <FileAudio size={18} />
            </button>
            <input ref={fileIn} type="file" accept="audio/*" hidden aria-label="ไฟล์เสียงสรุปการรักษา" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
            <textarea
              className="qr-input"
              aria-label="สรุปการรักษา"
              rows={1}
              value={draft}
              placeholder="พิมพ์หรือพูด…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const t = draft;
                  setDraft("");
                  void onUser(t);
                }
              }}
            />
            {draft.trim() ? (
              <button
                type="button"
                className="qr-send"
                disabled={thinking}
                onClick={() => {
                  const t = draft;
                  setDraft("");
                  void onUser(t);
                }}
                aria-label="ส่งข้อความ"
              >
                <Send size={16} />
              </button>
            ) : (
              <button type="button" className="qr-send is-mic" disabled={!canRecord || thinking} onClick={() => void listen()} aria-label="พูด" title={canRecord ? "แตะเพื่อพูด" : "ต้องเปิดผ่าน https จึงใช้ไมค์ได้"}>
                <Mic size={18} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
