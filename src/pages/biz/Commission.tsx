import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import { useStore } from "../../store/store";
import { Avatar, Button, IconButton, Input } from "../../design-system";
import { downloadCsv } from "../../features/ReportDialog";
import { therapistPhoto } from "../../data/avatars";
import { baht, TH_MONTHS } from "../../data/thaiDate";
import { BizPage, Stat } from "./BizPage";

/** /billing/commission — cases, revenue and therapist pay (per case + % of revenue) for a month */
export default function Commission() {
  const store = useStore();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const key = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const shift = (d: number) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));

  const rows = useMemo(
    () =>
      store.therapists.map((t) => {
        const done = store.appointments.filter((a) => a.therapistId === t.id && a.status === "done" && a.date.slice(0, 7) === key);
        // a session paid by course credit is valued at the service price
        const revenue = done.reduce((n, a) => n + (a.payment?.status === "paid" ? (a.payment.method === "credit" ? store.serviceById(a.serviceId).price : a.payment.amount) : 0), 0);
        const r = store.biz.rates[t.id] ?? { perCase: 0, percent: 0 };
        const pay = done.length * r.perCase + Math.round((revenue * r.percent) / 100);
        const bySvc = store.services.map((s) => ({ s, n: done.filter((a) => a.serviceId === s.id).length })).filter((x) => x.n);
        return { t, cases: done.length, revenue, r, pay, bySvc };
      }),
    [store.therapists, store.appointments, store.biz.rates, store.services, key],
  );
  const total = rows.reduce((n, x) => ({ cases: n.cases + x.cases, revenue: n.revenue + x.revenue, pay: n.pay + x.pay }), { cases: 0, revenue: 0, pay: 0 });
  const setRate = (tid: string, k: "perCase" | "percent", v: number) => {
    const cur = store.biz.rates[tid] ?? { perCase: 0, percent: 0 };
    if (cur[k] === v) return;
    store.dispatch({ type: "biz", cat: "ตั้งค่า", log: `ตั้งค่ามือ ${store.therapistById(tid).name}: ${k === "perCase" ? `${v} บาท/เคส` : `${v}% ของรายได้`}`, update: (b) => ({ ...b, rates: { ...b.rates, [tid]: { ...cur, [k]: v } } }) });
  };

  return (
    <BizPage
      eyebrow="การเงิน"
      title="ค่ามือผู้บำบัด"
      bar={
        <>
          <div className="bz-month">
            <IconButton label="เดือนก่อน" variant="soft" size="sm" onClick={() => shift(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <b>
              {TH_MONTHS[ym.m]} {ym.y + 543}
            </b>
            <IconButton label="เดือนถัดไป" variant="soft" size="sm" onClick={() => shift(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <div className="adp__actions">
            <Button
              variant="outline"
              size="md"
              leading={<FileSpreadsheet size={16} />}
              onClick={() =>
                downloadCsv(`thaiwell-commission-${key}.csv`, [
                  ["ผู้บำบัด", "จำนวนเคส", "รายได้ (บาท)", "ค่ามือต่อเคส", "% ของรายได้", "ค่ามือรวม (บาท)"],
                  ...rows.map((x) => [x.t.name, x.cases, x.revenue, x.r.perCase, x.r.percent, x.pay]),
                  ["รวม", total.cases, total.revenue, "", "", total.pay],
                ])
              }
            >
              ส่งออก Excel
            </Button>
          </div>
        </>
      }
    >
      <div className="bz-stats">
        <Stat label="เคสทั้งเดือน" value={total.cases} sub={`ผู้บำบัด ${rows.filter((x) => x.cases).length} คน`} />
        <Stat label="รายได้จากการรักษา" value={`${baht(total.revenue)} ฿`} sub="รวมมูลค่าครั้งที่หักเครดิตคอร์ส" />
        <Stat label="ค่ามือรวม" value={`${baht(total.pay)} ฿`} tone="#2f8a52" sub={total.revenue ? `${Math.round((total.pay / total.revenue) * 100)}% ของรายได้` : undefined} />
      </div>
      <table className="bz-table">
        <thead>
          <tr>
            <th>ผู้บำบัด</th>
            <th className="num">เคส</th>
            <th>แยกตามบริการ</th>
            <th className="num">รายได้</th>
            <th className="num">บาท/เคส</th>
            <th className="num">% รายได้</th>
            <th className="num">ค่ามือ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.t.id}>
              <td>
                <span className="bz-who">
                  <Avatar name={x.t.name} src={therapistPhoto(x.t)} size="sm" color={x.t.color} />
                  {x.t.name}
                </span>
              </td>
              <td className="num">{x.cases}</td>
              <td>
                <small className="bz-svc">{x.bySvc.map((v) => `${v.s.short} ${v.n}`).join(" · ") || "—"}</small>
              </td>
              <td className="num">{baht(x.revenue)}</td>
              <td className="num">
                <Input className="bz-mini" inputMode="numeric" defaultValue={x.r.perCase} aria-label={`ค่ามือต่อเคส ${x.t.name}`} onBlur={(e) => setRate(x.t.id, "perCase", Number(e.target.value) || 0)} />
              </td>
              <td className="num">
                <Input className="bz-mini" inputMode="numeric" defaultValue={x.r.percent} aria-label={`เปอร์เซ็นต์ ${x.t.name}`} onBlur={(e) => setRate(x.t.id, "percent", Math.min(100, Number(e.target.value) || 0))} />
              </td>
              <td className="num">
                <b>{baht(x.pay)}</b>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>รวม</td>
            <td className="num">{total.cases}</td>
            <td />
            <td className="num">{baht(total.revenue)}</td>
            <td />
            <td />
            <td className="num">{baht(total.pay)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="adp__muted">ค่ามือ = จำนวนเคส × บาท/เคส + รายได้ × % · นับเฉพาะเคสที่รับบริการเสร็จและชำระเงินแล้ว · แก้อัตราได้ในตาราง</p>
    </BizPage>
  );
}
