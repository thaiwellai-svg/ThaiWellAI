import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Keyboard, Loader2, Mic, Square, Undo2, Wand2, X } from "lucide-react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { THAI_MASSAGE_KNOWLEDGE, chatJSON, transcribe } from "./ai";
import { DX_PICK, PROC_PICK } from "./ClinicalRecord";
import { dxCode, procCode } from "../data/codes";
import type { Appointment, Diagnosis, Procedure } from "../data/types";
import "./voice-note.css";

type Extract = { diagnoses: string[]; procedures: { name: string; area?: string; minutes?: number }[]; painAfter: number | null; advice: string };
type Phase = "idle" | "rec" | "asr" | "ai" | "done" | "error";

/** offline fallback: pull the essentials out of the sentence with simple Thai keyword rules */
export function parseLocal(text: string, serviceName: string): Extract {
  const t = text.replace(/\s+/g, " ");
  const nums = [...t.matchAll(/(?:ปวด|เพน|pain|เหลือ|ระดับ)[^0-9๐-๙]{0,14}([0-9๐-๙]{1,2})/gi)].map((m) => Number(m[1].replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)))));
  const pain = nums.filter((n) => n >= 0 && n <= 10).pop();
  const diagnoses = DX_PICK.filter((d) => {
    const core = d.split(/[ (/]/)[0];
    const words = (d.match(/\(([^)]+)\)/)?.[1] ?? "").split(" ");
    return t.includes(core) || words.some((w) => w.length > 1 && t.includes(w));
  }).slice(0, 2);
  const procedures = PROC_PICK.filter((p) => t.includes(p) || (p.startsWith("ประคบ") && t.includes("ประคบ")) || (p.startsWith("กดจุด") && t.includes("กดจุด")) || (p.includes("ฤาษี") && t.includes("ฤาษี"))).map((name) => ({ name }));
  const short: [string, string][] = [["นวดรักษา", "นวดไทยเพื่อการรักษา"], ["นวดสุขภาพ", "นวดไทยเพื่อสุขภาพ"], ["นวดเท้า", "นวดเท้าเพื่อสุขภาพ"], ["อบสมุนไพร", "อบไอน้ำสมุนไพร"], ["อบไอน้ำ", "อบไอน้ำสมุนไพร"], ["พอก", "พอกสมุนไพร"]];
  for (const [k, name] of short) if (t.includes(k) && !procedures.some((p) => p.name === name)) procedures.unshift({ name });
  if (!procedures.some((p) => p.name.startsWith("นวด")) && /นวด/.test(t)) procedures.unshift({ name: serviceName });
  const adv = t.match(/(?:แนะนำ(?:ให้)?|ฝาก(?:ให้)?|กลับไป)(.+)$/)?.[1]?.trim() ?? "";
  return { diagnoses, procedures, painAfter: pain ?? null, advice: adv };
}

/**
 * พูดสรุปหลังนวด → ถอดเสียง (ASR ภาษาไทย) → AI แยกเป็น วินิจฉัย / หัตถการ / Pain หลังนวด / คำแนะนำ
 * แล้วเติมลงบันทึกการรักษาให้ ผู้บำบัดตรวจและแก้ได้ก่อนกดบันทึก · ย้อนกลับได้
 */
