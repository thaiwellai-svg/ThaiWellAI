import { useMemo, useState } from "react";
import { Banknote, Landmark, Printer, QrCode, Smartphone, Ticket } from "lucide-react";
import { useStore } from "../../store/store";
import { Button, Field, Input, Textarea, useToast } from "../../design-system";
import { METHOD_LABEL } from "../../features/billing";
import { PrintHead, usePrintSheet } from "../../features/usePrintSheet";
import { baht, thaiDateLong, thaiDateShort, todayISO } from "../../data/thaiDate";
import type { DayClose as Close } from "../../data/biz";
import type { PaymentMethod } from "../../data/types";
import { BizPage, Stat, Tabs } from "./BizPage";

const METHODS: PaymentMethod[] = ["cash", "promptpay", "app", "credit"];
const ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, promptpay: QrCode, app: Smartphone, credit: Ticket };
const NOTES = [1000, 500, 100, 50, 20, 10, 5, 2, 1];
const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** what the system recorded for one day: receipts (visits) + package-sale payments */
function dayTotals(store: ReturnType<typeof useStore>, date: string) {
  const totals: Record<PaymentMethod, number> = { cash: 0, promptpay: 0, app: 0, credit: 0 };
  let receipts = 0;
  let voids = 0;
  let credits = 0;
  for (const a of store.appointments) {
    const p = a.payment;
    if (p?.status === "paid" && p.at.slice(0, 10) === date) {
      receipts++;
      if (p.method === "credit" || p.credit) credits++;
      if (p.method !== "credit") totals[p.method] += p.amount;
    }
    for (const v of a.voidedPayments ?? []) if (v.voided?.at.slice(0, 10) === date) voids++;
  }
  let pk = 0;
  for (const s of store.biz.sales)
    for (const x of s.payments)
      if (!s.void && x.at.slice(0, 10) === date) {
        totals[x.method] += x.amount;
        pk += x.amount;
      }
  return { totals, receipts, voids, credits, pk, sum: totals.cash + totals.promptpay + totals.app };
}

