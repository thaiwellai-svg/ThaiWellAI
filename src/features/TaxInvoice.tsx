import { useState } from "react";
import { useStore } from "../store/store";
import { Button, Dialog, Field, Input, Switch, Textarea, useToast } from "../design-system";
import { runNo } from "../data/biz";
import { baht, thaiDateLong } from "../data/thaiDate";
import { PrintHead, usePrintSheet } from "./usePrintSheet";
import "../pages/biz/biz.css";
import type { ClinicSettings, Payment } from "../data/types";

export const DEFAULT_VAT: NonNullable<ClinicSettings["vat"]> = { registered: false, taxId: "", branch: "สำนักงานใหญ่", address: "", rate: 7 };
/** VAT included in a VAT-inclusive price */
export const vatOf = (amount: number, rate: number) => Math.round(((amount * rate) / (100 + rate)) * 100) / 100;
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Settings → payment: clinic VAT registration (enables full tax invoices) */
export function VatSetting() {
  const store = useStore();
  const toast = useToast();
  const [v, setV] = useState(store.settings.vat ?? DEFAULT_VAT);
  const save = (next = v) => {
    store.dispatch({ type: "updateSettings", patch: { vat: next } });
    toast({ message: next.registered ? "บันทึกข้อมูลภาษีมูลค่าเพิ่มแล้ว" : "ปิดการออกใบกำกับภาษีแล้ว" });
  };
  return (
    <div className="vat-set">
      <div className="vat-set__row">
        <span>
          <b>จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)</b>
          <small>{v.registered ? `ออกใบกำกับภาษีเต็มรูปได้จากหน้าใบเสร็จ · ราคารวม VAT ${v.rate}% แล้ว` : "ปิดอยู่ · ออกได้เฉพาะใบเสร็จรับเงิน"}</small>
        </span>
        <Switch
          checked={v.registered}
          label="จดทะเบียน VAT"
          onChange={(on) => {
            const next = { ...v, registered: on };
            setV(next);
            if (!on || (next.taxId.length === 13 && next.address.trim())) save(next);
          }}
        />
      </div>
      {v.registered && (
        <div className="bz-form">
          <Field label="เลขประจำตัวผู้เสียภาษี (13 หลัก)">
            <Input inputMode="numeric" maxLength={13} value={v.taxId} onChange={(e) => setV({ ...v, taxId: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="สาขา">
            <Input value={v.branch} onChange={(e) => setV({ ...v, branch: e.target.value })} />
          </Field>
          <Field label="ที่อยู่ตามใบ ภ.พ.20" className="span-2">
            <Textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
          </Field>
          <Field label="อัตราภาษี (%)">
            <Input inputMode="numeric" value={v.rate} onChange={(e) => setV({ ...v, rate: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
          <div className="vat-set__save">
            <Button size="md" disabled={v.taxId.length !== 13 || !v.address.trim()} onClick={() => save()}>
              บันทึกข้อมูลภาษี
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sheet({ pay, settings, item }: { pay: Payment; settings: ClinicSettings; item: string }) {
  const vat = settings.vat!;
  const inv = pay.taxInvoice!;
  const tax = vatOf(pay.amount, vat.rate);
  return (
    <div className="pps">
      <PrintHead clinic={settings.clinicName} title="ใบกำกับภาษี / ใบเสร็จรับเงิน" no={inv.no} date={thaiDateLong(inv.at.slice(0, 10))} />
      <section>
        <table>
          <tbody>
            <tr>
              <th>ผู้ขาย</th>
              <td>
                {settings.clinicName} ({vat.branch})<br />
                {vat.address}
                <br />
                เลขประจำตัวผู้เสียภาษี {vat.taxId}
              </td>
            </tr>
            <tr>
              <th>ผู้ซื้อ</th>
              <td>
                {inv.buyer}
                {inv.branch ? ` (${inv.branch})` : ""}
                {inv.address && (
                  <>
                    <br />
                    {inv.address}
                  </>
                )}
                {inv.taxId && (
                  <>
                    <br />
                    เลขประจำตัวผู้เสียภาษี {inv.taxId}
                  </>
                )}
              </td>
            </tr>
            <tr>
              <th>อ้างอิงใบเสร็จ</th>
              <td>{pay.no}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>รายการ</h2>
        <table>
          <tbody>
            <tr>
              <th>{item}</th>
              <td style={{ textAlign: "right" }}>{money(pay.amount - tax)}</td>
            </tr>
            <tr>
              <th>มูลค่าก่อนภาษี</th>
              <td style={{ textAlign: "right" }}>{money(pay.amount - tax)}</td>
            </tr>
            <tr>
              <th>ภาษีมูลค่าเพิ่ม {vat.rate}%</th>
              <td style={{ textAlign: "right" }}>{money(tax)}</td>
            </tr>
            <tr>
              <th>รวมทั้งสิ้น</th>
              <td style={{ textAlign: "right" }}>
                <b>{money(pay.amount)} บาท</b>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <footer className="pps__sign">
        <div>
          <span />
          ผู้รับเงิน
        </div>
        <div>
          <span />
          ผู้มีอำนาจลงนาม
        </div>
      </footer>
    </div>
  );
}

/** Full tax invoice for a paid receipt — asks buyer details once, then prints (reprint keeps the same number) */
export function TaxInvoiceDialog({ apptId, onClose }: { apptId: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [print, portal] = usePrintSheet();
  const a = store.appointments.find((x) => x.id === apptId);
  const p = a ? store.patientById(a.patientId) : null;
  const [form, setForm] = useState<{ buyer: string; taxId: string; branch: string; address: string } | null>(null);
  const f = form ?? { buyer: p?.name ?? "", taxId: p?.citizenId ?? "", branch: "", address: p?.address ?? "" };
  const pay = a?.payment;
  if (!a || !pay) return portal;
  const item = `ค่าบริการ ${store.serviceById(a.serviceId).name}`;
  const done = !!pay.taxInvoice;
  const issue = () => {
    const no = runNo("TX", store.biz.seq.tax + 1);
    const taxInvoice = { no, at: new Date().toISOString(), buyer: f.buyer.trim(), taxId: f.taxId || undefined, branch: f.branch.trim() || undefined, address: f.address.trim() || undefined };
    const next = { ...pay, taxInvoice };
    store.dispatch({ type: "biz", log: `ออกใบกำกับภาษี ${no} อ้างอิง ${pay.no} · ${f.buyer.trim()} · ${baht(pay.amount)} บาท`, patientId: a.patientId, update: (b) => ({ ...b, seq: { ...b.seq, tax: b.seq.tax + 1 } }) });
    store.dispatch({ type: "updateAppointment", id: a.id, patch: { payment: next }, log: `ออกใบกำกับภาษี ${no}` });
    toast({ message: `ออกใบกำกับภาษี ${no} แล้ว` });
    print(<Sheet pay={next} settings={store.settings} item={item} />);
    setForm(null);
    onClose();
  };
  return (
    <>
      <Dialog
        open={!!apptId}
        onClose={onClose}
        title={done ? `ใบกำกับภาษี ${pay.taxInvoice!.no}` : "ออกใบกำกับภาษีเต็มรูป"}
        subtitle={`อ้างอิง ${pay.no} · ${baht(pay.amount)} บาท (รวม VAT ${baht(vatOf(pay.amount, store.settings.vat?.rate ?? 7))} บาท)`}
        footer={
          <>
            <Button variant="outline" size="md" onClick={onClose}>
              ปิด
            </Button>
            {done ? (
              <Button size="md" onClick={() => print(<Sheet pay={pay} settings={store.settings} item={item} />)}>
                พิมพ์ซ้ำ
              </Button>
            ) : (
              <Button size="md" disabled={!f.buyer.trim()} onClick={issue}>
                ออกและพิมพ์
              </Button>
            )}
          </>
        }
      >
        {done ? (
          <p className="adp__muted">
            ออกให้ {pay.taxInvoice!.buyer} เมื่อ {thaiDateLong(pay.taxInvoice!.at.slice(0, 10))} · ออกได้ครั้งเดียว (ข้อมูลผิดให้ยกเลิกใบเสร็จ)
          </p>
        ) : (
          <div className="bz-form">
            <Field label="ชื่อผู้ซื้อ / บริษัท" className="span-2">
              <Input value={f.buyer} onChange={(e) => setForm({ ...f, buyer: e.target.value })} />
            </Field>
            <Field label="เลขประจำตัวผู้เสียภาษี">
              <Input inputMode="numeric" maxLength={13} value={f.taxId} onChange={(e) => setForm({ ...f, taxId: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="สาขา (ถ้าเป็นบริษัท)">
              <Input value={f.branch} onChange={(e) => setForm({ ...f, branch: e.target.value })} placeholder="เช่น สำนักงานใหญ่" />
            </Field>
            <Field label="ที่อยู่" className="span-2">
              <Textarea rows={2} value={f.address} onChange={(e) => setForm({ ...f, address: e.target.value })} />
            </Field>
          </div>
        )}
      </Dialog>
      {portal}
    </>
  );
}