export function VoiceNote({ appt, onPain, onAdvice }: { appt: Appointment; onPain: (n: number) => void; onAdvice: (t: string) => void }) {
  const store = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<(Extract & { local?: boolean }) | null>(null);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [undo, setUndo] = useState<{ diagnoses?: Diagnosis[]; procedures?: Procedure[] } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopMeter = useRef<() => void>(() => {});
  const started = useRef(0);
  const s = store.serviceById(appt.serviceId);

  useEffect(() => () => stopMeter.current(), []);
  useEffect(() => {
    if (phase !== "rec") return;
    const t = window.setInterval(() => setSecs(Math.round((Date.now() - started.current) / 1000)), 250);
    return () => window.clearInterval(t);
  }, [phase]);

  const apply = (x: Extract, local: boolean, heard: string) => {
    const dx = appt.diagnoses ?? [];
    const pr = appt.procedures ?? [];
    setUndo({ diagnoses: dx, procedures: pr });
    const ndx = [...dx];
    for (const n of x.diagnoses ?? []) if (n && !ndx.some((d) => d.name === n)) ndx.push({ name: n, code: dxCode(n)?.code, kind: ndx.length ? "secondary" : "principal" });
    const npr = [...pr];
    for (const p of x.procedures ?? []) if (p?.name && !npr.some((q) => q.name === p.name)) npr.push({ name: p.name, code: procCode(p.name)?.code, area: p.area, minutes: p.minutes ?? (npr.length ? undefined : s.minutes) });
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: { diagnoses: ndx, procedures: npr }, log: `บันทึกด้วยเสียง${local ? " (ออฟไลน์)" : ""}: “${heard.slice(0, 80)}${heard.length > 80 ? "…" : ""}”` });
    if (x.painAfter !== null && x.painAfter !== undefined && x.painAfter >= 0 && x.painAfter <= 10) onPain(Math.round(x.painAfter));
    if (x.advice?.trim()) onAdvice(x.advice.trim());
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/aac"].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopMeter.current();
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        setPhase("asr");
        try {
          const heard = await transcribe(blob, r.mimeType.includes("mp4") || r.mimeType.includes("aac") ? "voice.m4a" : "voice.webm");
          if (!heard) throw new Error("empty");
          await understand(heard);
        } catch {
          setPhase("error");
        }
      };
      // input level meter for the waveform
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf = requestAnimationFrame(tick);
      };
      tick();
      stopMeter.current = () => {
        cancelAnimationFrame(raf);
        ctx.close().catch(() => {});
        setLevel(0);
      };
      rec.current = r;
      started.current = Date.now();
      setSecs(0);
      setResult(null);
      r.start();
      setPhase("rec");
    } catch {
      toast({ message: "เปิดไมโครโฟนไม่ได้ · อนุญาตการใช้ไมค์ หรือกด “พิมพ์แทน”", tone: "danger" });
    }
  };
  const stop = () => rec.current?.state === "recording" && rec.current.stop();

  const revert = () => {
    if (!undo) return;
    store.dispatch({ type: "updateAppointment", id: appt.id, patch: undo, log: "ย้อนการบันทึกด้วยเสียง" });
    setUndo(null);
    setResult(null);
    setPhase("idle");
  };

  const busy = phase === "asr" || phase === "ai";
  return (
    <section className={`vn is-${phase}`}>
      <div className="vn__row">
        {phase === "rec" ? (
          <button type="button" className="vn__mic is-rec" onClick={stop} aria-label="หยุดบันทึกเสียง">
            <Square size={18} fill="currentColor" />
            <motion.i animate={{ scale: 1 + level * 0.9, opacity: 0.25 + level * 0.5 }} transition={{ duration: 0.08 }} />
          </button>
        ) : (
          <button type="button" className="vn__mic" onClick={start} disabled={busy} aria-label="พูดเพื่อบันทึก">
            {busy ? <Loader2 size={20} className="spin" /> : <Mic size={20} />}
          </button>
        )}
        <div className="vn__text">
          <b>
            {phase === "rec"
              ? `กำลังฟัง… ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
              : phase === "asr"
                ? "กำลังถอดเสียง…"
                : phase === "ai"
                  ? "AI กำลังแยกวินิจฉัย หัตถการ และคะแนนปวด…"
                  : phase === "done"
                    ? "เติมบันทึกจากเสียงแล้ว · ตรวจก่อนกดบันทึก"
                    : phase === "error"
                      ? "ถอดเสียงไม่สำเร็จ ลองพูดใหม่ หรือพิมพ์แทน"
                      : "พูดสรุปการรักษา แล้วให้ AI บันทึกให้"}
          </b>
          <small>
            {phase === "rec" ? "กดปุ่มสี่เหลี่ยมเมื่อพูดจบ" : "เช่น “ลมปลายปัตคาด บ่าขวาตึง นวดรักษาเส้นอิทา 45 นาที ประคบต่อ ปวดเหลือ 3 แนะนำประคบร้อนที่บ้าน”"}
          </small>
        </div>
        {phase === "rec" && (
          <span className="vn__wave" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <motion.i key={i} animate={{ scaleY: 0.2 + level * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + secs))) }} transition={{ duration: 0.1 }} />
            ))}
          </span>
        )}
        {!typing && phase !== "rec" && !busy && (
          <button type="button" className="vn__alt" onClick={() => setTyping(true)}>
            <Keyboard size={15} /> พิมพ์แทน
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {typing && phase !== "rec" && (
          <motion.div className="vn__type" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์สรุปการรักษาแบบที่พูด…" rows={2} aria-label="สรุปการรักษา" />
            <div>
              <button type="button" onClick={() => setTyping(false)} aria-label="ปิด">
                <X size={15} />
              </button>
              <button type="button" className="is-go" disabled={!text.trim() || busy} onClick={() => understand(text.trim())}>
                <Wand2 size={15} /> ให้ AI เติม
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "done" && result && (
        <motion.div className="vn__out" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <p className="vn__heard">“{text}”</p>
          <div className="vn__chips">
            {result.diagnoses.map((d) => (
              <span key={d}>
                <Check size={12} /> วินิจฉัย: {d}
              </span>
            ))}
            {result.procedures.map((p) => (
              <span key={p.name}>
                <Check size={12} /> หัตถการ: {p.name}
                {p.area ? ` · ${p.area}` : ""}
              </span>
            ))}
            {result.painAfter !== null && (
              <span>
                <Check size={12} /> Pain หลังนวด {result.painAfter}
              </span>
            )}
            {result.advice && (
              <span>
                <Check size={12} /> คำแนะนำ
              </span>
            )}
            {result.local && <em>ใช้ตัวช่วยออฟไลน์ (AI ไม่ตอบ)</em>}
          </div>
          <button type="button" className="vn__undo" onClick={revert}>
            <Undo2 size={14} /> ย้อนกลับ
          </button>
        </motion.div>
      )}
    </section>
  );
}
