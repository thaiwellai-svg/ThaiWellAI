import { useId } from "react";
import { clsx } from "clsx";
import "./body-map.css";

/** body regions in the clinic's vocabulary (same words as procedure areas & the app's intake form) */
export const BODY_AREAS = ["ศีรษะ", "คอ", "บ่า", "ไหล่", "แขน", "อก", "ท้อง", "หลังส่วนบน", "หลังส่วนล่าง", "สะโพก", "ขา", "เข่า", "เท้า"] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

/** map free-text answers ("เอวส่วนล่าง", "ฝ่าเท้า", …) onto a region */
export function toArea(s: string): BodyArea | null {
  if ((BODY_AREAS as readonly string[]).includes(s)) return s as BodyArea;
  if (/เอว|หลังล่าง/.test(s)) return "หลังส่วนล่าง";
  if (/สะบัก|หลังบน/.test(s)) return "หลังส่วนบน";
  if (/หัว|ขมับ/.test(s)) return "ศีรษะ";
  if (/เท้า|ส้น/.test(s)) return "เท้า";
  if (/น่อง|ต้นขา/.test(s)) return "ขา";
  if (/มือ|ศอก/.test(s)) return "แขน";
  if (/ก้น/.test(s)) return "สะโพก";
  if (/หน้าท้อง|พุง/.test(s)) return "ท้อง";
  if (/หน้าอก/.test(s)) return "อก";
  return null;
}

/** ข้อความรวมหลายบริเวณจากแอป ("ปวดคอ-บ่า", "ศีรษะ/ใบหน้า", "หลังและเอว") → ทุกบริเวณที่พูดถึง */
export function toAreas(s: string): BodyArea[] {
  const one = toArea(s.trim());
  if (one) return [one];
  const out = new Set<BodyArea>();
  for (const part of s.split(/[-/,·|]|และ|\s+/)) {
    const r = toArea(part.replace(/^(ปวด|เจ็บ|ตึง|เมื่อย|ชา)/, "").trim());
    if (r) out.add(r);
  }
  // คำที่อยู่ในประโยค (ไม่ได้คั่นด้วยเครื่องหมาย)
  for (const a of BODY_AREAS) if (s.includes(a)) out.add(a);
  if (/ใบหน้า|หน้าผาก|ขมับ|หัว/.test(s)) out.add("ศีรษะ");
  if (/เอว|หลังล่าง/.test(s)) out.add("หลังส่วนล่าง");
  if (/สะบัก/.test(s)) out.add("หลังส่วนบน");
  // "หลัง" ลอย ๆ = หลังส่วนบน (ถ้ายังไม่ได้ระบุส่วนไหน)
  if (/หลัง/.test(s) && !out.has("หลังส่วนบน") && !out.has("หลังส่วนล่าง")) out.add("หลังส่วนบน");
  return [...out];
}

type E = [cx: number, cy: number, rx: number, ry: number];
// regions on a 120×262 figure; paired limbs listed twice
const FRONT: Partial<Record<BodyArea, E[]>> = {
  ศีรษะ: [[60, 22, 11, 13]],
  คอ: [[60, 42, 6, 5]],
  ไหล่: [[34, 56, 8, 7], [86, 56, 8, 7]],
  อก: [[60, 70, 18, 10]],
  ท้อง: [[60, 104, 15, 14]],
  แขน: [[22, 92, 6, 20], [98, 92, 6, 20]],
  ขา: [[49, 168, 8, 22], [71, 168, 8, 22]],
  เข่า: [[50, 203, 6, 7], [70, 203, 6, 7]],
  เท้า: [[48, 251, 7, 4], [72, 251, 7, 4]],
};
const BACK: Partial<Record<BodyArea, E[]>> = {
  ศีรษะ: [[60, 22, 11, 13]],
  คอ: [[60, 42, 6, 5]],
  บ่า: [[46, 52, 10, 5], [74, 52, 10, 5]],
  ไหล่: [[34, 58, 8, 7], [86, 58, 8, 7]],
  หลังส่วนบน: [[60, 74, 17, 12]],
  หลังส่วนล่าง: [[60, 108, 14, 10]],
  สะโพก: [[49, 130, 10, 8], [71, 130, 10, 8]],
  แขน: [[22, 92, 6, 20], [98, 92, 6, 20]],
  ขา: [[49, 176, 8, 22], [71, 176, 8, 22]],
  เข่า: [[50, 204, 6, 6], [70, 204, 6, 6]],
  เท้า: [[48, 251, 7, 4], [72, 251, 7, 4]],
};

