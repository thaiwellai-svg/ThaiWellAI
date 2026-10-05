import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, Dialog, useToast } from "../design-system";
import { useStore } from "../store/store";
import { screeningFlags } from "../data/counterScreening";
import { todayISO } from "../data/thaiDate";
import type { CounterScreening, Patient } from "../data/types";
import "./screening-dialog.css";

type Q = "fever" | "recentSurgery" | "bloodThinner" | "numbness" | "skinProblem" | "pregnant";

/** Quick re-screening before each massage (vitals + contraindications); body areas carry over from the last screening. */
export function ScreeningDialog({ p, open, onClose }: { p: Patient; open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const last = p.screening;
  const blank = () => ({
    bpSys: "",
    bpDia: "",
    pulse: "",
    pain: null as number | null,
    pressure: (last?.pressure ?? "ปานกลาง") as CounterScreening["pressure"],
    fever: false,
    recentSurgery: !!last?.recentSurgery,
    bloodThinner: !!last?.bloodThinner,
    numbness: !!last?.numbness,
    skinProblem: false,
    pregnant: !!last?.pregnant,
  });
  const [s, setS] = useState(blank);
  useEffect(() => {
    if (open) setS(blank());
  }, [open, p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = store.settings.surgeryRecoveryDays ?? 30;
  const qs: { key: Q; label: string; hint: string; level: "stop" | "warn" }[] = [
    { key: "fever", label: "มีไข้ หรือกำลังติดเชื้อ?", hint: "ห้ามนวด", level: "stop" },
    { key: "recentSurgery", label: `ผ่าตัดมาภายใน ${days} วัน?`, hint: "ห้ามนวด", level: "stop" },
    { key: "bloodThinner", label: "กินยาละลายลิ่มเลือดอยู่?", hint: "ลดแรงนวด", level: "warn" },
    { key: "numbness", label: "มีอาการชา หรืออ่อนแรง?", hint: "นวดอย่างระวัง", level: "warn" },
    { key: "skinProblem", label: "มีแผล ผื่น หรือโรคผิวหนัง?", hint: "เลี่ยงบริเวณนั้น", level: "warn" },
    ...(p.gender === "หญิง" ? [{ key: "pregnant" as Q, label: "ตั้งครรภ์ หรืออาจตั้งครรภ์?", hint: "นวดอย่างระวัง", level: "warn" as const }] : []),
  ];

  const result: CounterScreening = {
    at: new Date().toISOString(),
    bpSys: Number(s.bpSys) || undefined,
    bpDia: Number(s.bpDia) || undefined,
    pulse: Number(s.pulse) || undefined,
    fever: s.fever,
    pregnant: p.gender === "หญิง" ? s.pregnant : null,
    recentSurgery: s.recentSurgery,
    numbness: s.numbness,
    bloodThinner: s.bloodThinner,
    skinProblem: s.skinProblem,
    pressure: s.pressure,
    avoid: last?.avoid ?? "",
    painAreas: last?.painAreas,
    pain: s.pain ?? undefined,
  };
  const flags = screeningFlags(result, store.settings.bpThreshold);
  const stop = flags.some((f) => f.level === "stop");
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 3);

  const save = () => {
    const today = todayISO();
    store.dispatch({
      type: "updatePatient",
      id: p.id,
      patch: {
        screening: result,
        ...(s.pain != null ? { painHistory: [...p.painHistory.filter((x) => x.date !== today), { date: today, score: s.pain }] } : {}),
      },
    });
    toast({ message: stop ? "บันทึกผลคัดกรองแล้ว · พบข้อห้าม ต้องให้แพทย์ประเมินก่อนนวด" : "บันทึกผลคัดกรองแล้ว", tone: stop ? "danger" : undefined });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="sd"
      title="คัดกรองก่อนนวด"
      subtitle={`${p.name} · วัดสัญญาณชีพและถามอาการวันนี้`}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="md" onClick={save}>
            บันทึกผลคัดกรอง
          </Button>
        </>
      }
    >
      <div className="sd__vitals">
        <label>
          <small>ความดัน (mmHg)</small>
          <span className="sd__bp">
            <input inputMode="numeric" placeholder="120" aria-label="ความดันตัวบน" value={s.bpSys} onChange={(e) => setS({ ...s, bpSys: digits(e.target.value) })} />
            <i>/</i>
            <input inputMode="numeric" placeholder="80" aria-label="ความดันตัวล่าง" value={s.bpDia} onChange={(e) => setS({ ...s, bpDia: digits(e.target.value) })} />
          </span>
        </label>
        <label>
          <small>ชีพจร (ครั้ง/นาที)</small>
          <input inputMode="numeric" placeholder="72" aria-label="ชีพจร" value={s.pulse} onChange={(e) => setS({ ...s, pulse: digits(e.target.value) })} />
        </label>
      </div>

      <div className="sd__row">
        <small>ตอนนี้ปวดมากแค่ไหน?</small>
        <div className="sd__pain">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" aria-pressed={s.pain === n} style={{ ["--pc" as string]: n >= 7 ? "#d8392a" : n >= 4 ? "#e08a1e" : "#2f9a5b" }} onClick={() => setS({ ...s, pain: s.pain === n ? null : n })}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="sd__row">
        <small>ชอบแรงนวดแบบไหน?</small>
        <div className="sd__chips">
          {(["เบา", "ปานกลาง", "หนัก"] as const).map((x) => (
            <button key={x} type="button" className="tw-chip" aria-pressed={s.pressure === x} onClick={() => setS({ ...s, pressure: x })}>
              {x}
            </button>
          ))}
        </div>
      </div>

      <div className="sd__qs">
        {qs.map((q) => (
          <div key={q.key} className={`sd__q is-${q.level}${s[q.key] ? " is-on" : ""}`} role="radiogroup" aria-label={q.label}>
            <span>
              <b>{q.label}</b>
              <small>ถ้าใช่ · {q.hint}</small>
            </span>
            {([false, true] as const).map((yes) => (
              <label key={String(yes)}>
                <input type="radio" name={`sd-${q.key}`} checked={s[q.key] === yes} onChange={() => setS({ ...s, [q.key]: yes })} />
                <i />
                {yes ? "ใช่" : "ไม่ใช่"}
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className={stop ? "sd__verdict is-stop" : flags.length ? "sd__verdict is-warn" : "sd__verdict"}>
        {flags.length ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
        <div>
          <b>{stop ? "พบข้อห้าม · ต้องให้แพทย์แผนไทยประเมินก่อนนวด" : flags.length ? `ข้อควรระวัง ${flags.length} ข้อ` : "ผ่านการคัดกรอง พร้อมนวด"}</b>
          {flags.length > 0 && <small>{flags.map((f) => f.label).join(" · ")}</small>}
        </div>
      </div>
    </Dialog>
  );
}