/** /billing/close — end-of-day: compare counted cash with the system, record the bank deposit */
export default function DayClose() {
  const store = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<"close" | "history">("close");
  const [date, setDate] = useState(todayISO());
  const [float, setFloat] = useState(1000);
  const [count, setCount] = useState<Record<number, number>>({});
  const [deposit, setDeposit] = useState<number | null>(null);
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [print, portal] = usePrintSheet();
  const t = useMemo(() => dayTotals(store, date), [store, date]);
  const counted = NOTES.reduce((n, d) => n + d * (count[d] || 0), 0);
  const expected = float + t.totals.cash;
  const diff = counted - expected;
  const dep = deposit ?? Math.max(0, counted - float);
  const done = store.biz.closings.find((c) => c.date === date);

  const sheet = (c: Close) => (
    <div className="pps">
      <PrintHead clinic={store.settings.clinicName} title="ใบปิดยอดประจำวัน" date={thaiDateLong(c.date)} />
      <section>
        <h2>ยอดในระบบ</h2>
        <table>
          <tbody>
            {METHODS.filter((m) => m !== "credit").map((m) => (
              <tr key={m}>
                <th>{METHOD_LABEL[m]}</th>
                <td>{baht(c.totals[m])} บาท</td>
              </tr>
            ))}
            <tr>
              <th>รวมรับเงิน</th>
              <td>
                <b>{baht(c.totals.cash + c.totals.promptpay + c.totals.app)} บาท</b> · ใบเสร็จ {c.receipts} ใบ
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>เงินสด</h2>
        <table>
          <tbody>
            <tr>
              <th>เงินทอนตั้งต้น</th>
              <td>{baht(c.float)} บาท</td>
            </tr>
            <tr>
              <th>ควรมีในลิ้นชัก</th>
              <td>{baht(c.expectedCash)} บาท</td>
            </tr>
            <tr>
              <th>นับได้จริง</th>
              <td>{baht(c.counted)} บาท</td>
            </tr>
            <tr>
              <th>ผลต่าง</th>
              <td>
                <b>{c.diff === 0 ? "ตรงยอด" : `${c.diff > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(c.diff))} บาท`}</b>
              </td>
            </tr>
            <tr>
              <th>นำฝากธนาคาร</th>
              <td>
                {baht(c.deposit)} บาท{c.depositRef ? ` · อ้างอิง ${c.depositRef}` : ""}
              </td>
            </tr>
          </tbody>
        </table>
        {c.note && <p>หมายเหตุ: {c.note}</p>}
      </section>
      <footer className="pps__sign">
        <div>
          <span />
          ผู้ปิดยอด ({c.by})
        </div>
        <div>
          <span />
          ผู้ตรวจสอบ
        </div>
      </footer>
    </div>
  );

  const save = () => {
    const c: Close = { id: `dc${Date.now().toString(36)}`, date, at: new Date().toISOString(), by: store.settings.staffName, float, counted, expectedCash: expected, diff, deposit: dep, depositRef: ref.trim() || undefined, note: note.trim() || undefined, totals: t.totals, receipts: t.receipts };
    store.dispatch({
      type: "biz",
      log: `ปิดยอด ${thaiDateShort(date, true)} · รับเงิน ${baht(t.sum)} บาท · เงินสด${diff === 0 ? "ตรงยอด" : `${diff > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(diff))} บาท`} · ฝากธนาคาร ${baht(dep)} บาท`,
      update: (b) => ({ ...b, closings: [c, ...b.closings.filter((x) => x.date !== date)] }),
    });
    toast({ message: `ปิดยอดวันที่ ${thaiDateShort(date)} แล้ว`, action: { label: "พิมพ์", onClick: () => print(sheet(c)) } });
  };

  return (
    <BizPage
      eyebrow="การเงิน"
      title="ปิดยอดประจำวัน"
      bar={
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "close", label: "ปิดยอด" },
              { value: "history", label: "ประวัติ", count: store.biz.closings.length || undefined },
            ]}
          />
          {tab === "close" && (
            <div className="adp__actions">
              <Input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="วันที่" />
            </div>
          )}
        </>
      }
    >
      {tab === "close" ? (
        <>
          {done && (
            <p className="bz-note">
              วันนี้ปิดยอดไปแล้วโดย {done.by} เวลา {clock(done.at)} น. — บันทึกอีกครั้งจะแทนที่รายการเดิม{" "}
              <button type="button" onClick={() => print(sheet(done))}>
                พิมพ์ใบเดิม
              </button>
            </p>
          )}
          <div className="bz-stats">
            {METHODS.map((m) => {
              const I = ICON[m];
              return <Stat key={m} label={<><I size={13} /> {METHOD_LABEL[m]}</>} value={m === "credit" ? `${t.credits} ครั้ง` : `${baht(t.totals[m])} ฿`} />;
            })}
          </div>
          <p className="adp__muted">
            ใบเสร็จ {t.receipts} ใบ · ยกเลิกใบเสร็จ {t.voids} ใบ{t.pk ? ` · รวมเงินขายแพ็กเกจ ${baht(t.pk)} บาท` : ""} · รับเงินรวม <b>{baht(t.sum)} บาท</b>
          </p>

          <div className="dc">
            <section className="dc__count">
              <h3 className="bz-h">นับเงินสดในลิ้นชัก</h3>
              <div className="dc__notes">
                {NOTES.map((d) => (
                  <label key={d}>
                    <span>{d >= 20 ? `แบงก์ ${d}` : `เหรียญ ${d}`}</span>
                    <Input inputMode="numeric" placeholder="0" value={count[d] || ""} onChange={(e) => setCount({ ...count, [d]: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-label={`จำนวน ${d}`} />
                    <b>{baht(d * (count[d] || 0))}</b>
                  </label>
                ))}
              </div>
            </section>
            <section className="dc__sum">
              <h3 className="bz-h">สรุปเงินสด</h3>
              <Field label="เงินทอนตั้งต้น (บาท)">
                <Input inputMode="numeric" value={float} onChange={(e) => setFloat(Number(e.target.value.replace(/\D/g, "")) || 0)} />
              </Field>
              <dl>
                <dt>รับเงินสดวันนี้</dt>
                <dd>{baht(t.totals.cash)}</dd>
                <dt>ควรมีในลิ้นชัก</dt>
                <dd>{baht(expected)}</dd>
                <dt>นับได้จริง</dt>
                <dd>{baht(counted)}</dd>
              </dl>
              <div className={`dc__diff ${!counted ? "is-idle" : diff === 0 ? "is-ok" : diff > 0 ? "is-over" : "is-short"}`}>
                {!counted ? "กรอกจำนวนแบงก์และเหรียญที่นับได้" : diff === 0 ? "ตรงยอด" : `${diff > 0 ? "เงินเกิน" : "เงินขาด"} ${baht(Math.abs(diff))} บาท`}
              </div>
              <h3 className="bz-h">
                <Landmark size={14} /> นำฝากธนาคาร
              </h3>
              <div className="bz-form">
                <Field label="ยอดฝาก (บาท)">
                  <Input inputMode="numeric" value={dep} onChange={(e) => setDeposit(Number(e.target.value.replace(/\D/g, "")) || 0)} />
                </Field>
                <Field label="เลขอ้างอิง / สลิป">
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ไม่บังคับ" />
                </Field>
                <Field label="หมายเหตุ" className="span-2">
                  <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={diff ? "เหตุผลที่เงินขาด/เกิน" : "ไม่บังคับ"} />
                </Field>
              </div>
              <Button size="lg" block disabled={!counted || (diff !== 0 && !note.trim())} onClick={save}>
                ยืนยันปิดยอด
              </Button>
              {diff !== 0 && counted > 0 && !note.trim() && <small className="dc__hint">เงินไม่ตรงยอด — กรุณาระบุหมายเหตุ</small>}
            </section>
          </div>
        </>
      ) : (
        <div className="bz-list">
          {store.biz.closings.length ? (
            store.biz.closings.map((c) => (
              <div key={c.id} className="bz-row">
                <div className="bz-row__main">
                  <b>{thaiDateLong(c.date)}</b>
                  <small>
                    {c.by} · {clock(c.at)} น. · ใบเสร็จ {c.receipts} ใบ · ฝาก {baht(c.deposit)} บาท{c.depositRef ? ` (${c.depositRef})` : ""}
                    {c.note ? ` · ${c.note}` : ""}
                  </small>
                </div>
                <span className={`bz-chip ${c.diff === 0 ? "" : "is-warn"}`}>{c.diff === 0 ? "ตรงยอด" : `${c.diff > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(c.diff))}`}</span>
                <span className="bz-row__num">
                  {baht(c.totals.cash + c.totals.promptpay + c.totals.app)}
                  <small>บาท</small>
                </span>
                <Button variant="outline" size="md" leading={<Printer size={15} />} onClick={() => print(sheet(c))}>
                  พิมพ์
                </Button>
              </div>
            ))
          ) : (
            <p className="bz-empty">ยังไม่มีประวัติการปิดยอด</p>
          )}
        </div>
      )}
      {portal}
    </BizPage>
  );
}
