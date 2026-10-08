import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Banknote, QrCode, Smartphone, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { baht } from "../data/thaiDate";
import { promptpayPayload } from "../data/promptpay";
import { DEMO } from "../data/mode";
import type { Appointment, Payment, PaymentMethod, Service } from "../data/types";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  promptpay: "QR พร้อมเพย์",
  app: "บิลในแอป ThaiWell",
  credit: "หักเครดิตคอร์ส",
};

const METHODS: { key: PaymentMethod; label: string; desc: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "เงินสด", desc: "รับที่เคาน์เตอร์", icon: Banknote },
  { key: "promptpay", label: "QR พร้อมเพย์", desc: "ผู้ป่วยสแกนจ่าย", icon: QrCode },
  { key: "app", label: "ส่งบิลเข้าแอป", desc: "ผู้ป่วยจ่ายในแอป", icon: Smartphone },
];

/** หนึ่งบรรทัดในบิล */
export interface ChargeLine {
  name: string;
  amount: number;
  note?: string;
}
/** หัตถการที่คิดเงินเพิ่ม (ไม่รวมในค่าบริการ) · บันทึกเก่าที่ไม่ได้ระบุ = รวมในค่าบริการ */
export const extraLines = (a: Pick<Appointment, "procedures">): ChargeLine[] =>
  (a.procedures ?? []).filter((p) => p.included === false && (p.price ?? 0) > 0).map((p) => ({ name: p.name, amount: p.price!, note: p.area || undefined }));
export const extraTotal = (a: Pick<Appointment, "procedures">) => extraLines(a).reduce((n, l) => n + l.amount, 0);
/** หัตถการที่คิดเพิ่มแต่ยังไม่ได้ใส่ราคา */
export const unpricedProcs = (a: Pick<Appointment, "procedures">) => (a.procedures ?? []).filter((p) => p.included === false && p.price === undefined);
/** ยอดเต็มของครั้งนี้ ก่อนหักเครดิต = ค่าบริการ + หัตถการเพิ่ม */
export const visitTotal = (s: Pick<Service, "price">, a: Pick<Appointment, "procedures">) => s.price + extraTotal(a);
/** ใช้เครดิตคอร์สจ่ายค่าบริการ (ทั้งใบ หรือเฉพาะค่าบริการ + จ่ายหัตถการเพิ่มแยก) */
export const usesCredit = (pay?: Payment) => pay?.method === "credit" || !!pay?.credit;
/** ราคาตั้งต้นของหัตถการ: ราคาที่เคยคิด → ราคาบริการชื่อเดียวกัน → ยังไม่มี */
export const defaultProcPrice = (name: string, services: Service[], remembered?: Record<string, number>) =>
  remembered?.[name] ?? services.find((s) => s.name === name || name.includes(s.name) || s.name.includes(name))?.price;

/** next running receipt number for this Buddhist year */
export function makePayment(all: Appointment[], method: PaymentMethod, amount: number, received?: number): Payment {
  const be = new Date().getFullYear() + 543;
  // เลขถัดจากใบล่าสุดของปี (รวมใบที่ยกเลิกแล้ว → ไม่ออกเลขซ้ำ)
  const nos = all.flatMap((a) => [a.payment?.no, ...(a.voidedPayments ?? []).map((v) => v.no)]).filter((no): no is string => !!no?.startsWith(`RC${be}`));
  const n = Math.max(0, ...nos.map((no) => Number(no.split("-")[1]) || 0)) + 1;
  return {
    no: `RC${be}-${String(n).padStart(6, "0")}`,
    method,
    amount,
    received,
    status: method === "app" ? "pending" : "paid",
    at: new Date().toISOString(),
  };
}

