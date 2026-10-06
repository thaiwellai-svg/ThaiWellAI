import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store/store";
import { screeningFlags } from "../data/counterScreening";
import { ELEMENT_INFO, TH_MONTH, elementProfile } from "../data/elements";
import { thaiDate, todayISO } from "../data/thaiDate";
import type { Patient } from "../data/types";
import "./patient-print.css";

const cidFmt = (d?: string) => (d ? d.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, "$1-$2-$3-$4-$5") : "—");

/** One printable page (or PDF via the print sheet): patient, latest screening, element and AI plan. */
function Sheet({ p }: { p: Patient }) {
  const store = useStore();
  const s = p.screening;
  const flags = s ? screeningFlags(s, store.settings.bpThreshold) : [];
  const stop = flags.some((f) => f.level === "stop");
  const prof = elementProfile(p);
  const el = ELEMENT_INFO[prof.birth];
  const plan = p.aiPlan;
  const row = (k: string, v?: string | number | null) => (
    <tr>
      <th>{k}</th>
      <td>{v === undefined || v === null || v === "" ? "—" : v}</td>
    </tr>
  );
  return (
    <div className="pps">
      <header className="pps__head">
        <div>
          <h1>{store.settings.clinicName || "ThaiWell"}</h1>
          <p>สรุปผลคัดกรองและแผนการรักษา</p>
        </div>
        <div className="pps__date">พิมพ์เมื่อ {thaiDate(todayISO())}</div>
      </header>

      <section>
        <h2>ข้อมูลผู้รับบริการ</h2>
        <table>
          <tbody>
            {row("ชื่อ-นามสกุล", p.name)}
            {row("HN", p.hn)}
            {row("เพศ / อายุ", `${p.gender} · ${p.age} ปี`)}
            {row("วันเกิด", p.birthDate ? thaiDate(p.birthDate) : undefined)}
            {row("เลขบัตรประชาชน", cidFmt(p.citizenId))}
            {row("เบอร์โทร", p.phone)}
            {row("อาการสำคัญ", p.complaint)}
            {row("โรคประจำตัว", p.conditions.join(", ") || "ไม่มี")}
            {row("ประวัติแพ้", p.allergies?.join(", ") || "ไม่มี")}
          </tbody>
        </table>
      </section>

      <section>
        <h2>ผลคัดกรองก่อนนวด{s ? ` · ${thaiDate(s.at.slice(0, 10))}` : ""}</h2>
        {s ? (
          <>
            <p className={stop ? "pps__verdict is-stop" : flags.length ? "pps__verdict is-warn" : "pps__verdict"}>
              {stop ? "พบข้อห้าม · ต้องให้แพทย์แผนไทยประเมินก่อนนวด" : flags.length ? `ข้อควรระวัง ${flags.length} ข้อ` : "ผ่านการคัดกรอง"}
              {flags.length > 0 && <span> — {flags.map((f) => f.label).join(" · ")}</span>}
            </p>
            <table>
              <tbody>
                {row("ความดัน", s.bpSys ? `${s.bpSys}/${s.bpDia ?? "—"} mmHg` : undefined)}
                {row("ชีพจร", s.pulse ? `${s.pulse} ครั้ง/นาที` : undefined)}
                {row("ระดับปวด", s.pain != null ? `${s.pain}/10` : undefined)}
                {row("จุดที่ปวด", s.painAreas?.join(", "))}
                {row("บริเวณห้ามนวด", s.avoid)}
                {row("แรงนวดที่ต้องการ", s.pressure)}
              </tbody>
            </table>
          </>
        ) : (
          <p className="pps__muted">ยังไม่ได้คัดกรอง</p>
        )}
      </section>

      <section>
        <h2>ธาตุเจ้าเรือน · ธาตุ{prof.birth} (เกิดเดือน{TH_MONTH[prof.month - 1]})</h2>
        <table>
          <tbody>
            {row("ลักษณะ", el.trait)}
            {row("มักพบ", el.risk)}
            {row("แนวทางนวด", el.care)}
            {row("รสยาที่เหมาะ", el.taste)}
          </tbody>
        </table>
      </section>

      {plan && (
        <section>
          <h2>แผนการรักษา · {plan.approved ? "แพทย์อนุมัติแล้ว" : "ร่างโดย AI รอแพทย์อนุมัติ"}</h2>
          <p>{plan.summary}</p>
          <table>
            <tbody>
              {row("ประเภท", plan.massageType)}
              {row("จำนวน", `${plan.sessions} ครั้ง · ${plan.frequency}`)}
              {row("เป้าหมาย", plan.goals.join(" · "))}
            </tbody>
          </table>
          {plan.phases.length > 0 && (
            <ol className="pps__phases">
              {plan.phases.map((ph, i) => (
                <li key={i}>
                  <b>
                    {ph.title} ({ph.weeks})
                  </b>{" "}
                  · {store.serviceById(ph.serviceId).name} · เน้น {ph.focus} · {ph.technique}
                </li>
              ))}
            </ol>
          )}
          <table>
            <tbody>
              {row("สมุนไพร / ลูกประคบ", plan.herbs.join(", "))}
              {row("ดูแลที่บ้าน", plan.homeCare.join(" · "))}
              {row("ข้อควรระวัง", plan.precautions.join(" · "))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="pps__sign">
        <div>
          <span />
          ผู้คัดกรอง
        </div>
        <div>
          <span />
          แพทย์แผนไทยผู้ตรวจ
        </div>
      </footer>
    </div>
  );
}

/** Returns [print(), portal]; print() renders the sheet and opens the system print dialog (Save as PDF on iPad / Mac). */
export function usePatientPrint(p: Patient | null) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const done = () => setOn(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 60);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [on]);
  const node = on && p ? createPortal(<div className="pp-root">{<Sheet p={p} />}</div>, document.body) : null;
  return [() => setOn(true), node] as const;
}
