import { useState } from "react";
import { Plus, Ticket, Wallet } from "lucide-react";
import { useStore } from "../../store/store";
import { Button, Dialog, Field, Input, Select, Switch, useToast } from "../../design-system";
import { METHOD_LABEL } from "../../features/billing";
import { baht, thaiDateShort } from "../../data/thaiDate";
import type { Package, PackageSale } from "../../data/biz";
import type { PaymentMethod } from "../../data/types";
import { BizPage, Stat, Tabs } from "./BizPage";
import "../../features/sell-package.css";

type Tab = "catalog" | "sales";
const paidOf = (s: PackageSale) => s.payments.reduce((n, x) => n + x.amount, 0);

/** /packages — course packages the clinic sells, member discount, and package sales (with deposits / balances) */
export default function Packages() {
  const store = useStore();
  const toast = useToast();
  const { packages, sales, memberDiscount } = store.biz;
  const [tab, setTab] = useState<Tab>("catalog");
  const [edit, setEdit] = useState<Package | null>(null);
  const [payFor, setPayFor] = useState<PackageSale | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const due = sales.filter((s) => !s.void && paidOf(s) < s.net);
  const month = new Date().toISOString().slice(0, 7);
  const monthSales = sales.filter((s) => !s.void && s.at.slice(0, 7) === month);

  const savePkg = () => {
    if (!edit) return;
    const exists = packages.some((x) => x.id === edit.id);
    store.dispatch({ type: "biz", cat: "ตั้งค่า", log: `${exists ? "แก้ไข" : "เพิ่ม"}แพ็กเกจ ${edit.name} · ${edit.sessions} ครั้ง ${baht(edit.price)} บาท`, update: (b) => ({ ...b, packages: exists ? b.packages.map((x) => (x.id === edit.id ? edit : x)) : [...b.packages, edit] }) });
    setEdit(null);
  };
  const collect = () => {
    if (!payFor) return;
    const amount = payFor.net - paidOf(payFor);
    store.dispatch({
      type: "biz",
      log: `รับชำระคงค้างแพ็กเกจ ${payFor.no} ${baht(amount)} บาท`,
      patientId: payFor.patientId,
      update: (b) => ({ ...b, sales: b.sales.map((s) => (s.id === payFor.id ? { ...s, payments: [...s.payments, { at: new Date().toISOString(), amount, method: payMethod, kind: "balance" }] } : s)) }),
    });
    toast({ message: `รับชำระคงค้าง ${baht(amount)} บาท แล้ว` });
    setPayFor(null);
  };

  return (
    <BizPage
      eyebrow="การเงิน"
      title="แพ็กเกจ"
      bar={
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "catalog", label: "แพ็กเกจ", count: packages.filter((x) => x.active).length },
              { value: "sales", label: "ยอดขาย", count: due.length || undefined },
            ]}
          />
          <div className="adp__actions">
            <Button size="md" leading={<Plus size={16} />} onClick={() => setEdit({ id: `pk${Date.now().toString(36)}`, name: "", serviceId: store.services[0].id, sessions: 10, price: 0, validDays: 90, active: true })}>
              เพิ่มแพ็กเกจ
            </Button>
          </div>
        </>
      }
    >
      <div className="bz-stats">
        <Stat label="ขายเดือนนี้" value={`${monthSales.length} แพ็กเกจ`} sub={`${baht(monthSales.reduce((n, s) => n + s.net, 0))} บาท`} />
        <Stat label="รับเงินเดือนนี้" value={`${baht(monthSales.reduce((n, s) => n + paidOf(s), 0))} ฿`} tone="#2f8a52" />
        <Stat label="ค้างชำระ" value={`${baht(due.reduce((n, s) => n + s.net - paidOf(s), 0))} ฿`} sub={`${due.length} รายการ`} tone={due.length ? "#c47a12" : undefined} />
        <div className="bz-stat">
          <small>ส่วนลดสมาชิก</small>
          <b>
            <Input
              className="bz-mini"
              inputMode="numeric"
              defaultValue={memberDiscount}
              aria-label="ส่วนลดสมาชิก %"
              onBlur={(e) => {
                const v = Math.min(50, Math.max(0, Number(e.target.value) || 0));
                if (v !== memberDiscount) store.dispatch({ type: "biz", cat: "ตั้งค่า", log: `ตั้งส่วนลดสมาชิก ${v}%`, update: (b) => ({ ...b, memberDiscount: v }) });
              }}
            />{" "}
            %
          </b>
          <em>ใช้เมื่อเลือก “สมาชิก”</em>
        </div>
      </div>

      {tab === "catalog" && (
        <div className="bz-list">
          {packages.map((x) => (
            <div key={x.id} className="bz-row" style={x.active ? undefined : { opacity: 0.55 }}>
              <span className="sp__icon">
                <Ticket size={16} />
              </span>
              <div className="bz-row__main">
                <b>{x.name}</b>
                <small>
                  {store.serviceById(x.serviceId).name} · {x.sessions} ครั้ง / {x.validDays} วัน
                </small>
                <small>
                  ประหยัด {baht(Math.max(0, store.serviceById(x.serviceId).price * x.sessions - x.price))} ฿ จากราคาปกติ {baht(store.serviceById(x.serviceId).price * x.sessions)} ฿
                </small>
              </div>
              <span className={`bz-chip ${x.active ? "" : "is-muted"}`}>{x.active ? "เปิดขาย" : "ปิดขาย"}</span>
              <span className="bz-row__num">
                {baht(x.price)}
                <small>บาท</small>
              </span>
              <Button variant="outline" size="md" onClick={() => setEdit(x)}>
                แก้ไข
              </Button>
            </div>
          ))}
        </div>
      )}

      {tab === "sales" && (
        <div className="bz-list">
          {sales.length ? (
            sales.map((s) => {
              const paid = paidOf(s);
              const left = s.net - paid;
              const pt = store.patientById(s.patientId);
              return (
                <div key={s.id} className="bz-row">
                  <div className="bz-row__main">
                    <b>
                      {pt.name} · {s.name}
                    </b>
                    <small>
                      {s.no} · {thaiDateShort(s.at.slice(0, 10))}
                      {s.member ? " · สมาชิก" : ""}
                    </small>
                    <small>
                      {s.payments.map((x) => `${x.kind === "deposit" ? "มัดจำ" : x.kind === "balance" ? "ชำระส่วนที่ค้าง" : "ชำระ"} ${baht(x.amount)} (${METHOD_LABEL[x.method]})`).join(", ") || "ยังไม่ชำระ"}
                      {s.discount > 0 ? ` · ส่วนลด ${baht(s.discount)}` : ""}
                    </small>
                  </div>
                  <span className={`bz-chip ${left > 0 ? "is-warn" : ""}`}>{left > 0 ? `ค้าง ${baht(left)}` : "ชำระครบ"}</span>
                  <span className="bz-row__num">
                    {baht(s.net)}
                    <small>บาท</small>
                  </span>
                  {left > 0 && (
                    <Button size="md" leading={<Wallet size={15} />} onClick={() => setPayFor(s)}>
                      รับชำระ
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="bz-empty">ยังไม่มียอดขาย · ขายคอร์สได้จากหน้าผู้ป่วย</p>
          )}
        </div>
      )}

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && packages.some((x) => x.id === edit.id) ? "แก้ไขแพ็กเกจ" : "เพิ่มแพ็กเกจ"}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setEdit(null)}>
              ยกเลิก
            </Button>
            <Button size="md" disabled={!edit?.name.trim() || !edit?.price} onClick={savePkg}>
              บันทึก
            </Button>
          </>
        }
      >
        {edit && (
          <div className="bz-form">
            <Field label="ชื่อแพ็กเกจ" className="span-2">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น นวดรักษา 10 ครั้ง" />
            </Field>
            <Field label="บริการ" className="span-2">
              <Select value={edit.serviceId} onChange={(e) => setEdit({ ...edit, serviceId: e.target.value })}>
                {store.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.price} ฿/ครั้ง
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="จำนวนครั้ง">
              <Input inputMode="numeric" value={edit.sessions} onChange={(e) => setEdit({ ...edit, sessions: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="ราคาแพ็กเกจ (บาท)">
              <Input inputMode="numeric" value={edit.price || ""} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <Field label="ใช้ได้ (วัน)">
              <Input inputMode="numeric" value={edit.validDays} onChange={(e) => setEdit({ ...edit, validDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
            <div className="sp__row">
              <span>
                <b>เปิดขาย</b>
                <small>ปิดเพื่อซ่อนจากตอนขาย</small>
              </span>
              <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="เปิดขาย" />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!payFor}
        onClose={() => setPayFor(null)}
        title="รับชำระคงค้าง"
        subtitle={payFor ? `${store.patientById(payFor.patientId).name} · ${payFor.name} · ค้าง ${baht(payFor.net - paidOf(payFor))} บาท` : undefined}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setPayFor(null)}>
              ยกเลิก
            </Button>
            <Button size="md" onClick={collect}>
              รับชำระ {payFor ? baht(payFor.net - paidOf(payFor)) : ""} บาท
            </Button>
          </>
        }
      >
        <Field label="ช่องทาง">
          <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
            {(["cash", "promptpay", "app"] as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
      </Dialog>
    </BizPage>
  );
}
