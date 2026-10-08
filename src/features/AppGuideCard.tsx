import { BookOpenCheck, Sparkles, TriangleAlert } from "lucide-react";
import type { AppGuide } from "../data/types";
import { guideFor } from "../data/treatmentGuides";
import "./app-guide.css";

/**
 * แนวทางการรักษาที่แอป ThaiWell AI แนะนำตอนผู้ป่วยประเมิน (ชุดเดียวกับที่ผู้ป่วยเห็นในแชท)
 * ชื่อโรคแผนไทย · วิธีรักษา · จุดที่นวด · ข้อควรระวัง · ที่มา — ผู้ให้บริการยืนยัน/ปรับก่อนเริ่ม
 */
export function AppGuideCard({ guide: sent, areas, compact }: { guide?: AppGuide; /** ตำแหน่งที่ปวดที่ผู้ป่วยแจ้ง — แอปรุ่นเก่าไม่ได้ส่งแนวทางมา → คำนวณจากตำราชุดเดียวกับแอป */ areas?: string[]; compact?: boolean }) {
  const derived = !sent && areas?.length ? guideFor(areas) : undefined;
  const guide: AppGuide | undefined = sent ?? (derived ? { condition: derived.condition, methods: derived.methods, points: derived.points, caution: derived.caution, ref: derived.ref } : undefined);
  if (!guide || (!guide.methods.length && !guide.condition)) return null;
  return (
    <section className={compact ? "agc is-compact" : "agc"}>
      <header>
        <span className="agc__ico">
          <Sparkles size={15} />
        </span>
        <span>
          <b>แนวทางจากแอป</b>
          <small>{sent ? "ผู้ป่วยเห็นในแอป · ผู้บำบัดปรับได้" : "จากตำแหน่งที่ผู้ป่วยแจ้ง · ผู้บำบัดปรับได้"}</small>
        </span>
      </header>
      {guide.condition && (
        <div className="agc__row">
          <small>อาการแผนไทย</small>
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
          <small>จุด / เส้น</small>
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
