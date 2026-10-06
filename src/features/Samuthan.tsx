import { useMemo } from "react";
import { CalendarClock, Clock3, Hand, Leaf, MapPin, Sprout, Sun, Ban, Flame, Activity, ChartNoAxesColumn } from "lucide-react";
import { useStore } from "../store/store";
import { bestForElement, outcomeRows } from "../data/outcomes";
import { ELEMENT_INFO } from "../data/elements";
import { ELEMENTS, samuthan, type Factor } from "../data/samuthan";
import type { Patient } from "../data/types";
import { ElementIcon } from "./ElementIcon";
import "./samuthan.css";

const FICON: Record<Factor["key"], typeof Sun> = { birth: Sprout, age: CalendarClock, season: Sun, time: Clock3, place: MapPin };

/** สมุฏฐานวินิจฉัย 5 ด้าน + อาการวันนี้ → ธาตุที่เสี่ยงเสียสมดุล และแนวทางดูแลเฉพาะคน */
export function SamuthanPanel({ p, time }: { p: Patient; /** HH:mm of the visit (defaults to now) */ time?: string }) {
  const store = useStore();
  const s = samuthan(p, { time });
  const top = ELEMENT_INFO[s.top];
  const birth = s.factors[0].element;
  // what has actually worked for patients of the same birth element in this clinic
  const evidence = useMemo(() => bestForElement(outcomeRows(store.appointments, store.patients), birth, store.services).slice(0, 3), [store.appointments, store.patients, store.services, birth]);
  return (
    <div className="smt" style={{ ["--c" as string]: top.color, ["--t" as string]: top.tint }}>
      <div className="smt__head">
        <b>สมุฏฐานวินิจฉัยวันนี้</b>
        <small>ปัจจัย 5 ด้านตามตำราแพทย์แผนไทย + อาการวันนี้</small>
      </div>
      <div className="smt__factors">
        {s.factors.map((f) => {
          const I = FICON[f.key];
          const c = ELEMENT_INFO[f.element];
          return (
            <div key={f.key} className={f.element === s.top ? "is-top" : undefined} style={{ ["--fc" as string]: c.color, ["--ft" as string]: c.tint }}>
              <small>
                <I size={12} /> {f.title}
              </small>
              <b>
                <ElementIcon element={f.element} size={14} strokeWidth={2.2} /> ธาตุ{f.element}
              </b>
              <em>{f.label}</em>
            </div>
          );
        })}
        <div className={s.signs.includes(s.top) ? "is-top" : undefined} style={{ ["--fc" as string]: s.signs.length ? ELEMENT_INFO[s.signs[0]].color : "#8a948d", ["--ft" as string]: s.signs.length ? ELEMENT_INFO[s.signs[0]].tint : "#f1f3f1" }}>
          <small>
            <Activity size={12} /> อาการวันนี้
          </small>
          <b>{s.signs.length ? s.signs.map((e) => `ธาตุ${e}`).join(" · ") : "ไม่ชัดเจน"}</b>
          <em>{p.complaint || "—"}</em>
        </div>
      </div>

      <div className="smt__main">
        <div className="smt__bal">
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
        <div className="smt__verdict">
          <span className="smt__badge">
            <ElementIcon element={s.top} size={22} strokeWidth={2} />
          </span>
          <div>
            <small>ธาตุที่เสี่ยงเสียสมดุลตอนนี้</small>
            <b>ธาตุ{s.top}</b>
            <p>เพราะ {s.why.join(" · ")} ชี้ไปที่ธาตุ{s.top}</p>
          </div>
        </div>
      </div>

      <div className="smt__plan">
        <div>
          <Hand size={14} />
          <small>การนวด</small>
          <p>{s.plan.massage}</p>
        </div>
        <div>
          <Flame size={14} />
          <small>ประคบ / อบ</small>
          <p>{s.plan.compress}</p>
        </div>
        <div>
          <Leaf size={14} />
          <small>สมุนไพรแนะนำ</small>
          <p>{s.plan.herbs}</p>
        </div>
        <div>
          <Ban size={14} />
          <small>ควรหลีกเลี่ยง</small>
          <p>{s.plan.avoid}</p>
        </div>
      </div>
      {evidence.length > 0 && (
        <div className="smt__ev">
          <small>
            <ChartNoAxesColumn size={13} /> ได้ผลดีที่สุดกับผู้ป่วยธาตุ{birth}ในคลินิกนี้
          </small>
          {evidence.map((x, i) => (
            <span key={x.service.id} className={i === 0 ? "is-top" : undefined}>
              <b>{x.service.name}</b> ปวดลด {x.mean.toFixed(1)} · {x.n} ครั้ง
            </span>
          ))}
        </div>
      )}
      <p className="smt__note">
        ข้อมูลประกอบการตัดสินใจ แพทย์แผนไทยต้องยืนยันก่อนใช้{!s.placeKnown ? " · ยังไม่มีที่อยู่ ใช้ภาคกลางเป็นค่าเริ่มต้น" : ""}
      </p>
    </div>
  );
}
