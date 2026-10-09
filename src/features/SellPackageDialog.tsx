import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Banknote, Check, QrCode, Smartphone, Ticket } from "lucide-react";
import { clsx } from "clsx";
import { Button, Dialog, Field, Input, Switch, useToast } from "../design-system";
import { useStore } from "../store/store";
import { addISODays, baht, thaiDate, todayISO } from "../data/thaiDate";
import { runNo, type PackageSale, type SalePayment } from "../data/biz";
import type { PaymentMethod } from "../data/types";
import "./sell-package.css";

const METHODS: { m: PaymentMethod; label: string; Icon: typeof Banknote }[] = [
  { m: "cash", label: "เงินสด", Icon: Banknote },
  { m: "promptpay", label: "QR พร้อมเพย์", Icon: QrCode },
  { m: "app", label: "บิลในแอป", Icon: Smartphone },
];

/** sell a course package to a patient: member price, extra discount, full payment or deposit */
export function SellPackageDialog({ patientId, onClose }: { patientId: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const pkgs = store.biz.packages.filter((x) => x.active);
  const [pid, setPid] = useState(pkgs[0]?.id ?? "");
  const [member, setMember] = useState(false);
  const [extra, setExtra] = useState("");
  const [mode, setMode] = useState<"full" | "deposit">("full");
  const [deposit, setDeposit] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const p = patientId ? store.patientById(patientId) : null;
  useEffect(() => {
    if (!patientId) return;
    setPid(pkgs[0]?.id ?? "");
    setMember(!!store.patientById(patientId).member);
    setExtra("");
    setMode("full");
    setDeposit("");
    setMethod("cash");
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const pkg = pkgs.find((x) => x.id === pid);
  const memberCut = pkg && member ? Math.round((pkg.price * store.biz.memberDiscount) / 100) : 0;
  const discount = memberCut + (Number(extra) || 0);
  const net = Math.max(0, (pkg?.price ?? 0) - discount);
  const pay = mode === "full" ? net : Math.min(net, Number(deposit) || 0);
  const same = p.course && pkg && p.course.serviceId === pkg.serviceId && p.course.total - p.course.used > 0;

  const sell = () => {
    if (!pkg) return;
    const at = new Date().toISOString();
    const n = store.biz.seq.sale + 1;
    const payments: SalePayment[] = pay > 0 ? [{ at, amount: pay, method, kind: mode === "full" ? "full" : "deposit" }] : [];
    const sale: PackageSale = { id: `ps${Date.now().toString(36)}`, no: runNo("PK", n), at, patientId: p.id, packageId: pkg.id, name: pkg.name, price: pkg.price, discount, net, payments, member, by: store.settings.staffName };
    store.dispatch({ type: "biz", log: `ขายแพ็กเกจ ${pkg.name} ${baht(net)} บาท · ชำระ ${baht(pay)}${pay < net ? ` · ค้าง ${baht(net - pay)}` : ""}`, patientId: p.id, update: (b) => ({ ...b, sales: [sale, ...b.sales], seq: { ...b.seq, sale: n } }) });
    const course = same
      ? { ...p.course!, total: p.course!.total + pkg.sessions, expiresOn: addISODays(todayISO(), pkg.validDays), billing: "prepaid" as const }
      : { name: pkg.name, serviceId: pkg.serviceId, total: pkg.sessions, used: 0, startedOn: todayISO(), expiresOn: addISODays(todayISO(), pkg.validDays), billing: "prepaid" as const };
    store.dispatch({ type: "updatePatient", id: p.id, patch: { course, ...(member !== !!p.member ? { member } : {}) } });
    toast({ message: `ขาย ${pkg.name} ให้ ${p.name} แล้ว${pay < net ? ` · ค้างชำระ ${baht(net - pay)} บาท` : ""}` });
    onClose();
  };

  return (
    <Dialog
      open={!!patientId}
      onClose={onClose}
      className="sp"
      title="ขายแพ็กเกจ"
      subtitle={p.name}
      footer={
        <>
          <Button variant="outline" size="md" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="md" disabled={!pkg || (mode === "deposit" && pay <= 0)} leading={<Check size={16} />} onClick={sell}>
            {mode === "full" ? `รับชำระ ${baht(pay)} บาท` : `รับมัดจำ ${baht(pay)} บาท`}
          </Button>
        </>
      }
    >
      {!pkgs.length && (
        <div className="sp__empty">
          <Ticket size={22} />
          <b>ยังไม่มีแพ็กเกจให้เลือก</b>
          <span>ตั้งแพ็กเกจ (บริการ · จำนวนครั้ง · ราคา) ก่อน แล้วกลับมาขายได้เลย</span>
          <Button
            size="md"
            onClick={() => {
              onClose();
              navigate("/packages");
            }}
          >
            ไปตั้งแพ็กเกจ
          </Button>
        </div>
      )}
      <div className="sp__pkgs">
        {pkgs.map((x) => (
          <button key={x.id} type="button" aria-pressed={x.id === pid} onClick={() => setPid(x.id)}>
            <span className="sp__icon">
              <Ticket size={16} />
            </span>
            <span>
              <b>{x.name}</b>
              <small>
                {x.sessions} ครั้ง · ใช้ได้ {x.validDays} วัน · เฉลี่ย {baht(Math.round(x.price / x.sessions))} ฿/ครั้ง
              </small>
            </span>
            <em>{baht(x.price)} ฿</em>
          </button>
        ))}
      </div>
      {same && <p className="sp__note">มีคอร์สบริการนี้อยู่แล้ว · เพิ่ม {pkg!.sessions} ครั้งเข้าคอร์สเดิม ใช้ได้ถึง {thaiDate(addISODays(todayISO(), pkg!.validDays))}</p>}

      <div className="sp__row">
        <span>
          <b>สมาชิกคลินิก</b>
          <small>ลด {store.biz.memberDiscount}% ทุกแพ็กเกจ</small>
        </span>
        <Switch checked={member} onChange={setMember} label="สมาชิก" />
      </div>
      <Field label="ส่วนลดเพิ่ม (บาท)">
        <Input inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value.replace(/\D/g, ""))} placeholder="0" />
      </Field>

      <div className="sp__sum">
        <div>
          <span>ราคาแพ็กเกจ</span>
          <b>{baht(pkg?.price ?? 0)}</b>
        </div>
        {memberCut > 0 && (
          <div className="is-minus">
            <span>ส่วนลดสมาชิก {store.biz.memberDiscount}%</span>
            <b>−{baht(memberCut)}</b>
          </div>
        )}
        {Number(extra) > 0 && (
          <div className="is-minus">
            <span>ส่วนลดเพิ่ม</span>
            <b>−{baht(Number(extra))}</b>
          </div>
        )}
        <div className="is-total">
          <span>ยอดสุทธิ</span>
          <b>{baht(net)} บาท</b>
        </div>
      </div>

      <div className="sp__seg">
        {(["full", "deposit"] as const).map((x) => (
          <button key={x} type="button" aria-pressed={mode === x} onClick={() => setMode(x)}>
            {x === "full" ? "ชำระเต็มจำนวน" : "รับมัดจำ"}
          </button>
        ))}
      </div>
      {mode === "deposit" && (
        <Field label={`ยอดมัดจำ (ค้างชำระ ${baht(Math.max(0, net - pay))} บาท)`}>
          <Input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))} placeholder={String(Math.round(net / 2))} />
        </Field>
      )}
      <div className="sp__methods">
        {METHODS.map(({ m, label, Icon }) => (
          <button key={m} type="button" className={clsx(method === m && "is-on")} aria-pressed={method === m} onClick={() => setMethod(m)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
