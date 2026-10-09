import { useEffect, useState } from "react";
import { Check, QrCode, Ticket, Wallet } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Button, Dialog, Field, Input, useToast } from "../design-system";
import { baht } from "../data/thaiDate";
import type { Patient, PaymentMethod } from "../data/types";
import type { PackageSale } from "../data/biz";

const runNo = (prefix: string, n: number) => `${prefix}${new Date().getFullYear() + 543}-${String(n).padStart(5, "0")}`;

/**
 * วิธีชำระคอร์ส เลือกตอนชำระครั้งแรก: จ่ายรายครั้ง หรือจ่ายทั้งคอร์สล่วงหน้า (ครั้งนี้ + ครั้งที่เหลือ → ครั้งต่อไปหักเครดิต)
 */
export function CoursePayChoice({ p, left, price, onPrepay }: { p: Patient; /** ครั้งที่ต้องจ่าย (รวมครั้งนี้) */ left: number; price: number; onPrepay: () => void }) {
  const store = useStore();
  const c = p.course!;
  return (
    <div className="cpc">
      <div className="cpc__head">
        <Ticket size={16} />
        <span>
          <b>{c.name}</b>
          <small>ชำระครั้งแรกของคอร์ส · เลือกวิธีชำระ</small>
        </span>
      </div>
      <div className={c.payPlan === "full" ? "cpc__opts is-full-first" : "cpc__opts"}>
        <button type="button" onClick={() => store.dispatch({ type: "updatePatient", id: p.id, patch: { course: { ...c, billing: "perVisit" } } })}>
          <b>จ่ายรายครั้ง</b>
          <span>ครั้งนี้ {baht(price)} ฿ · มาครั้งต่อไปจ่ายตอนมา</span>
        </button>
        <button type="button" className={c.payPlan === "full" ? "is-plan" : undefined} onClick={onPrepay}>
          <b>จ่ายทั้งคอร์สล่วงหน้า{c.payPlan === "full" && <em>ตามแผน</em>}</b>
          <span>
            {left} ครั้ง · {baht(left * price)} ฿ · ครั้งต่อไปหักเครดิต
          </span>
        </button>
      </div>
    </div>
  );
}

/** จ่ายทั้งคอร์สล่วงหน้า: บันทึกเป็นการขาย (ปิดยอด/รายงานนับเงิน) แล้วคอร์สเป็นชำระล่วงหน้า */
export function PrepayCourseDialog({ p, left, price, open, onClose }: { p: Patient; left: number; price: number; open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  useEffect(() => {
    if (open) {
      setDiscount("");
      setMethod("cash");
    }
  }, [open]);
  if (!p.course) return null;
  const c = p.course;
  const full = left * price;
  const net = Math.max(0, full - (Number(discount) || 0));

  const confirm = () => {
    const at = new Date().toISOString();
    const n = store.biz.seq.sale + 1;
    const sale: PackageSale = {
      id: `ps${Date.now().toString(36)}`,
      no: runNo("PK", n),
      at,
      patientId: p.id,
      packageId: "course",
      name: `${c.name} · ชำระล่วงหน้า ${left} ครั้ง`,
      price: full,
      discount: full - net,
      net,
      payments: net > 0 ? [{ at, amount: net, method, kind: "full" }] : [],
      member: !!p.member,
      by: store.settings.staffName,
    };
    store.dispatch({ type: "biz", log: `ชำระคอร์สล่วงหน้า ${c.name} ${left} ครั้ง · ${baht(net)} บาท`, patientId: p.id, update: (b) => ({ ...b, sales: [sale, ...b.sales], seq: { ...b.seq, sale: n } }) });
    store.dispatch({ type: "updatePatient", id: p.id, patch: { course: { ...c, billing: "prepaid" } } });
    toast({ message: `รับชำระคอร์สล่วงหน้า ${baht(net)} บาท · ครั้งนี้หักเครดิต` });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="sp"
      title="จ่ายทั้งคอร์สล่วงหน้า"
      subtitle={`${p.name} · ${c.name}`}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="md" leading={<Check size={16} />} onClick={confirm}>
            รับชำระ {baht(net)} บาท
          </Button>
        </>
      }
    >
      <div className="cpc__sum">
        <span>
          {left} ครั้ง × {baht(price)} ฿
        </span>
        <b>{baht(full)} ฿</b>
      </div>
      <Field label="ส่วนลด (บาท)">
        <Input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" />
      </Field>
      <div className="cpc__methods">
        {(
          [
            ["cash", "เงินสด", Wallet],
            ["promptpay", "QR พร้อมเพย์", QrCode],
          ] as const
        ).map(([k, label, Icon]) => (
          <button key={k} type="button" className={clsx(method === k && "is-on")} aria-pressed={method === k} onClick={() => setMethod(k)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      <p className="cpc__note">ยอดสุทธิ {baht(net)} บาท · ครั้งนี้และครั้งต่อไปหักเครดิตคอร์ส (หัตถการเพิ่มยังจ่ายตามจริง)</p>
    </Dialog>
  );
}
