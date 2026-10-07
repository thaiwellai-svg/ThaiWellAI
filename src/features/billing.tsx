import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Banknote, QrCode, Smartphone, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { baht } from "../data/thaiDate";
import { promptpayPayload } from "../data/promptpay";
import { DEMO } from "../data/mode";
import type { Appointment, Payment, PaymentMethod } from "../data/types";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  promptpay: "QR พร้อมเพย์",
  app: "บิลในแอป ThaiWell AI",
  credit: "หักเครดิตคอร์ส",
};

const METHODS: { key: PaymentMethod; label: string; desc: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "เงินสด", desc: "รับที่เคาน์เตอร์", icon: Banknote },
  { key: "promptpay", label: "QR พร้อมเพย์", desc: "สแกนจ่ายที่เคาน์เตอร์", icon: QrCode },
  { key: "app", label: "ส่งบิลเข้าแอป", desc: "จ่ายผ่าน ThaiWell AI", icon: Smartphone },
];

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
  if (!id) return <span className="vs__qr-ph" style={{ width: size, height: size, display: "grid", placeItems: "center", textAlign: "center", fontSize: 13, padding: 12 }}>ยังไม่ได้ตั้งเลขพร้อมเพย์ · ตั้งได้ที่ ตั้งค่า</span>;
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
  /** why the patient's course can't be used for this service */
  courseNote?: string;
}) {
  const { settings } = useStore();
  const byCredit = !!props.course && props.useCredit;
  const amount = byCredit ? 0 : props.price;
  const cash = Number(props.received) || 0;
  const pick = (k: PaymentMethod) => {
    if (k === "credit") props.setUseCredit(true);
    else {
      props.setUseCredit(false);
      props.setMethod(k);
    }
  };
  const current: PaymentMethod = byCredit ? "credit" : props.method;
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
      <div className={clsx("vs__methods", options.length === 4 && "is-4")} role="radiogroup" aria-label="วิธีชำระเงิน">
        {options.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={current === m.key} onClick={() => pick(m.key)}>
            <m.icon size={18} strokeWidth={1.9} />
            <b>{m.label}</b>
            <small>{m.desc}</small>
          </button>
        ))}
      </div>
      {!byCredit && (
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
              <p className={clsx("vs__change", cash >= amount && "is-ok")}>{cash >= amount ? `เงินทอน ${baht(cash - amount)} บาท` : "กรอกจำนวนเงินที่รับ"}</p>
            </div>
          )}
          {props.method === "promptpay" && (
            <div className="vs__qr">
              <PromptPayQR amount={amount} />
              <div>
                <b>{baht(amount)} บาท</b>
                <small>พร้อมเพย์ {settings.promptpayId}</small>
                <small>{settings.clinicName}</small>
                <small>ให้ผู้ป่วยสแกน แล้วตรวจสลิปก่อนกดยืนยัน</small>
              </div>
            </div>
          )}
          {props.method === "app" && (
            <div className="vs__app">
              <Smartphone size={18} />
              <p>
                ส่งบิล <b>{baht(amount)} บาท</b> ไปที่แอป ThaiWell AI ของ {props.patientName} · สถานะจะเป็น “รอชำระ” จนกว่าผู้ป่วยจะจ่ายในแอป
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