const mirror = (d: string) => d; // paths below are drawn symmetric by hand
const SILHOUETTE = [
  // torso
  "M34,49 Q60,41 86,49 Q92,52 91,62 Q88,95 83,128 Q60,138 37,128 Q32,95 29,62 Q28,52 34,49 Z",
  // arms
  "M30,52 Q21,55 19,70 L13,126 Q12,135 17,140 Q22,141 23,134 L31,84 Z",
  "M90,52 Q99,55 101,70 L107,126 Q108,135 103,140 Q98,141 97,134 L89,84 Z",
  // legs
  "M38,124 Q49,136 59,132 L57,200 L55,246 Q54,254 47,255 Q40,255 41,247 L41,200 Z",
  "M82,124 Q71,136 61,132 L63,200 L65,246 Q66,254 73,255 Q80,255 79,247 L79,200 Z",
].map(mirror);

/** heat colour for 0–1 */
const heat = (v: number) => (v >= 0.7 ? "#e5533d" : v >= 0.45 ? "#f08a2c" : "#f4c542");

export function BodyMap({
  heatmap = {},
  avoid = [],
  selected = [],
  onToggle,
  compact,
}: {
  /** area → intensity 0–1 */
  heatmap?: Partial<Record<BodyArea, number>>;
  avoid?: BodyArea[];
  /** interactive selection (procedure areas) */
  selected?: string[];
  onToggle?: (area: BodyArea) => void;
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const figure = (side: "front" | "back", dx: number) => {
    const regions = side === "front" ? FRONT : BACK;
    return (
      <g transform={`translate(${dx} 0)`}>
        {/* silhouette */}
        <g className="bm__body">
          <ellipse cx={60} cy={22} rx={14} ry={17} />
          <rect x={53} y={34} width={14} height={14} rx={5} />
          {SILHOUETTE.map((d, k) => (
            <path key={k} d={d} />
          ))}
        </g>
        {side === "back" && <path className="bm__spine" d="M60,48 L60,126" />}
        {/* heat blobs */}
        <g filter={`url(#bm-blur-${uid})`}>
          {Object.entries(regions).map(([area, es]) => {
            const v = heatmap[area as BodyArea];
            if (!v) return null;
            return es!.map((e, k) => <ellipse key={area + k} className="bm__heat" cx={e[0]} cy={e[1]} rx={e[2] * 1.35} ry={e[3] * 1.35} fill={heat(v)} opacity={0.45 + v * 0.5} />);
          })}
        </g>
        {/* do-not-massage */}
        {avoid.map((area) =>
          (regions[area] ?? []).map((e, k) => <ellipse key={area + k} className="bm__avoid" cx={e[0]} cy={e[1]} rx={e[2] + 2} ry={e[3] + 2} fill={`url(#bm-hatch-${uid})`} />),
        )}
        {/* selection / hit areas */}
        {Object.entries(regions).map(([area, es]) =>
          es!.map((e, k) => (
            <ellipse
              key={area + k}
              className={clsx("bm__hit", selected.includes(area) && "is-on", onToggle && "is-live")}
              cx={e[0]}
              cy={e[1]}
              rx={e[2] + 1}
              ry={e[3] + 1}
              onClick={onToggle ? () => onToggle(area as BodyArea) : undefined}
            >
              <title>{area}</title>
            </ellipse>
          )),
        )}
      </g>
    );
  };

  return (
    <div className={clsx("bm", compact && "bm--compact")}>
      <svg viewBox="0 0 252 272" className="bm__svg" role="img" aria-label="แผนที่ตำแหน่งบนร่างกาย">
        <defs>
          <filter id={`bm-blur-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <pattern id={`bm-hatch-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="rgba(229,83,61,0.12)" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#e5533d" strokeWidth="1.4" />
          </pattern>
        </defs>
        {figure("front", 2)}
        {figure("back", 130)}
        <text x={62} y={270} className="bm__cap">
          ด้านหน้า
        </text>
        <text x={190} y={270} className="bm__cap">
          ด้านหลัง
        </text>
      </svg>
      {Object.keys(heatmap).length > 0 && (
        <div className="bm__legend">
          <span className="bm__scale">
            <i />
            ปวดน้อย → มาก
          </span>
          {avoid.length > 0 && (
            <span className="bm__no">
              <i /> ไม่นวด
            </span>
          )}
        </div>
      )}
    </div>
  );
}
