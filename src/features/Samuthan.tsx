import { useMemo } from "react";
import { CalendarClock, ChevronDown, Clock3, Hand, Leaf, MapPin, Sprout, Sun, Ban, Flame, Activity, ChartNoAxesColumn } from "lucide-react";
import { useStore } from "../store/store";
import { bestForElement, outcomeRows } from "../data/outcomes";
import { ELEMENT_INFO, elementProfile } from "../data/elements";
import { ELEMENTS, samuthan, type Factor } from "../data/samuthan";
import type { Patient } from "../data/types";
import { ElementIcon } from "./ElementIcon";
import { ageFrom, thaiBirth } from "./BirthDateField";
import { clsx } from "clsx";
import dinArt from "../assets/elements/din.png";
import "./samuthan.css";

/** ภาพประกอบธาตุ (Figma) — ยังมีเฉพาะธาตุดิน ธาตุอื่นใช้พื้นไล่สีตามธาตุ */
const ART: Partial<Record<"ดิน" | "น้ำ" | "ลม" | "ไฟ", string>> = { ดิน: dinArt };

const FICON: Record<Factor["key"], typeof Sun> = { birth: Sprout, age: CalendarClock, season: Sun, time: Clock3, place: MapPin };

/**
 * การแพทย์แผนไทย (หน้าผู้ป่วย): ธาตุเจ้าเรือน · ธาตุที่เสี่ยงวันนี้ (สมุฏฐาน 5 ด้าน + อาการ) · แนวทางดูแลวันนี้ · ผลจริงของคลินิก
 * ใช้ตอนแพทย์ประเมิน → พับไว้ หัวการ์ดบอกธาตุไว้แล้ว
 */
