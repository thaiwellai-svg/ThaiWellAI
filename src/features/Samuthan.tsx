import { useMemo } from "react";
import { CalendarClock, ChevronDown, Clock3, Hand, Leaf, MapPin, Sprout, Sun, Ban, Flame, Activity, ChartNoAxesColumn } from "lucide-react";
import { useStore } from "../store/store";
import { bestForElement, outcomeRows } from "../data/outcomes";
import { ELEMENT_INFO, elementProfile } from "../data/elements";
import { ELEMENTS, samuthan, type Factor } from "../data/samuthan";
import type { Patient } from "../data/types";
import { ElementIcon } from "./ElementIcon";
import { ageFrom, thaiBirth } from "./BirthDateField";
import "./samuthan.css";

const FICON: Record<Factor["key"], typeof Sun> = { birth: Sprout, age: CalendarClock, season: Sun, time: Clock3, place: MapPin };

/**
 * การแพทย์แผนไทย (หน้าผู้ป่วย): ธาตุเจ้าเรือน · ธาตุที่เสี่ยงวันนี้ (สมุฏฐาน 5 ด้าน + อาการ) · แนวทางดูแลวันนี้ · ผลจริงของคลินิก
 * ใช้ตอนแพทย์ประเมิน → พับไว้ หัวการ์ดบอกธาตุไว้แล้ว
 */
export function ThaiMedCard({ p, time }: { p: Patient; /** HH:mm of the visit (defaults to now) */ time?: string }) {
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
      <details className="tm__fold">
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
          {/* แถวบน: ธาตุเจ้าเรือน | ธาตุที่เสี่ยงวันนี้ */}
          <div className="tm__top">
            <div className="tm__box" style={{ ["--c" as string]: born.color, ["--t" as string]: born.tint }}>
              <small className="tm__cap">ธาตุเจ้าเรือน</small>
              <div className="tm__hero">
                <span className="tm__badge">
                  <ElementIcon element={prof.birth} size={22} strokeWidth={2} />
                </span>
                <div>
                  <b>ธาตุ{prof.birth}</b>
                  <span>{p.birthDate ? `เกิด ${thaiBirth(p.birthDate)} · อายุ ${ageFrom(p.birthDate) ?? p.age} ปี` : "ยังไม่ระบุวันเกิด"}</span>
                </div>
              </div>
              <p className="tm__trait">{born.trait}</p>
              <dl className="tm__kv">
                <div>
                  <dt>มักพบ</dt>
                  <dd>{born.risk}</dd>
                </div>
                <div>
                  <dt>รสยาที่เหมาะ</dt>
                  <dd>{born.taste}</dd>
                </div>
              </dl>
            </div>

            <div className="tm__box is-risk" style={{ ["--c" as string]: top.color, ["--t" as string]: top.tint }}>
              <small className="tm__cap">เสี่ยงเสียสมดุลวันนี้</small>
              <div className="tm__hero">
                <span className="tm__badge">
                  <ElementIcon element={s.top} size={22} strokeWidth={2} />
                </span>
                <div>
                  <b>ธาตุ{s.top}</b>
                  <span>{s.why.length} จาก 6 ปัจจัยชี้ไปที่ธาตุนี้</span>
                </div>
              </div>
              <div className="tm__bal">
                {ELEMENTS.map((e) => (
                  <div key={e} className={e === s.top ? "is-top" : undefined} style={{ ["--bc" as string]: ELEMENT_INFO[e].color }}>
                    <span>
                      <ElementIcon element={e} size={13} /> {e}
                    </span>
                    <i>
                      <i style={{ width: `${Math.round(s.share[e] * 100)}%` }} />
                    </i>
                    <b>{Math.round(s.share[e] * 100)}%</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* สมุฏฐาน 5 ด้าน + อาการ */}
          <div className="tm__sec">
            <h4>สมุฏฐานวินิจฉัย</h4>
            <ul className="tm__factors">
              {factors.map(({ key, Icon, title, el, label }) => {
                const c = el ? ELEMENT_INFO[el as keyof typeof ELEMENT_INFO] : undefined;
                return (
                  <li key={key} className={el === s.top ? "is-top" : undefined} style={{ ["--fc" as string]: c?.color ?? "#8a948d" }}>
                    <small>
                      <Icon size={12} /> {title}
                    </small>
                    <b>{el ? `ธาตุ${el}` : "—"}</b>
                    <em>{key === "sign" ? p.complaint || "—" : label}</em>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* แนวทางดูแลวันนี้ */}
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
