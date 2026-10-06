import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Check, FileAudio, ClipboardList, Hand, Keyboard, Loader2, MessageSquareQuote, Mic, RotateCcw, ShieldAlert, Square, Stethoscope, Undo2, Wand2, X } from "lucide-react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { THAI_MASSAGE_KNOWLEDGE, chatJSON, fileToWav, startMic, transcribe, type Mic as MicRec } from "./ai";
import { DX_PICK, PROC_PICK } from "./ClinicalRecord";
import { dxCode, procCode } from "../data/codes";
import type { Appointment, Diagnosis, Procedure } from "../data/types";
import "./voice-note.css";

type Extract = { diagnoses: string[]; procedures: { name: string; area?: string; minutes?: number | null }[]; painAfter: number | null; advice: string };
type Phase = "idle" | "rec" | "asr" | "ai" | "done" | "error";

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

/**
 * Right-column section of the treatment record: speak a summary → Thai ASR (converted to WAV) → AI splits it into
 * diagnosis / procedures / pain after / advice → fills the record. The therapist reviews, edits, or undoes.
 */
/** the treatment-record form listens for this to fill Pain-after and advice (they are local drafts there) */
export const VOICE_FILL = "thaiwell:voice-fill";
export type VoiceFill = { apptId: string; painAfter?: number; advice?: string };

