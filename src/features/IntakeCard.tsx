import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, Briefcase, Check, ChevronDown, Gauge, Hand, HeartPulse, Info, Minus, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { timeAgo } from "../data/thaiDate";
import { intakeAlerts } from "../data/intake";
import type { Intake, Screening } from "../data/types";
import { SCREENING_QUESTIONS, type ScreeningFlag } from "../data/domain";
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

export function IntakeCard({
  intake: i,
  compact,
  sex,
  element,
  body = true,
  head = true,
  screening,
  screeningFlags = [],
}: {
  intake: Intake;
  compact?: boolean;
  sex?: "ชาย" | "หญิง";
  element?: Element;
  /** show the 3D body (off when the page already shows it) */ body?: boolean;
  /** หัวการ์ด (ปิดเมื่อหน้านั้นมีหัวข้อของตัวเองแล้ว) */ head?: boolean;
  /** แบบคัดกรองของคำขอ → รวมเป็นผลประเมินเดียว (สรุปบนสุด · รายข้อในคำตอบทั้งหมด) ไม่แสดงซ้ำ */
  screening?: Screening;
  screeningFlags?: ScreeningFlag[];
}) {
  const { settings } = useStore();
  const [open, setOpen] = useState(!compact);
  const alerts = intakeAlerts(i, settings.bpThreshold);
  const { heatmap, avoid } = intakeBody(i);
  // grouped answers; `flag` marks an answer that needs attention
  type Row = { k: string; v: string; yes?: boolean; flag?: boolean; plain?: boolean; f?: string; none?: boolean };
  // ข้อที่ผู้ป่วยตอบมาจริง (ไม่ได้ถาม = ไม่แสดง แทนการเดาว่า "ไม่มี")
  const has = (f: string) => !i.asked || i.asked.includes(f);
  const yn = (k: string, v: boolean, yesText = "มี"): Row => ({ k, v: v ? yesText : "ไม่มี", yes: v, flag: v });
  const groups: { title: string; icon: typeof HeartPulse; rows: Row[] }[] = [
    {
      title: "ประวัติสุขภาพ",
      icon: HeartPulse,
      rows: [
        { k: "โรคประจำตัว", v: i.conditions.join(", ") || "ไม่มี", flag: false, yes: i.conditions.length > 0, f: "conditions" },
        { k: "ยาที่ใช้อยู่", v: i.medications.join(", ") || "ไม่มี", yes: i.medications.length > 0, f: "medications" },
        { ...yn("ยาเพิ่มความเสี่ยงเลือดออก", i.bloodThinner), f: "bloodThinner" },
        { k: "ประวัติการผ่าตัด", v: i.surgery ?? "ไม่มี", yes: !!i.surgery, flag: !!i.surgery, f: "surgery" },
        { k: "การบาดเจ็บล่าสุด", v: i.injury ?? "ไม่มี", yes: !!i.injury, flag: !!i.injury, f: "injury" },
        { k: "การแพ้", v: i.allergy ?? "ไม่แพ้น้ำมันนวด", yes: !!i.allergy, flag: !!i.allergy, f: "allergy" },
      ],
    },
    {
      title: "ตรวจก่อนนวด",
      icon: ShieldCheck,
      rows: [
        { k: "ผิวหนังบริเวณที่นวด", v: i.skin, yes: !/ปกติ/.test(i.skin), flag: !/ปกติ/.test(i.skin), f: "skin" },
        { ...yn("อาการชา / อ่อนแรง", i.numbness), f: "numbness" },
        { ...yn("ไข้หรือการติดเชื้อ", i.fever), f: "screening" },
        { ...(i.pregnant === null ? { k: "ตั้งครรภ์", v: "ไม่เกี่ยวข้อง" } : yn("ตั้งครรภ์", i.pregnant, "ตั้งครรภ์")), f: "screening" },
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
  const screened = has("screening");
  if (screening) {
    groups.unshift({ title: "คัดกรองก่อนนวด", icon: ShieldCheck, rows: SCREENING_QUESTIONS.map((q) => ({ ...yn(q.label, !!screening[q.key]), f: "screening" })) });
    // ไข้ / ตั้งครรภ์ อยู่ในข้อคัดกรองแล้ว
    groups[2].rows = groups[2].rows.filter((r) => !/ไข้|ตั้งครรภ์/.test(r.k));
  }
  // ข้อที่ผู้ป่วยไม่ได้ตอบ → "ไม่ได้ประเมิน" (ไม่เดาว่า "ไม่มี")
  for (const g of groups) g.rows = g.rows.map((r) => (r.f && !has(r.f) ? { k: r.k, v: "ไม่ได้ประเมิน", none: true } : r));
  // ผลรวมของคัดกรอง + คำตอบที่ต้องระวัง (ไม่ซ้ำ)
  const verdict = screening ? [...(screened ? screeningFlags : []).map((f) => ({ label: f.label, level: f.level === "stop" ? "stop" : "warn" })), ...alerts].filter((a, k, arr) => arr.findIndex((x) => x.label === a.label) === k) : null;
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <section className={clsx("ik ik2", compact && "ik--compact", screening && "ik--merged")}>
      {head && <div className="ik2__head">
        <span className="ik__icon">
          <Smartphone size={15} />
        </span>
        <div className="ik2__title">
          <b>แบบประเมินก่อนนวด</b>
          <small>ประเมินเมื่อ {timeAgo(i.at)}</small>
        </div>
        <span className={clsx("ik2__status", alerts.length ? (alerts.some((a) => a.level === "stop") ? "is-stop" : "is-warn") : "is-ok")}>
          {alerts.length ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
          {alerts.length ? `ระวัง ${alerts.length} ข้อ` : "ผ่าน"}
        </span>
      </div>}

      {verdict && (
        <div className={clsx("ik2__verdict", verdict.length ? (verdict.some((a) => a.level === "stop") ? "is-stop" : "is-warn") : screened ? "is-ok" : "is-warn")}>
          {verdict.length || !screened ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
          {!screened && !verdict.length ? (
            <span>
              <b>ไม่ได้ประเมินข้อห้าม</b> คัดกรองที่เคาน์เตอร์ก่อนนวด (ไข้ ความดัน ตั้งครรภ์ ผ่าตัด)
            </span>
          ) : verdict.length ? (
            <span>
              <b>{verdict.some((a) => a.level === "stop") ? "พบข้อห้าม" : "ข้อควรระวัง"}</b> {verdict.map((a) => a.label).join(" · ")}
            </span>
          ) : (
            <span>
              <b>ผ่านคัดกรอง</b> ไม่พบข้อห้าม · วัดความดันอีกครั้งก่อนนวด
            </span>
          )}
        </div>
      )}

      {!verdict && body && <Body3D heatmap={heatmap} avoid={avoid} compact={compact} sex={sex} pain={i.pain} element={element} />}

      {!verdict && alerts.length > 0 && (
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
        {(has("duration") && i.duration && i.duration !== "-") || has("goal") ? (
          <small>{[has("duration") && i.duration !== "-" ? i.duration : "", has("goal") ? `ต้องการ${i.goal}` : ""].filter(Boolean).join(" · ")}</small>
        ) : null}
      </blockquote>

      {/* measurements: 2×2 tiles with status */}
      <div className="ik3">
        <div className="ik3__tile" style={{ ["--tc" as string]: i.pain >= 7 ? "#d8392a" : i.pain >= 4 ? "#e08a1e" : "#2f9a5b" }}>
          <span className="ik3__icon">
            <Activity size={14} />
          </span>
          <small>ปวด</small>
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
          <small>แรงนวด</small>
          <b>{has("pressure") ? i.pressure : "—"}</b>
          {!has("pressure") && <span className="ik3__st ik3__st--none">ไม่ได้ประเมิน</span>}
          {has("pressure") && <span className="ik3__steps">
            {(["เบา", "ปานกลาง", "หนัก"] as const).map((lv, k) => (
              <em key={lv} className={k <= ["เบา", "ปานกลาง", "หนัก"].indexOf(i.pressure) ? "on" : undefined} />
            ))}
          </span>}
        </div>
      </div>

      {verdict && body && <Body3D heatmap={heatmap} avoid={avoid} compact={compact} sex={sex} element={element} />}

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
                    <div key={r.k} className={clsx("ik2__row", r.flag && "is-flag", r.plain && "is-plain", r.none && "is-none")}>
                      <span className={clsx("ik2__mark", r.none ? "is-none" : r.plain ? "is-plain" : r.flag ? "is-flag" : r.yes ? "is-info" : "is-ok")}>{r.none ? <Minus size={10} strokeWidth={3} /> : r.plain ? null : r.flag ? <AlertTriangle size={10} strokeWidth={2.6} /> : r.yes ? <Info size={10} strokeWidth={2.6} /> : <Check size={10} strokeWidth={3} />}</span>
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
