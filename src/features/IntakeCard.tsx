import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, Briefcase, Check, ChevronDown, Gauge, Hand, HeartPulse, Info, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { timeAgo } from "../data/thaiDate";
import { intakeAlerts } from "../data/intake";
import type { Intake } from "../data/types";
import { toAreas, type BodyArea } from "./BodyMap";
import { Body3D } from "./Body3D";
import type { Element } from "../data/elements";
import "./intake.css";


/** แบบประเมินก่อนรับบริการ — what the patient answered in the ThaiWell AI app */
/** body heat (focus areas at the reported pain level, first-listed hottest) + do-not-massage areas */
export function intakeBody(i: Intake) {
  const level = Math.max(0.35, i.pain / 10);
  const heatmap: Partial<Record<BodyArea, number>> = {};
  i.focusAreas.forEach((a, k) => {
    for (const r of toAreas(a)) heatmap[r] = Math.max(heatmap[r] ?? 0, level * (1 - k * 0.08));
  });
  const avoid = [...new Set(i.avoidAreas.flatMap(toAreas))];
  return { heatmap, avoid };
}

export function IntakeCard({ intake: i, compact, sex, element, body = true }: { intake: Intake; compact?: boolean; sex?: "ชาย" | "หญิง"; element?: Element; /** show the 3D body (off when the page already shows it) */ body?: boolean }) {
  const { settings } = useStore();
  const [open, setOpen] = useState(!compact);
  const alerts = intakeAlerts(i, settings.bpThreshold);
  const { heatmap, avoid } = intakeBody(i);
  // grouped answers; `flag` marks an answer that needs attention
  type Row = { k: string; v: string; yes?: boolean; flag?: boolean; plain?: boolean };
  const yn = (k: string, v: boolean, yesText = "มี"): Row => ({ k, v: v ? yesText : "ไม่มี", yes: v, flag: v });
  const groups: { title: string; icon: typeof HeartPulse; rows: Row[] }[] = [
    {
      title: "ประวัติสุขภาพ",
      icon: HeartPulse,
      rows: [
        { k: "โรคประจำตัว", v: i.conditions.join(", ") || "ไม่มี", flag: false, yes: i.conditions.length > 0 },
        { k: "ยาที่ใช้อยู่", v: i.medications.join(", ") || "ไม่มี", yes: i.medications.length > 0 },
        yn("ยาเพิ่มความเสี่ยงเลือดออก", i.bloodThinner),
        { k: "ประวัติการผ่าตัด", v: i.surgery ?? "ไม่มี", yes: !!i.surgery, flag: !!i.surgery },
        { k: "การบาดเจ็บล่าสุด", v: i.injury ?? "ไม่มี", yes: !!i.injury, flag: !!i.injury },
        { k: "การแพ้", v: i.allergy ?? "ไม่แพ้น้ำมันนวด", yes: !!i.allergy, flag: !!i.allergy },
      ],
    },
    {
      title: "ตรวจก่อนนวด",
      icon: ShieldCheck,
      rows: [
        { k: "ผิวหนังบริเวณที่นวด", v: i.skin, yes: !/ปกติ/.test(i.skin), flag: !/ปกติ/.test(i.skin) },
        yn("อาการชา / อ่อนแรง", i.numbness),
        yn("ไข้หรือการติดเชื้อ", i.fever),
        i.pregnant === null ? { k: "ตั้งครรภ์", v: "ไม่เกี่ยวข้อง" } : yn("ตั้งครรภ์", i.pregnant, "ตั้งครรภ์"),
      ],
    },
    {
      title: "การใช้ชีวิต",
      icon: Briefcase,
      rows: [
        ...(i.occupation ? [{ k: "ลักษณะงาน", v: i.occupation, plain: true }] : []),
        ...(i.history ? [{ k: "ประวัติการนวด", v: i.history, plain: true }] : []),
      ],
    },
  ];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <section className={clsx("ik ik2", compact && "ik--compact")}>
      <div className="ik2__head">
        <span className="ik__icon">
          <Smartphone size={15} />
        </span>
        <div className="ik2__title">
          <b>แบบประเมินก่อนรับบริการ</b>
          <small>จากแอป ThaiWell AI · {timeAgo(i.at)}</small>
        </div>
        <span className={clsx("ik2__status", alerts.length ? (alerts.some((a) => a.level === "stop") ? "is-stop" : "is-warn") : "is-ok")}>
          {alerts.length ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
          {alerts.length ? `ระวัง ${alerts.length} ข้อ` : "ผ่าน"}
        </span>
      </div>

      {body && <Body3D heatmap={heatmap} avoid={avoid} compact={compact} sex={sex} pain={i.pain} element={element} />}

      {alerts.length > 0 && (
        <ul className="ik__alerts">
          {alerts.map((a) => (
            <li key={a.label} className={`is-${a.level}`}>
              <ShieldAlert size={13} /> {a.label}
            </li>
          ))}
        </ul>
      )}

      {/* in the patient's words */}
      <blockquote className="ik2__quote">
        <p>“{i.complaint}”</p>
        <small>
          {i.duration} · ต้องการ{i.goal}
        </small>
      </blockquote>

      {/* measurements: 2×2 tiles with status */}
      <div className="ik3">
        <div className="ik3__tile" style={{ ["--tc" as string]: i.pain >= 7 ? "#d8392a" : i.pain >= 4 ? "#e08a1e" : "#2f9a5b" }}>
          <span className="ik3__icon">
            <Activity size={14} />
          </span>
          <small>ความปวด</small>
          <b>
            {i.pain}
            <i>/10</i>
          </b>
          <span className="ik3__bar">
            {Array.from({ length: 10 }, (_, k) => (
              <em key={k} className={k < i.pain ? "on" : undefined} />
            ))}
          </span>
        </div>
        {(() => {
          const sys = i.bp?.sys ?? 0;
          const st = !i.bp ? null : sys >= settings.bpThreshold ? ["สูง · ห้ามนวด", "#d8392a"] : sys >= 140 ? ["ค่อนข้างสูง", "#e08a1e"] : ["ปกติ", "#2f9a5b"];
          return (
            <div className="ik3__tile" style={{ ["--tc" as string]: st?.[1] ?? "#6b7a71" }}>
              <span className="ik3__icon">
                <HeartPulse size={14} />
              </span>
              <small>ความดัน</small>
              <b>
                {i.bp ? `${i.bp.sys}/${i.bp.dia}` : "—"}
                <i>mmHg</i>
              </b>
              {st && <span className="ik3__st">{st[0]}</span>}
            </div>
          );
        })()}
        {(() => {
          const pu = i.pulse;
          const st = pu === undefined ? null : pu > 100 ? ["เร็ว", "#e08a1e"] : pu < 60 ? ["ช้า", "#e08a1e"] : ["ปกติ", "#2f9a5b"];
          return (
            <div className="ik3__tile" style={{ ["--tc" as string]: st?.[1] ?? "#6b7a71" }}>
              <span className="ik3__icon">
                <Gauge size={14} />
              </span>
              <small>ชีพจร</small>
              <b>
                {pu ?? "—"}
                <i>ครั้ง/นาที</i>
              </b>
              {st && <span className="ik3__st">{st[0]}</span>}
            </div>
          );
        })()}
        <div className="ik3__tile" style={{ ["--tc" as string]: "#4c845a" }}>
          <span className="ik3__icon">
            <Hand size={14} />
          </span>
          <small>แรงนวดที่ต้องการ</small>
          <b>{i.pressure}</b>
          <span className="ik3__steps">
            {(["เบา", "ปานกลาง", "หนัก"] as const).map((lv, k) => (
              <em key={lv} className={k <= ["เบา", "ปานกลาง", "หนัก"].indexOf(i.pressure) ? "on" : undefined} />
            ))}
          </span>
        </div>
      </div>

      {body && (
        <div className="ik__areas">
          <span className="ik__lbl">เน้น</span>
          {i.focusAreas.map((a) => (
            <em key={a} className="is-focus">
              {a}
            </em>
          ))}
          {i.avoidAreas.length > 0 && (
            <>
              <span className="ik__lbl">ไม่นวด</span>
              {i.avoidAreas.map((a) => (
                <em key={a} className="is-avoid">
                  {a}
                </em>
              ))}
            </>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="ik2__groups" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            {groups
              .filter((g) => g.rows.length)
              .map((g) => (
                <div key={g.title} className="ik2__group">
                  <p className="ik2__gtitle">
                    <g.icon size={12} /> {g.title}
                  </p>
                  {g.rows.map((r) => (
                    <div key={r.k} className={clsx("ik2__row", r.flag && "is-flag", r.plain && "is-plain")}>
                      <span className={clsx("ik2__mark", r.plain ? "is-plain" : r.flag ? "is-flag" : r.yes ? "is-info" : "is-ok")}>{r.plain ? null : r.flag ? <AlertTriangle size={10} strokeWidth={2.6} /> : r.yes ? <Info size={10} strokeWidth={2.6} /> : <Check size={10} strokeWidth={3} />}</span>
                      <span className="ik2__k">{r.k}</span>
                      <span className="ik2__v">{r.v}</span>
                    </div>
                  ))}
                </div>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
      {compact && (
        <button type="button" className="ik2__more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "ย่อคำตอบ" : `ดูคำตอบทั้งหมด ${total} ข้อ`}
          <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.25s" }} />
        </button>
      )}
    </section>
  );
}