export function ThaiMedCard({ p, time, open }: { p: Patient; /** HH:mm of the visit (defaults to now) */ time?: string; /** เปิดไว้ตั้งแต่แรก */ open?: boolean }) {
  const store = useStore();
  const prof = elementProfile(p);
  const born = ELEMENT_INFO[prof.birth];
  const s = samuthan(p, { time });
  const top = ELEMENT_INFO[s.top];
  // what has actually worked for patients of the same birth element in this clinic
  const evidence = useMemo(() => bestForElement(outcomeRows(store.appointments, store.patients), prof.birth, store.services).slice(0, 3), [store.appointments, store.patients, store.services, prof.birth]);
  const factors = [
    ...s.factors.map((f) => ({ key: f.key, Icon: FICON[f.key], title: f.title, el: f.element as string | undefined, label: f.label })),
    { key: "sign", Icon: Activity, title: "อาการวันนี้", el: s.signs[0] as string | undefined, label: s.signs.length ? s.signs.map((e) => `ธาตุ${e}`).join(" · ") : "ไม่ชัดเจน" },
  ];
  return (
    <section className="pd__card pd__card--wide pd2 tm">
      <details className="tm__fold" open={open}>
        <summary className="pd2__h">
          <span className="pd2__i" style={{ ["--c" as string]: born.color }}>
            <ElementIcon element={prof.birth} size={15} />
          </span>
          การแพทย์แผนไทย
          <span className="tm__tags">
            <em style={{ ["--c" as string]: born.color, ["--t" as string]: born.tint }}>ธาตุ{prof.birth}</em>
            {s.top !== prof.birth && <em style={{ ["--c" as string]: top.color, ["--t" as string]: top.tint }}>เสี่ยง ธาตุ{s.top}</em>}
          </span>
          <ChevronDown size={16} className="tm__chev" />
        </summary>

        <div className="tm__body">
          {/* ฮีโร่ธาตุเจ้าเรือน (Figma ThaiWell 225:36): ภาพธาตุ · วงกลมไอคอน · ชื่อธาตุ · มักพบ/รสยา · สมดุลวันนี้ */}
          <div className={clsx("tm4", ART[prof.birth] && "has-art")} style={{ ["--c" as string]: born.color, ["--t" as string]: born.tint, ["--rc" as string]: top.color }}>
            {ART[prof.birth] && <img className="tm4__art" src={ART[prof.birth]} alt="" aria-hidden />}
            <span className="tm4__orb">
              <ElementIcon element={prof.birth} size={44} strokeWidth={1.8} />
            </span>
            <div className="tm4__name">
              <b>ธาตุ{prof.birth}</b>
              <span>{born.trait}</span>
            </div>
            <dl className="tm4__rows">
              <div>
                <dt>เกิด</dt>
                <dd>{p.birthDate ? `${thaiBirth(p.birthDate)} · อายุ ${ageFrom(p.birthDate) ?? p.age} ปี` : "ยังไม่ระบุวันเกิด"}</dd>
              </div>
              <div>
                <dt>มักพบ</dt>
                <dd>{born.risk}</dd>
              </div>
              <div>
                <dt>รสยา</dt>
                <dd>{born.taste}</dd>
              </div>
            </dl>
            <div className="tm4__bal">
              <div className="tm3__balh">
                <small>สมดุลวันนี้</small>
                <em>
                  เสี่ยง ธาตุ{s.top} · {s.why.length}/6 ปัจจัย
                </em>
              </div>
              <div className="tm3__bar" role="img" aria-label={ELEMENTS.map((e) => `${e} ${Math.round(s.share[e] * 100)}%`).join(" ")}>
                {ELEMENTS.filter((e) => s.share[e] > 0).map((e) => (
                  <i key={e} className={e === s.top ? "is-top" : undefined} style={{ width: `${s.share[e] * 100}%`, ["--bc" as string]: ELEMENT_INFO[e].color }} />
                ))}
              </div>
              <ul className="tm3__legend">
                {ELEMENTS.map((e) => (
                  <li key={e} className={e === s.top ? "is-top" : undefined} style={{ ["--bc" as string]: ELEMENT_INFO[e].color }}>
                    <i />
                    {e} <b>{Math.round(s.share[e] * 100)}%</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* แนวทางดูแลวันนี้ (ใช้ตอนรักษา) */}
          <div className="tm__sec">
            <h4>แนวทางดูแลวันนี้</h4>
            <div className="tm__plan">
              {(
                [
                  [Hand, "การนวด", s.plan.massage],
                  [Flame, "ประคบ / อบ", s.plan.compress],
                  [Leaf, "สมุนไพร", s.plan.herbs],
                  [Ban, "ควรเลี่ยง", s.plan.avoid],
                ] as const
              ).map(([I, label, text]) => (
                <div key={label} className={label === "ควรเลี่ยง" ? "is-avoid" : undefined}>
                  <small>
                    <I size={13} /> {label}
                  </small>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* สมุฏฐาน 5 ด้าน + อาการ: รายการ (ที่มาของ "สมดุลวันนี้") */}
          <div className="tm__sec">
            <h4>สมุฏฐานวินิจฉัย</h4>
            <ul className="tm3__list">
              {factors.map(({ key, Icon, title, el, label }) => {
                const c = el ? ELEMENT_INFO[el as keyof typeof ELEMENT_INFO] : undefined;
                return (
                  <li key={key} className={el === s.top ? "is-top" : undefined} style={{ ["--fc" as string]: c?.color ?? "#8a948d", ["--ft" as string]: c?.tint ?? "var(--sage-50)" }}>
                    <Icon size={15} />
                    <span>
                      <b>{title}</b>
                      <small>{key === "sign" ? p.complaint || "—" : label}</small>
                    </span>
                    <em>{el ? `ธาตุ${el}` : "—"}</em>
                  </li>
                );
              })}
            </ul>
          </div>

          {evidence.length > 0 && (
            <div className="tm__sec">
              <h4>
                <ChartNoAxesColumn size={13} /> ได้ผลดีกับธาตุ{prof.birth} ในคลินิกนี้
              </h4>
              <ol className="tm__ev">
                {evidence.map((x, i) => (
                  <li key={x.service.id} className={i === 0 ? "is-top" : undefined}>
                    <i>{i + 1}</i>
                    <b>{x.service.name}</b>
                    <span>
                      ปวดลด {x.mean.toFixed(1)} · {x.n} ครั้ง
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="tm__note">ข้อมูลประกอบ แพทย์ต้องยืนยันก่อนใช้{!s.placeKnown ? " · ไม่มีที่อยู่ ใช้ภาคกลาง" : ""}</p>
        </div>
      </details>
    </section>
  );
}
