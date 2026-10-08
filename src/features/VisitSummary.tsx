import { clsx } from "clsx";
import type { Appointment } from "../data/types";
import { baht } from "../data/thaiDate";
import { METHOD_LABEL } from "./billing";
import "./visit-summary.css";

/** คำแนะนำที่พิมพ์/ถอดเสียงมาเป็นก้อนเดียว ("• ... • ..." หรือขึ้นบรรทัดใหม่) → ทีละข้อ */
const adviceItems = (t?: string) =>
  (t ?? "")
    .split(/\n|•/)
    .map((x) => x.replace(/^[\s\-–*\d.)]+/, "").trim())
    .filter(Boolean);

/** สรุปการรักษาของนัดที่เสร็จแล้ว: ผลลัพธ์ (ปวด · ชำระ · คอร์ส) แล้วบันทึกการรักษาทีละหัวข้อ */
export function VisitSummary({ appt, courseNo, courseTotal, courseLeft, amount }: { appt: Appointment; courseNo: number; courseTotal?: number; /** เหลือว่าง (ทั้งหมด − ใช้แล้ว − จองไว้) เหมือนการ์ดคอร์ส */ courseLeft?: number; amount: number }) {
  const pb = appt.painBefore;
  const pa = appt.painAfter;
  const delta = pa === undefined ? null : pb - pa;
  const pay = appt.payment;
  const paid = appt.paid || pay?.status === "paid";
  const payLabel = paid ? (pay ? METHOD_LABEL[pay.method] : "ชำระแล้ว") : pay?.status === "pending" ? "รอชำระในแอป" : "ค้างชำระ";
  const dx = appt.diagnoses ?? [];
  const pr = appt.procedures ?? [];
  const advice = adviceItems(appt.advice);

  return (
    <div className="vsum">
      <div className="vsum__stats">
        <div>
          <small>ปวดก่อน → หลังนวด</small>
          <b>
            {pb} → {pa ?? "–"}
          </b>
          {delta === null ? (
            <em>ยังไม่ประเมินหลังนวด</em>
          ) : (
            <em className={delta > 0 ? "is-ok" : delta < 0 ? "is-bad" : undefined}>{delta > 0 ? `ลดลง ${delta}` : delta < 0 ? `เพิ่มขึ้น ${-delta}` : "เท่าเดิม"}</em>
          )}
        </div>
        <div>
          <small>ชำระเงิน</small>
          <b>{baht(amount)} ฿</b>
          <em className={paid ? "is-ok" : "is-bad"}>{payLabel}</em>
        </div>
        {courseNo > 0 && courseTotal ? (
          <div>
            <small>คอร์ส</small>
            <b>
              ครั้งที่ {courseNo}/{courseTotal}
            </b>
            {courseNo > courseTotal ? <em className="is-bad">เกินคอร์ส</em> : <em>{!courseLeft ? "ไม่เหลือว่าง" : `ว่างอีก ${courseLeft} ครั้ง`}</em>}
          </div>
        ) : null}
      </div>

      <dl className="vsum__rows">
        <div>
          <dt>วินิจฉัย</dt>
          <dd>
            {dx.length ? (
              <ul className="vsum__chips">
                {dx.map((d) => (
                  <li key={d.name} className={clsx(d.kind === "principal" && "is-main")}>
                    {d.name}
                    {d.code && <small>{d.code}</small>}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="vsum__none">ไม่ได้ลงวินิจฉัย</span>
            )}
          </dd>
        </div>
        <div>
          <dt>หัตถการ</dt>
          <dd>
            {pr.length ? (
              <ul className="vsum__procs">
                {pr.map((x, i) => (
                  <li key={`${x.name}${i}`}>
                    <b>{x.name}</b>
                    <span>{[x.area, x.minutes ? `${x.minutes} นาที` : ""].filter(Boolean).join(" · ")}</span>
                    {x.included === false && x.price ? <em>+{baht(x.price)} ฿</em> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="vsum__none">ไม่ได้ลงหัตถการ</span>
            )}
          </dd>
        </div>
        {appt.findings?.trim() && (
          <div>
            <dt>ตรวจร่างกาย</dt>
            <dd>{appt.findings}</dd>
          </div>
        )}
        {advice.length > 0 && (
          <div>
            <dt>คำแนะนำ</dt>
            <dd>
              <ul className="vsum__advice">
                {advice.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
