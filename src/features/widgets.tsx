import { motion } from "framer-motion";
import { Check, TriangleAlert, X } from "lucide-react";
import { clsx } from "clsx";
import type { Screening } from "../data/types";
import type { ScreeningFlag, CreditInfo } from "../data/domain";
import { SCREENING_QUESTIONS } from "../data/domain";
import "./widgets.css";

const PAIN_COLORS = ["#22c55e", "#22c55e", "#4ade80", "#a3d65c", "#ffd54f", "#fbbf24", "#f59e0b", "#f97316", "#ef4444", "#dc2626", "#b91c1c"];
export const painColor = (n: number) => PAIN_COLORS[Math.max(0, Math.min(10, Math.round(n)))];

export function PainMeter({ score }: { score: number }) {
  return (
    <div className="pain-meter">
      <span className="pain-meter__value">
        {score}
        <small>/10</small>
      </span>
      <div className="pain-meter__bar" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <motion.span
            key={i}
            initial={{ scaleY: 0.3, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1, background: i < score ? painColor(i + 1) : "var(--sage-100)" }}
            transition={{ delay: 0.15 + i * 0.03, duration: 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

export function PainScale({ value, onChange }: { value?: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="pain-scale" role="radiogroup" aria-label="Pain score หลังรับบริการ">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            style={value === n ? { background: painColor(n) } : undefined}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="pain-scale__legend" style={{ marginTop: 6 }}>
        <span>ไม่ปวด</span>
        <span>ปวดมากที่สุด</span>
      </div>
    </div>
  );
}

export function ScreeningGrid({ screening, flags }: { screening: Screening; flags: ScreeningFlag[] }) {
  return (
    <div className="screen-grid">
      {SCREENING_QUESTIONS.map((q) => {
        const flag = flags.find((f) => f.key === q.key);
        const hit = Boolean(screening[q.key]);
        return (
          <div key={q.key} className={clsx("screen-item", hit && (flag?.level === "stop" ? "screen-item--hit" : "screen-item--warn"))}>
            <span className="screen-item__mark">{hit ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</span>
            {q.label}
            <span className="screen-item__val">
              {q.key === "highBP" && screening.bpSystolic ? `${screening.bpSystolic}` : hit ? "มี" : "ไม่มี"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ScreeningAlert({ flags }: { flags: ScreeningFlag[] }) {
  if (!flags.length)
    return (
      <div className="alert alert--ok">
        <Check size={16} strokeWidth={2.6} />
        <div>
          <b>ไม่พบข้อห้ามจากแบบคัดกรอง</b>
          วัดความดันและถามซ้ำก่อนนวด
        </div>
      </div>
    );
  const stop = flags.some((f) => f.level === "stop");
  return (
    <div className={clsx("alert", stop ? "alert--stop" : "alert--caution")}>
      <TriangleAlert size={16} strokeWidth={2.4} />
      <div>
        <b>{stop ? "ควรให้แพทย์ประเมินก่อนนวด" : "มีข้อควรระวังก่อนนวด"}</b>
        {flags.map((f) => (
          <div key={f.key}>
            • {f.label} — {f.advice}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CreditPips({ info, adding = 0, name }: { info: CreditInfo; adding?: number; name?: string }) {
  const left = Math.max(0, info.remaining - adding);
  const over = Math.max(0, info.used + info.booked + adding - info.total);
  return (
    <div className="credits">
      <div className="credits__row">
        <span className="credits__name" title={name}>
          {name ?? "คอร์สการรักษา"}
        </span>
        <span className={clsx("credits__left", over > 0 && "is-over", over === 0 && left === 0 && "is-full")}>
          {over > 0 ? `เกิน ${over} นัด` : left > 0 ? `ว่างอีก ${left} ครั้ง` : "ไม่เหลือว่าง"}
        </span>
      </div>
      <div className="credits__pips">
        {Array.from({ length: info.total }, (_, i) => {
          const kind = i < info.used ? "used" : i < info.used + info.booked ? "booked" : i < info.used + info.booked + adding ? "new" : "free";
          return (
            <motion.span
              key={i}
              layout
              className={clsx("credits__pip", kind !== "free" && `credits__pip--${kind}`)}
              initial={false}
              animate={{ scaleY: kind === "new" ? [1, 1.6, 1] : 1 }}
              transition={{ duration: 0.35 }}
            />
          );
        })}
      </div>
      <div className="credits__legend">
        <span><i style={{ background: "var(--color-brand)" }} />ใช้แล้ว {info.used}</span>
        <span><i style={{ background: "var(--status-waiting)" }} />จองไว้ {info.booked}</span>
        {adding > 0 && <span><i style={{ background: "var(--status-active)" }} />กำลังเพิ่ม {adding}</span>}
        <span><i style={{ background: "var(--white)", boxShadow: "inset 0 0 0 1px var(--color-border)" }} />ว่าง {left}</span>
      </div>
    </div>
  );
}

export function Sparkline({ points, height = 72 }: { points: { label: string; value: number }[]; height?: number }) {
  if (points.length < 2) return null;
  const w = 100;
  const pad = 8;
  const max = 10;
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / (points.length - 1));
  const ys = points.map((p) => 10 + (1 - p.value / max) * (height - 30));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x},${ys[i]}`).join(" ");
  const area = `${d} L${xs[xs.length - 1]},${height - 14} L${xs[0]},${height - 14} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label="แนวโน้มความปวด">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4c845a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#4c845a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill="url(#spark-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} />
      <motion.path
        d={d}
        fill="none"
        stroke="#4c845a"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
