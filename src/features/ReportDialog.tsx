import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useStore } from "../store/store";
import { Button, Dialog, Segmented } from "../design-system";
import { addISODays, baht, thaiDate, todayISO } from "../data/thaiDate";
import { METHOD_LABEL } from "./billing";
import type { Appointment, PaymentMethod } from "../data/types";
import { dxCode, procCode } from "../data/codes";
import "./report.css";

type Period = "today" | "7" | "30" | "month";

/** download rows as a CSV that Excel opens with Thai intact (UTF-8 BOM) */
export function downloadCsv(name: string, rows: (string | number | undefined)[][]) {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** รายงานสรุป — income, visits, services, therapists and diagnoses for a period; export to Excel or print */
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const today = todayISO();
  const [period, setPeriod] = useState<Period>("today");
  const from = period === "today" ? today : period === "month" ? today.slice(0, 8) + "01" : addISODays(today, -(Number(period) - 1));
  const label = period === "today" ? thaiDate(today) : `${thaiDate(from)} – ${thaiDate(today)}`;

  const r = useMemo(() => {
    const visits = store.appointments.filter((a) => a.date >= from && a.date <= today && a.status !== "cancelled");
    const done = visits.filter((a) => a.status === "done");
    const paid = store.appointments.filter((a) => a.payment?.status === "paid" && a.payment.at.slice(0, 10) >= from && a.payment.at.slice(0, 10) <= today);
    const income = paid.reduce((n, a) => n + a.payment!.amount, 0);
    const methods = (["cash", "promptpay", "app", "credit"] as PaymentMethod[]).map((m) => {
      const l = paid.filter((a) => a.payment!.method === m);
      return { m, n: l.length, sum: l.reduce((x, a) => x + a.payment!.amount, 0) };
    });
    const group = <K extends string>(list: Appointment[], key: (a: Appointment) => K) => {
      const map = new Map<K, Appointment[]>();
      for (const a of list) map.set(key(a), [...(map.get(key(a)) ?? []), a]);
      return [...map.entries()].sort((x, y) => y[1].length - x[1].length);
    };
    const services = group(done, (a) => a.serviceId).map(([id, l]) => ({ name: store.serviceById(id).name, n: l.length, sum: l.reduce((x, a) => x + (a.payment?.status === "paid" ? a.payment.amount : 0), 0) }));
    const staff = group(done, (a) => a.therapistId).map(([id, l]) => ({ name: store.therapistById(id).name, n: l.length, min: l.reduce((x, a) => x + store.serviceById(a.serviceId).minutes, 0) }));
    const dxMap = new Map<string, { code?: string; n: number }>();
    for (const a of done) for (const d of a.diagnoses ?? []) dxMap.set(d.name, { code: d.code ?? dxCode(d.name)?.code, n: (dxMap.get(d.name)?.n ?? 0) + 1 });
    const dx = [...dxMap.entries()].sort((x, y) => y[1].n - x[1].n).slice(0, 5);
    const pains = done.filter((a) => a.painAfter !== undefined);
    const painDrop = pains.length ? pains.reduce((n, a) => n + (a.painBefore - a.painAfter!), 0) / pains.length : 0;
    return {
      visits: visits.length,
      done: done.length,
      absent: visits.filter((a) => a.status === "absent").length,
      walkin: visits.filter((a) => a.type !== "booked").length,
      income,
      receipts: paid.length,
      due: store.appointments.filter((a) => a.status === "done" && !a.paid && a.date >= from).length,
      methods,
      services,
      staff,
      dx,
      painDrop,
      done$: done,
    };
  }, [store, from, today]);

  const exportVisits = () =>
    downloadCsv(`thaiwell-visits-${from}-${today}.csv`, [
      ["วันที่", "เวลา", "HN", "ชื่อ", "บริการ", "ผู้บำบัด", "วินิจฉัยหลัก", "ICD-10", "หัตถการ", "ICD-9-CM", "ปวดก่อนนวด", "ปวดหลังนวด", "เลขที่ใบเสร็จ", "ช่องทาง", "ยอดชำระ"],
      ...r.done$.map((a) => {
        const p = store.patientById(a.patientId);
        const dx = a.diagnoses?.find((d) => d.kind === "principal") ?? a.diagnoses?.[0];
        return [a.date, a.start, p.hn, p.name, store.serviceById(a.serviceId).name, store.therapistById(a.therapistId).name, dx?.name, dx ? (dx.code ?? dxCode(dx.name)?.code) : "", a.procedures?.map((x) => x.name).join(" / "), a.procedures?.map((x) => x.code ?? procCode(x.name)?.code).filter(Boolean).join(" / "), a.painBefore, a.painAfter, a.payment?.no, a.payment ? METHOD_LABEL[a.payment.method] : "", a.payment?.amount];
      }),
    ]);
  const exportSummary = () =>
    downloadCsv(`thaiwell-summary-${from}-${today}.csv`, [
      ["รายงานสรุป", store.settings.clinicName],
      ["ช่วงวันที่", label],
      [],
      ["นัดทั้งหมด", r.visits],
      ["นวดเสร็จ", r.done],
      ["ไม่มาตามนัด", r.absent],
      ["วอล์กอิน", r.walkin],
      ["รายรับ (บาท)", r.income],
      ["จำนวนใบเสร็จ", r.receipts],
      [],
      ["ช่องทางชำระ", "จำนวน", "ยอด (บาท)"],
      ...r.methods.map((m) => [METHOD_LABEL[m.m], m.n, m.sum]),
      [],
      ["บริการ", "ครั้ง", "รายรับ (บาท)"],
      ...r.services.map((s) => [s.name, s.n, s.sum]),
      [],
      ["ผู้บำบัด", "ครั้ง", "นาที"],
      ...r.staff.map((s) => [s.name, s.n, s.min]),
    ]);

  const max = Math.max(1, ...r.methods.map((m) => m.sum));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      className="rp"
      title="รายงานสรุป"
      subtitle={`${store.settings.clinicName} · ${label}`}
      footer={
        <>
          <Button variant="outline" leading={<Printer size={16} />} onClick={() => window.print()}>
            พิมพ์
          </Button>
          <Button variant="outline" leading={<FileSpreadsheet size={16} />} onClick={exportVisits}>
            Excel รายนัด
          </Button>
          <Button leading={<FileSpreadsheet size={16} />} onClick={exportSummary}>
            Excel สรุป
          </Button>
        </>
      }
    >
      <div className="rp__bar">
        <Segmented
          tone="light"
          label="ช่วงเวลา"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "today", label: "วันนี้" },
            { value: "7", label: "7 วัน" },
            { value: "30", label: "30 วัน" },
            { value: "month", label: "เดือนนี้" },
          ]}
        />
      </div>
      <div className="rp__kpis">
        <div>
          <small>รายรับ</small>
          <b>{baht(r.income)}</b>
          <em>{r.receipts} ใบเสร็จ</em>
        </div>
        <div>
          <small>นวดเสร็จ</small>
          <b>{r.done}</b>
          <em>จาก {r.visits} นัด · วอล์กอิน {r.walkin}</em>
        </div>
        <div>
          <small>ไม่มาตามนัด</small>
          <b>{r.absent}</b>
          <em>ค้างชำระ {r.due} นัด</em>
        </div>
        <div>
          <small>ปวดลดเฉลี่ย</small>
          <b>{r.painDrop.toFixed(1)}</b>
          <em>คะแนนต่อครั้ง</em>
        </div>
      </div>
      <div className="rp__grid">
        <section>
          <h4>ช่องทางชำระ</h4>
          {r.methods.map((m) => (
            <div key={m.m} className="rp__bar-row">
              <span>{METHOD_LABEL[m.m]}</span>
              <i>
                <em style={{ width: `${(m.sum / max) * 100}%` }} />
              </i>
              <b>{baht(m.sum)}</b>
            </div>
          ))}
        </section>
        <section>
          <h4>บริการ</h4>
          <table>
            <tbody>
              {r.services.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.n} ครั้ง</td>
                  <td>{baht(s.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h4>ผู้บำบัด</h4>
          <table>
            <tbody>
              {r.staff.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.n} ครั้ง</td>
                  <td>{Math.round(s.min / 60)} ชม.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h4>วินิจฉัยที่พบบ่อย</h4>
          <table>
            <tbody>
              {r.dx.map(([n, v]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td>{v.code ?? "—"}</td>
                  <td>{v.n} ครั้ง</td>
                </tr>
              ))}
              {r.dx.length === 0 && (
                <tr>
                  <td colSpan={3}>ยังไม่มีข้อมูล</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </Dialog>
  );
}
