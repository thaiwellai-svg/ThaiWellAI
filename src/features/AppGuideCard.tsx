import { BookOpenCheck, Sparkles, TriangleAlert } from "lucide-react";
import type { AppGuide } from "../data/types";
import "./app-guide.css";

/**
 * แนวทางการรักษาที่แอป ThaiWell AI แนะนำตอนผู้ป่วยประเมิน (ชุดเดียวกับที่ผู้ป่วยเห็นในแชท)
 * ชื่อโรคแผนไทย · วิธีรักษา · จุดที่นวด · ข้อควรระวัง · ที่มา — ผู้ให้บริการยืนยัน/ปรับก่อนเริ่ม
 */
export function AppGuideCard({ guide, compact }: { guide?: AppGuide; compact?: boolean }) {
  if (!guide || (!guide.methods.length && !guide.condition)) return null;
  return (
    <section className={compact ? "agc is-compact" : "agc"}>
      <header>
        <span className="agc__ico">
          <Sparkles size={15} />
        </span>
        <span>
          <b>แนวทางการรักษาที่แอปแนะนำ</b>
          <small>ผู้ป่วยเห็นแนวทางนี้ในแอป · ผู้ให้บริการยืนยันหรือปรับก่อนเริ่ม</small>
        </span>
      </header>
      {guide.condition && (
        <div className="agc__row">
          <small>อาการตามแพทย์แผนไทย</small>
          <b>{guide.condition}</b>
        </div>
      )}
      {guide.methods.length > 0 && (
        <div className="agc__row">
          <small>วิธีรักษา</small>
          <ul>
            {guide.methods.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {guide.points.length > 0 && (
        <div className="agc__row">
          <small>จุด / เส้นที่แนะนำ</small>
          <div className="agc__chips">
            {guide.points.map((p) => (
              <em key={p}>{p}</em>
            ))}
          </div>
        </div>
      )}
      {guide.caution && (
        <p className="agc__warn">
          <TriangleAlert size={14} />
          <span>{guide.caution}</span>
        </p>
      )}
      {guide.ref && (
        <p className="agc__ref">
          <BookOpenCheck size={13} /> {guide.ref}
        </p>
      )}
    </section>
  );
}
