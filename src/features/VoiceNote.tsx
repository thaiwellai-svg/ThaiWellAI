import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FileAudio, Mic, Pencil, RefreshCw, RotateCcw, Send, Sparkles, Volume2, X } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { THAI_MASSAGE_KNOWLEDGE, chatJSON, fileToWav, startMic, transcribe, type Mic as MicRec } from "./ai";
import { DX_PICK, PROC_PICK } from "./ClinicalRecord";
import { dxCode, procCode } from "../data/codes";
import { samuthan } from "../data/samuthan";
import { DEFAULT_CALL_VOICE, speak, stopSpeaking, unlockAudio } from "./tts";
import { VoiceWave } from "./VoiceWave";
import type { Appointment } from "../data/types";
import "./voice-note.css";

type Extract = { findings?: string; diagnoses: string[]; procedures: { name: string; area?: string; minutes?: number | null }[]; painAfter: number | null; advice: string };
type Slot = "finding" | "dx" | "proc" | "pain" | "advice" | "summary";
type Msg = { id: number; role: "ai" | "me"; text: string; kind?: Slot | "intro" };

/** the treatment-record form listens for this to fill Pain-after and advice (they are local drafts there) */
export const VOICE_FILL = "thaiwell:voice-fill";
export type VoiceFill = { apptId: string; painAfter?: number; advice?: string; /** start over: clear the drafts */ clear?: boolean };
/** …and announces its own drafts so the chat knows what is already filled */
export const RECORD_DRAFT = "thaiwell:record-draft";

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
  { slot: "finding", label: "อาการที่ตรวจพบ" },
  { slot: "dx", label: "วินิจฉัย" },
  { slot: "proc", label: "หัตถการ" },
  { slot: "pain", label: "Pain หลังนวด" },
  { slot: "advice", label: "คำแนะนำผู้ป่วย" },
];
const ASK = {
  finding: "วันนี้ตรวจพบอะไรบ้างคะ เช่น ตำแหน่งที่ปวด ตึง กดเจ็บ หรือลักษณะอาการ",
  dx: "วินิจฉัยว่าอะไรคะ เลือกด้านล่างหรือพูดบอกได้เลย",
  proc: "ทำหัตถการอะไรบ้างคะ นวดเส้นไหน กี่นาที",
  pain: "หลังนวดผู้ป่วยให้คะแนนปวดเท่าไรคะ",
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
  const mic = useRef<MicRec | null>(null);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const vm = useRef(voiceMode);
  vm.current = voiceMode;
  const heardSpeech = useRef(false);
  const quietSince = useRef(0);
  const peeking = useRef(false);
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
    const m: Msg = { id: ++seq.current, role, text, kind };
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

  /** ask for whatever is still missing (with its component) */
  const askNext = (prefix = "") => ask(missing(), prefix);
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
      const t = `${prefix}ข้อ ${no("advice")}/${SET.length} · ${had ? "คำแนะนำถึงผู้ป่วยตอนนี้ค่ะ" : "ร่างคำแนะนำถึงผู้ป่วยให้แล้วค่ะ"} แก้ได้เลย หรือบอกให้ปรับตรงไหน`;
      say("ai", t, "advice");
      void voice(t);
      return;
    }
    if (slot === "summary") {
      const t = `${prefix}บันทึกครบแล้วค่ะ ตรวจสรุปด้านล่าง แก้ได้ทุกช่อง แล้วกด “บันทึก” ในฟอร์มได้เลย`;
      say("ai", t, "summary");
      void voice(t);
      return;
    }
    setPick([]);
    const q = `ข้อ ${no(slot)}/${SET.length} · ${slot === "pain" ? `${ASK.pain} ก่อนนวดอยู่ที่ ${appt.painBefore}` : ASK[slot]}`;
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
    const nf = !xf || l.findings.includes(xf) ? l.findings : xf.includes(l.findings.trim()) || !l.findings.trim() ? xf : `${l.findings.trim()} · ${xf}`;
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

  /** one user turn (spoken or typed) */
  const onUser = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    say("me", t);
    setThinking(true);
    const { last: prev, pending: asked } = turn.current;
    if (asked === "advice" || asked === "summary") {
      // a request to change the advice
      const a = await draftAdvice(t);
      saveAdvice(a);
      setThinking(false);
      const r = "ปรับคำแนะนำให้แล้วค่ะ";
      say("ai", r, "advice");
      void voice(r);
      return;
    }
    let x: Extract;
    let local = false;
    try {
      x = await chatJSON<Extract>(
        `คุณช่วยผู้บำบัดแพทย์แผนไทยแปลงคำพูดเป็นบันทึกเวชระเบียน ตอบ JSON เท่านั้น:
{"findings":"อาการ/สิ่งที่ตรวจพบวันนี้ (ตำแหน่ง ลักษณะ) หรือ \\"\\"","diagnoses":["การวินิจฉัยแผนไทย"],"procedures":[{"name":"หัตถการ","area":"ตำแหน่ง/เส้นประธาน","minutes":นาทีหรือnull}],"painAfter":ตัวเลข0-10หรือnull,"advice":"คำแนะนำถึงผู้ป่วย หรือ \\"\\""}
ใช้ชื่อจากรายการแนะนำถ้าตรงความหมาย: วินิจฉัย ${JSON.stringify(DX_PICK)} · หัตถการ ${JSON.stringify(PROC_PICK)}
คำพูดมาจากระบบถอดเสียง อาจสะกดผิด (เช่น "เอตา" = "อิทา") · ตัวเลขที่พูดเป็นคำให้แปลงเป็นเลข · ถ้าเป็นคำตอบสั้น ๆ ให้ตีความตามคำถามล่าสุด (ถ้าคำถามล่าสุดถามสิ่งที่ตรวจพบ ให้ใส่ใน findings)
อย่าเดาสิ่งที่ไม่ได้พูด ห้ามอนุมานวินิจฉัยหรือหัตถการจากอาการ ต้องพูดชื่อออกมาจึงใส่ ไม่ได้พูดถึงให้เป็น [] หรือ null`,
        JSON.stringify({ คำถามล่าสุด: prev?.role === "ai" ? prev.text : null, คำพูด: t, บริการวันนี้: s.name, painก่อนนวด: appt.painBefore }),
      );
    } catch {
      x = parseLocal(t, s.name);
      local = true;
    }
    // one question at a time: keep only the answer to the question that was asked, then move to the next one
    const slot: Slot = asked && asked !== "intro" ? asked : missing();
    const only: Extract = { diagnoses: [], procedures: [], painAfter: null, advice: "" };
    if (slot === "finding") only.findings = x.findings?.trim() || t;
    if (slot === "dx") only.diagnoses = x.diagnoses ?? [];
    if (slot === "proc") only.procedures = x.procedures ?? [];
    if (slot === "pain") only.painAfter = x.painAfter;
    const got = apply(only);
    setThinking(false);
    if (!got.length) {
      await ask(slot, "ขอโทษค่ะ ยังไม่ได้คำตอบข้อนี้\n");
      return;
    }
    await askNext(`รับทราบค่ะ ${got.join(" · ")}${local ? " (ออฟไลน์)" : ""}\n`);
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
      mic.current = await startMic((v) => {
        setLevel(v);
        // voice mode: stop by itself after ~1.5 s of quiet once something was said
        if (v > 0.32) {
          heardSpeech.current = true;
          quietSince.current = 0;
        } else if (vm.current && heardSpeech.current && Date.now() - started > 1500) {
          quietSince.current ||= Date.now();
          if (Date.now() - quietSince.current > 1500) void finish();
        }
      });
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
          if (mic.current === m && txt) setLive(txt);
        }
      } catch {
        /* keep the last text */
      } finally {
        peeking.current = false;
      }
    }, 1600);
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
      return;
    }
    setThinking(true);
    try {
      const heard = await transcribe(wav);
      setLive("");
      setThinking(false);
      if (heard) await onUser(heard);
      else if (vm.current) void listen();
    } catch {
      setLive("");
      setThinking(false);
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

  const intro = () => `เริ่มบันทึกการรักษาของคุณ${p.name.replace(/^(นางสาว|นาง|นาย)\s*/, "")}ค่ะ มี ${SET.length} คำถาม ตอบทีละข้อ ตอบแล้วจะถามข้อต่อไปให้เลย แตะไมค์เพื่อคุยด้วยเสียงได้`;
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
  const doneCount = steps.filter((x) => x.value).length;
  const askAgain = (slot: Slot) => {
    if (thinking || rec) return;
    stopSpeaking();
    setPick([]);
    void ask(slot);
  };

  /** quick replies under the current question */
  const QUICK: Partial<Record<Slot, string[]>> = {
    finding: ["บ่าขวาตึง กดเจ็บ ยกแขนลำบาก", "ปวดหลังส่วนล่าง ร้าวลงสะโพกซ้าย", "เข่าซ้ายฝืด ลุกนั่งลำบาก"],
    proc: [`นวดรักษาเส้นอิทา ปิงคลา ${s.minutes} นาที`, "ประคบสมุนไพร 20 นาที", "สอนท่าฤาษีดัดตน"],
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
        <PainRow
          onPick={(n) => {
            savePain(n);
            say("me", `ปวดหลังนวด ${n}`);
            void askNext();
          }}
        />
      );
    if (m.kind === "dx" || m.kind === "proc") {
      const opts = m.kind === "dx" ? DX_PICK : PROC_PICK;
      return (
        <div className="rc-chips">
          {opts.map((o) => (
            <button key={o} type="button" aria-pressed={pick.includes(o)} onClick={() => setPick((x) => (x.includes(o) ? x.filter((y) => y !== o) : [...x, o]))}>
              {pick.includes(o) && <Check size={12} strokeWidth={3} />} {o}
            </button>
          ))}
          <button
            type="button"
            className="rc-ok"
            disabled={!pick.length}
            onClick={() => {
              const x: Extract = m.kind === "dx" ? { diagnoses: pick, procedures: [], painAfter: null, advice: "" } : { diagnoses: [], procedures: pick.map((name) => ({ name })), painAfter: null, advice: "" };
              say("me", pick.join(", "));
              apply(x);
              void askNext();
            }}
          >
            ยืนยัน
          </button>
        </div>
      );
    }
    if (m.kind === "advice" || m.kind === "summary")
      return (
        <div className="rc-card">
          {m.kind === "summary" && (
            <dl className="rc-sum">
              <dt>ตรวจพบ</dt>
              <dd>
                <p className="rc-sum__t">{findings || "—"}</p>
              </dd>
              <dt>วินิจฉัย</dt>
              <dd>
                {dx.map((d) => (
                  <span key={d.name}>
                    {d.name}
                    <button type="button" aria-label={`ลบ ${d.name}`} onClick={() => removeDx(d.name)}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </dd>
              <dt>หัตถการ</dt>
              <dd>
                {pr.map((x) => (
                  <span key={x.name}>
                    {x.name}
                    {x.area ? ` · ${x.area}` : ""}
                    {x.minutes ? ` · ${x.minutes} นาที` : ""}
                    <button type="button" aria-label={`ลบ ${x.name}`} onClick={() => removePr(x.name)}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </dd>
              <dt>Pain หลังนวด</dt>
              <dd>
                <PainRow sm onPick={savePain} />
              </dd>
            </dl>
          )}
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
              {m.kind === "advice" && (
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
        </div>
      );
    return null;
  };

  return (
    <section className="rc" aria-label="ผู้ช่วยบันทึกการรักษา">
      <div className="rc-top">
        <span className={clsx("rc-orb", (speaking || thinking || rec) && "is-on")}>
          <Sparkles size={14} />
        </span>
        <span className="rc-top__t">{speaking ? "AI กำลังพูด…" : rec ? "กำลังฟัง…" : thinking ? "AI กำลังคิด…" : "พูด พิมพ์ หรือแตะตัวเลือก"}</span>
        {voiceMode && (
          <span className="rc-mode is-on">
            <i /> คุยด้วยเสียง
          </span>
        )}
      </div>

      <div className="rc-steps" aria-label="ชุดคำถาม">
        <div className="rc-steps__head">
          <b>ชุดคำถาม</b>
          <i>
            <i style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </i>
          <small>
            {doneCount}/{steps.length}
          </small>
        </div>
        <ol>
          {steps.map((x, i) => {
            const now = pending === x.slot;
            return (
              <li key={x.slot}>
                <button type="button" className={clsx(x.value && "is-done", now && "is-now")} onClick={() => askAgain(x.slot)} title={`ถามเรื่อง${x.label}อีกครั้ง`}>
                  <i>{x.value ? <Check size={11} strokeWidth={3.2} /> : i + 1}</i>
                  <span>
                    <b>{x.label}</b>
                    <small>{x.value ?? (now ? "กำลังถาม…" : "ยังไม่ได้ตอบ")}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rc-list scroll-y scroll-y--light" ref={list}>
        {msgs.map((m) => (
          <motion.div key={m.id} className={`rc-msg is-${m.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            {m.role === "ai" && (
              <span className="rc-av">
                <Sparkles size={12} />
              </span>
            )}
            <div className="rc-bub">
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

        {rec && (
          <div className="rc-msg is-me is-live">
            <div className="rc-bub">
              <p>{live || "…"}</p>
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
            <button type="button" className="rc-x" onClick={toggleVoice} aria-label="จบการคุยด้วยเสียง" title="จบการคุยด้วยเสียง">
              <X size={17} />
            </button>
            <span className="rc-live">
              <VoiceWave level={level} speak={speaking} calm={!rec && !speaking} height={44} />
              <small>{rec ? "กำลังฟัง · พูดได้เลย" : speaking ? "AI กำลังตอบ" : thinking ? "AI กำลังคิด…" : "กำลังเปิดไมค์…"}</small>
            </span>
            {rec ? (
              <button type="button" className="rc-stop" onClick={() => void finish()} aria-label="หยุดบันทึกเสียง">
                <Send size={13} /> ส่งเลย
              </button>
            ) : speaking ? (
              <button type="button" className="rc-stop" onClick={() => (stopSpeaking(), setSpeaking(false), void listen())} aria-label="พูดแทรก">
                <Mic size={13} /> พูดแทรก
              </button>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="type" className="rc-bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="rc-ic" onClick={() => fileIn.current?.click()} aria-label="แนบไฟล์เสียง" title="แนบไฟล์เสียง">
              <FileAudio size={17} />
            </button>
            <textarea
              value={draft}
              rows={1}
              placeholder={pending === "advice" || pending === "summary" ? "บอกให้ปรับคำแนะนำ…" : "พิมพ์ตอบ…"}
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
                <Mic size={18} />
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
            if (heard) await onUser(heard);
          } catch {
            setThinking(false);
            say("ai", "เปิดไฟล์เสียงนี้ไม่ได้ค่ะ ลองไฟล์ .m4a .mp3 หรือ .wav");
          }
        }}
      />
    </section>
  );
}