export function VoiceNote({ appt, bare }: { appt: Appointment; /** inside a side panel that already has a title */ bare?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<(Extract & { local?: boolean }) | null>(null);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [undo, setUndo] = useState<{ diagnoses?: Diagnosis[]; procedures?: Procedure[] } | null>(null);
  const mic = useRef<MicRec | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const started = useRef(0);
  const s = store.serviceById(appt.serviceId);
  const secure = typeof window === "undefined" || window.isSecureContext;
  const canRecord = secure && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => () => mic.current?.cancel(), []);
  // a different visit → start clean
  useEffect(() => {
    setPhase("idle");
    setResult(null);
    setUndo(null);
    setText("");
    setTyping(false);
  }, [appt.id]);
  useEffect(() => {
    if (phase !== "rec") return;
    const t = window.setInterval(() => {
      const n = Math.round((Date.now() - started.current) / 1000);
      setSecs(n);
      if (n >= 120) void stop(); // 2-minute cap
    }, 250);
    return () => window.clearInterval(t);
  }, [phase]);

  const apply = (x: Extract, local: boolean, heard: string) => {
    const dx = appt.diagnoses ?? [];
    const pr = appt.procedures ?? [];
    setUndo({ diagnoses: dx, procedures: pr });
    const ndx = [...dx];
    for (const n of x.diagnoses ?? []) if (n && !ndx.some((d) => d.name === n)) ndx.push({ name: n, code: dxCode(n)?.code, kind: ndx.length ? "secondary" : "principal" });
    const npr = [...pr];
    for (const p of x.procedures ?? []) if (p?.name && !npr.some((q) => q.name === p.name)) npr.push({ name: p.name, code: procCode(p.name)?.code, area: p.area || undefined, minutes: p.minutes ?? (npr.length ? undefined : s.minutes) });
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: { diagnoses: ndx, procedures: npr }, log: `บันทึกด้วยเสียง${local ? " (ออฟไลน์)" : ""}: “${heard.slice(0, 80)}${heard.length > 80 ? "…" : ""}”` });
    const fill: VoiceFill = { apptId: appt.id };
    if (typeof x.painAfter === "number" && x.painAfter >= 0 && x.painAfter <= 10) fill.painAfter = Math.round(x.painAfter);
    if (x.advice?.trim()) fill.advice = x.advice.trim();
    window.dispatchEvent(new CustomEvent<VoiceFill>(VOICE_FILL, { detail: fill }));
    setResult({ ...x, local });
    setTyping(false);
    setPhase("done");
  };

  const understand = async (heard: string) => {
    setText(heard);
    setPhase("ai");
    try {
      const x = await chatJSON<Extract>(
        `คุณช่วยผู้บำบัดแพทย์แผนไทยแปลงคำพูดสรุปหลังนวดเป็นบันทึกเวชระเบียน ตอบ JSON เท่านั้น:
{"diagnoses":["การวินิจฉัยแผนไทย"],"procedures":[{"name":"หัตถการ","area":"ตำแหน่ง/เส้นประธาน","minutes":นาทีหรือnull}],"painAfter":ตัวเลข0-10หรือnull,"advice":"คำแนะนำถึงผู้ป่วย หรือ \\"\\""}
ใช้ชื่อจากรายการแนะนำถ้าตรงความหมาย: วินิจฉัย ${JSON.stringify(DX_PICK)} · หัตถการ ${JSON.stringify(PROC_PICK)}
คำพูดมาจากระบบถอดเสียง อาจสะกดผิดเล็กน้อย (เช่น "เอตา" = "อิทา") ให้แก้ให้ถูก · ตัวเลขที่พูดเป็นคำ (สาม) ให้แปลงเป็นเลข
อย่าเดาสิ่งที่ไม่ได้พูด ถ้าไม่ได้พูดถึง painAfter ให้เป็น null
${THAI_MASSAGE_KNOWLEDGE}`,
        JSON.stringify({ คำพูด: heard, บริการวันนี้: s.name, painก่อนนวด: appt.painBefore }),
      );
      apply(x, false, heard);
    } catch {
      apply(parseLocal(heard, s.name), true, heard);
    }
  };

  const start = async () => {
    if (!canRecord) {
      setTyping(true);
      return;
    }
    try {
      mic.current = await startMic(setLevel);
      started.current = Date.now();
      setSecs(0);
      setResult(null);
      setError("");
      setPhase("rec");
    } catch {
      toast({ message: "เปิดไมโครโฟนไม่ได้ · อนุญาตการใช้ไมค์ใน Safari หรือกด “พิมพ์แทน”", tone: "danger" });
    }
  };
  const stop = async () => {
    const m = mic.current;
    if (!m) return;
    mic.current = null;
    setLevel(0);
    await hear(m.stop());
  };
  /** WAV → text → AI summary (shared by the mic and an attached audio file) */
  const hear = async (job: Promise<{ wav: Blob; seconds: number }>) => {
    setPhase("asr");
    let wav: Blob;
    try {
      const r = await job;
      if (r.seconds < 0.8) {
        setError("เสียงสั้นเกินไป แตะไมค์แล้วพูดให้จบประโยค");
        setPhase("error");
        return;
      }
      wav = r.wav;
    } catch {
      setError("เปิดไฟล์เสียงนี้ไม่ได้ ลองไฟล์ .m4a .mp3 หรือ .wav");
      setPhase("error");
      return;
    }
    try {
      const heard = await transcribe(wav);
      if (!heard) throw new Error("empty");
      await understand(heard);
    } catch (e) {
      setError(String(e).includes("empty") ? "ไม่ได้ยินเสียงพูด ลองพูดใกล้ไมค์อีกครั้ง" : "ถอดเสียงไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่ หรือพิมพ์แทน");
      setPhase("error");
    }
  };

  const revert = () => {
    if (!undo) return;
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: undo, log: "ย้อนการบันทึกด้วยเสียง" });
    setUndo(null);
    setResult(null);
    setPhase("idle");
  };

  const busy = phase === "asr" || phase === "ai";
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <section className={`vn is-${phase}${bare ? " vn--bare" : ""}`} aria-label="สรุปการรักษาด้วยเสียง">
      {!bare && (
        <header className="vn__head">
          <span className="vn__icon">
            <AudioLines size={15} />
          </span>
          <b>สรุปการรักษาด้วยเสียง</b>
          <em>AI</em>
        </header>
      )}

      {phase !== "done" && (
        <div className="vn__stage">
          {phase === "rec" ? (
            <>
              <button type="button" className="vn__mic is-rec" onClick={stop} aria-label="หยุดบันทึกเสียง">
                <motion.i animate={{ scale: 1 + level * 0.7, opacity: 0.18 + level * 0.4 }} transition={{ duration: 0.08 }} />
                <Square size={22} fill="currentColor" />
              </button>
              <span className="vn__wave" aria-hidden>
                {Array.from({ length: 18 }, (_, i) => (
                  <motion.i key={i} animate={{ scaleY: 0.15 + level * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + secs * 2))) }} transition={{ duration: 0.1 }} />
                ))}
              </span>
              <b className="vn__status">กำลังฟัง · {mm}</b>
              <small className="vn__hint">แตะปุ่มสี่เหลี่ยมเมื่อพูดจบ</small>
            </>
          ) : busy ? (
            <>
              <span className="vn__mic is-busy">
                <Loader2 size={24} className="spin" />
              </span>
              <ol className="vn__steps">
                <li className={phase === "asr" ? "is-now" : "is-done"}>
                  {phase === "asr" ? <Loader2 size={13} className="spin" /> : <Check size={13} strokeWidth={3} />} ถอดเสียงภาษาไทย
                </li>
                <li className={phase === "ai" ? "is-now" : undefined}>
                  {phase === "ai" ? <Loader2 size={13} className="spin" /> : <i />} AI แยกวินิจฉัย หัตถการ Pain คำแนะนำ
                </li>
              </ol>
              {phase === "ai" && text && <p className="vn__heard">“{text}”</p>}
            </>
          ) : (
            <>
              <button type="button" className="vn__mic" onClick={start} aria-label="พูดเพื่อบันทึก" disabled={!canRecord}>
                <Mic size={26} />
              </button>
              <b className="vn__status">{phase === "error" ? "ลองใหม่อีกครั้ง" : "แตะไมค์แล้วพูดสรุปการรักษา"}</b>
              {phase === "error" ? (
                <small className="vn__err">{error}</small>
              ) : !canRecord ? (
                <small className="vn__err">
                  <ShieldAlert size={13} /> ไมค์ใช้ได้เฉพาะหน้าเว็บที่เปิดผ่าน https · ใช้ “พิมพ์แทน” ได้เลย
                </small>
              ) : (
                <small className="vn__hint">เช่น “ลมปลายปัตคาด บ่าขวาตึง นวดรักษาเส้นอิทา 45 นาที ประคบต่อ ปวดเหลือ 3 แนะนำประคบร้อนที่บ้าน”</small>
              )}
            </>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {typing && phase !== "rec" && !busy && (
          <motion.div className="vn__type" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์สรุปการรักษาแบบที่พูด…" rows={3} aria-label="สรุปการรักษา" />
            <div>
              <button type="button" onClick={() => setTyping(false)} aria-label="ปิด">
                <X size={15} />
              </button>
              <button type="button" className="is-go" disabled={!text.trim()} onClick={() => understand(text.trim())}>
                <Wand2 size={15} /> ให้ AI สรุป
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!typing && phase !== "rec" && !busy && phase !== "done" && (
        <div className="vn__alts">
          <button type="button" className="vn__link" onClick={() => setTyping(true)}>
            <Keyboard size={14} /> พิมพ์แทน
          </button>
          <button type="button" className="vn__link" onClick={() => fileIn.current?.click()}>
            <FileAudio size={14} /> แนบไฟล์เสียง
          </button>
        </div>
      )}
      <input
        ref={fileIn}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.aac"
        hidden
        aria-label="ไฟล์เสียงสรุปการรักษา"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void hear(fileToWav(f));
        }}
      />

      {phase === "done" && result && (
        <motion.div className="vn__out" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <p className="vn__heard">
            <MessageSquareQuote size={14} />“{text}”
          </p>
          <dl className="vn__sum">
            <dt>
              <Stethoscope size={13} /> วินิจฉัย
            </dt>
            <dd>{result.diagnoses?.length ? result.diagnoses.map((d) => <span key={d}>{d}</span>) : <i>ไม่ได้พูดถึง</i>}</dd>
            <dt>
              <Hand size={13} /> หัตถการ
            </dt>
            <dd>
              {result.procedures?.length ? (
                result.procedures.map((p) => (
                  <span key={p.name}>
                    {p.name}
                    {p.area ? <small> · {p.area}</small> : null}
                    {p.minutes ? <small> · {p.minutes} นาที</small> : null}
                  </span>
                ))
              ) : (
                <i>ไม่ได้พูดถึง</i>
              )}
            </dd>
            <dt>Pain หลังนวด</dt>
            <dd>
              {typeof result.painAfter === "number" ? (
                <b className="vn__pain">
                  {appt.painBefore} → {result.painAfter}
                  <small>/10</small>
                </b>
              ) : (
                <i>ไม่ได้พูดถึง · เลือกเองด้านซ้าย</i>
              )}
            </dd>
            <dt>
              <ClipboardList size={13} /> คำแนะนำ
            </dt>
            <dd>{result.advice ? <p>{result.advice}</p> : <i>ไม่ได้พูดถึง</i>}</dd>
          </dl>
          <p className="vn__ok">
            <Check size={13} strokeWidth={3} /> เติมลงบันทึกการรักษาแล้ว · ตรวจแล้วกด “บันทึก”
            {result.local && <em>ใช้ตัวช่วยออฟไลน์ (AI ไม่ตอบ)</em>}
          </p>
          <div className="vn__acts">
            <button type="button" onClick={revert}>
              <Undo2 size={14} /> ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setResult(null);
              }}
            >
              <RotateCcw size={14} /> พูดเพิ่ม
            </button>
          </div>
        </motion.div>
      )}
    </section>
  );
}