export function PromptPayQR({ amount, size = 180 }: { amount: number; size?: number }) {
  const { settings } = useStore();
  const [src, setSrc] = useState("");
  // ใช้งานจริงยังไม่ได้ตั้งเลขพร้อมเพย์ → ไม่สร้าง QR (กันโอนเข้าเลขตัวอย่าง)
  const id = settings.promptpayId || (DEMO ? "0812345678" : "");
  useEffect(() => {
    if (!id) return setSrc("");
    QRCode.toDataURL(promptpayPayload(id, amount), { margin: 1, width: size * 2, color: { dark: "#1f2a22", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [amount, id, size]);
  if (!id) return <span className="vs__qr-ph" style={{ width: size, height: size, display: "grid", placeItems: "center", textAlign: "center", fontSize: 13, padding: 12 }}>ยังไม่ได้ตั้งเลขพร้อมเพย์ (ตั้งได้ที่ ตั้งค่า)</span>;
  return src ? <img src={src} alt="QR พร้อมเพย์" width={size} height={size} /> : <span className="vs__qr-ph" style={{ width: size, height: size }} />;
}

/** bill summary + payment method picker (cash with change / PromptPay QR / bill to the app) */
export function PayPanel(props: {
  serviceName: string;
  price: number;
  course: { name: string; left: number; total: number } | null;
  useCredit: boolean;
  setUseCredit: (v: boolean) => void;
  method: PaymentMethod;
  setMethod: (m: PaymentMethod) => void;
  received: string;
  setReceived: (v: string) => void;
  patientName: string;
  /** หัตถการที่ทำเพิ่ม (คิดเงินเพิ่ม) · unpriced = ยังไม่ใส่ราคา */
  extras?: ChargeLine[];
  unpriced?: number;
  /** why the patient's course can't be used for this service */
  courseNote?: string;
}) {
  const { settings } = useStore();
  const byCredit = !!props.course && props.useCredit;
  const extras = props.extras ?? [];
  const extraSum = extras.reduce((n, l) => n + l.amount, 0);
  const amount = (byCredit ? 0 : props.price) + extraSum;
  const cash = Number(props.received) || 0;
  const pick = (k: PaymentMethod) => {
    if (k === "credit") props.setUseCredit(true);
    else {
      props.setUseCredit(false);
      props.setMethod(k);
    }
  };
  const current: PaymentMethod = byCredit ? "credit" : props.method;
  // หักเครดิตแล้วยังมีหัตถการเพิ่ม → เลือกวิธีจ่ายส่วนนั้นอีกชั้น
  const payRest = byCredit && amount > 0;
  const options = [
    ...(props.course ? [{ key: "credit" as PaymentMethod, label: "หักเครดิตคอร์ส", desc: `เหลือ ${props.course.left}/${props.course.total} ครั้ง`, icon: Ticket }] : []),
    ...METHODS,
  ];
  return (
    <>
      <div className="vs__bill">
        <div>
          <span>{props.serviceName}</span>
          <b>{baht(props.price)} ฿</b>
        </div>
        {extras.map((l, i) => (
          <div key={`${l.name}${i}`} className="vs__extra-line">
            <span>
              {l.name}
              <small>หัตถการเพิ่ม{l.note ? ` · ${l.note}` : ""}</small>
            </span>
            <b>+{baht(l.amount)} ฿</b>
          </div>
        ))}
        {byCredit && (
          <div className="vs__credit-line">
            <span>
              หักเครดิต {props.course!.name}
              <small>หลังหักเหลือ {props.course!.left - 1}/{props.course!.total} ครั้ง</small>
            </span>
            <b>−{baht(props.price)} ฿</b>
          </div>
        )}
        <div className="vs__total">
          <span>ยอดชำระ</span>
          <b>{baht(amount)} ฿</b>
        </div>
      </div>
      {props.courseNote && <p className="vs__course-note">{props.courseNote}</p>}
      {!!props.unpriced && <p className="vs__course-note is-warn">หัตถการยังไม่ใส่ราคา {props.unpriced} รายการ · ใส่ราคาก่อนรับชำระ</p>}
      {/* หักเครดิตแล้วมีหัตถการเพิ่ม → 2 แถว: แถวบน = ค่าบริการ · แถวล่าง = ค่าหัตถการเพิ่มเท่านั้น */}
      <p className="vs__methods-head">{payRest ? `จ่ายค่าบริการ ${baht(props.price)} ฿ ด้วย` : "วิธีชำระ"}</p>
      <div className={clsx("vs__methods", options.length === 4 && "is-4")} role="radiogroup" aria-label="วิธีชำระเงิน">
        {options.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={current === m.key} onClick={() => pick(m.key)}>
            <m.icon size={18} strokeWidth={1.9} />
            <b>{m.label}</b>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>
      {payRest && (
        <>
          <p className="vs__methods-head is-extra">จ่ายค่าหัตถการเพิ่ม {baht(amount)} ฿ ด้วย</p>
          <div className="vs__methods is-extra" role="radiogroup" aria-label={`จ่ายค่าหัตถการเพิ่ม ${baht(amount)} บาท`}>
            {METHODS.map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={props.method === m.key} onClick={() => props.setMethod(m.key)}>
                <m.icon size={18} strokeWidth={1.9} />
                <b>{m.label}</b>
                <small>{m.desc}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {amount > 0 && (
        <>
          {props.method === "cash" && (
            <div className="vs__cash">
              <label>
                <span>รับเงินมา</span>
                <input inputMode="numeric" value={props.received} onChange={(e) => props.setReceived(e.target.value.replace(/[^\d]/g, ""))} placeholder={String(amount)} />
                <span>฿</span>
              </label>
              <div className="vs__notes">
                {[amount, 500, 1000]
                  .filter((v, i, arr) => v >= amount && arr.indexOf(v) === i)
                  .map((v) => (
                    <button key={v} type="button" onClick={() => props.setReceived(String(v))}>
                      {v === amount ? "พอดี" : baht(v)}
                    </button>
                  ))}
              </div>
              <p className={clsx("vs__change", cash >= amount && "is-ok")}>{cash >= amount ? `เงินทอน ${baht(cash - amount)} บาท` : "ใส่จำนวนเงินที่รับ"}</p>
            </div>
          )}
          {props.method === "promptpay" && (
            <div className="vs__qr">
              <PromptPayQR amount={amount} />
              <div>
                <b>{baht(amount)} บาท</b>
                <small>พร้อมเพย์ {settings.promptpayId}</small>
                <small>{settings.clinicName}</small>
                <small>ตรวจสลิปก่อนกด “รับชำระ”</small>
              </div>
            </div>
          )}
          {props.method === "app" && (
            <div className="vs__app">
              <Smartphone size={18} />
              <p>
                ส่งบิล <b>{baht(amount)} บาท</b> เข้าแอป ThaiWell ของ {props.patientName} · รอผู้ป่วยจ่ายในแอป
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
