import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Download, Search, ShieldCheck, Upload } from "lucide-react";
import { clsx } from "clsx";
import { useStore, type StoreState } from "../store/store";
import { Button, Dialog, Switch, useToast } from "../design-system";
import { thaiDateLong, todayISO } from "../data/thaiDate";
import type { AuditEntry } from "../data/types";
import { PromptPayQR } from "./billing";
import "./settings-extras.css";

/* ───────────── PromptPay ───────────── */

const DEMO_PP = "0812345678";
const ppKind = (d: string) => (d.length === 10 && d.startsWith("0") ? "phone" : d.length === 13 ? "tax" : null);
const ppFormat = (d: string) => (d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : d);

/** clinic PromptPay ID (phone or 13-digit tax/citizen ID) with a live QR to test-scan */
export function PromptPaySetting() {
  const store = useStore();
  const toast = useToast();
  const cur = store.settings.promptpayId ?? DEMO_PP;
  const [v, setV] = useState(cur);
  const d = v.replace(/\D/g, "");
  const kind = ppKind(d);
  const dirty = d !== cur.replace(/\D/g, "");
  return (
    <div className="pp">
      <div className="pp__form">
        {cur.replace(/\D/g, "") === DEMO_PP && (
          <p className="pp__warn">
            <AlertTriangle size={14} /> ยังใช้เบอร์ตัวอย่างอยู่ · เงินที่ผู้ป่วยสแกนจ่ายจะไม่เข้าบัญชีคลินิก
          </p>
        )}
        <label>
          <span>เบอร์พร้อมเพย์ หรือเลขประจำตัวผู้เสียภาษี 13 หลัก</span>
          <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d-]/g, "").slice(0, 17))} placeholder="08x-xxx-xxxx" aria-invalid={!kind} />
        </label>
        <small className={clsx(!kind && d && "is-bad")}>{!d ? "กรอกเบอร์ 10 หลัก หรือเลข 13 หลัก" : kind === "phone" ? "เบอร์โทรศัพท์ที่ผูกพร้อมเพย์" : kind === "tax" ? "เลขผู้เสียภาษี / บัตรประชาชนที่ผูกพร้อมเพย์" : "รูปแบบไม่ถูกต้อง"}</small>
        <Button
          disabled={!kind || !dirty}
          onClick={() => {
            store.dispatch({ type: "updateSettings", patch: { promptpayId: d } });
            toast({ message: `บันทึกพร้อมเพย์ ${ppFormat(d)} แล้ว · ลองสแกน QR ทดสอบ 1 บาทก่อนใช้จริง` });
          }}
        >
          บันทึก
        </Button>
      </div>
      <div className="pp__qr">
        {kind ? <PromptPayQR amount={1} size={130} /> : <span className="pp__qr-ph" />}
        <small>QR ทดสอบ 1 บาท{dirty ? " (ของเลขที่บันทึกไว้)" : ""}</small>
        <b>{ppFormat(cur.replace(/\D/g, ""))}</b>
      </div>
    </div>
  );
}

/* ───────────── audit trail ───────────── */

const CATS: AuditEntry["cat"][] = ["เวชระเบียน", "การเงิน", "นัดหมาย", "ผู้ป่วย", "ตั้งค่า", "ระบบ"];
const CAT_TONE: Record<AuditEntry["cat"], string> = { เวชระเบียน: "#7c5cc4", การเงิน: "#d97706", นัดหมาย: "#3b82c4", ผู้ป่วย: "#2f8a52", ตั้งค่า: "#6b7a71", ระบบ: "#c2482b" };

/** who did what, when — newest first, filter by category / search */
export function AuditLog() {
  const store = useStore();
  const [cat, setCat] = useState<AuditEntry["cat"] | "all">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(80);
  const list = useMemo(() => {
    const s = q.trim();
    return (store.audit ?? []).filter((e) => (cat === "all" || e.cat === cat) && (!s || e.text.includes(s) || e.by.includes(s) || (e.patientId && store.patientById(e.patientId).name.includes(s))));
  }, [store, cat, q]);
  const shown = list.slice(0, limit);
  const days: [string, AuditEntry[]][] = [];
  for (const e of shown) {
    const d = e.at.slice(0, 10);
    const g = days.find(([k]) => k === d);
    if (g) g[1].push(e);
    else days.push([d, [e]]);
  }
  return (
    <div className="al">
      <div className="al__bar">
        <label className="al__search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ชื่อผู้ป่วย ผู้ทำรายการ หรือรายละเอียด" />
        </label>
        <div className="al__cats">
          {(["all", ...CATS] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} style={c !== "all" ? { ["--c" as string]: CAT_TONE[c] } : undefined} onClick={() => setCat(c)}>
              {c === "all" ? "ทั้งหมด" : c}
              <em>{c === "all" ? (store.audit ?? []).length : (store.audit ?? []).filter((e) => e.cat === c).length}</em>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <p className="al__empty">ยังไม่มีรายการ · ทุกการเปลี่ยนแปลงหลังจากนี้จะถูกบันทึกไว้ที่นี่</p>}
      {days.map(([d, es]) => (
        <section key={d} className="al__day">
          <p>{d === todayISO() ? "วันนี้" : thaiDateLong(d)}</p>
          <ol>
            {es.map((e) => (
              <li key={e.id} style={{ ["--c" as string]: CAT_TONE[e.cat] }}>
                <time>{new Date(e.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time>
                <span className="al__cat">{e.cat}</span>
                <span className="al__text">
                  <b>{e.text}</b>
                  <small>
                    {e.by}
                    {e.patientId ? ` · ${store.patientById(e.patientId).name}` : ""}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {list.length > limit && (
        <button type="button" className="al__more" onClick={() => setLimit((n) => n + 120)}>
          แสดงเพิ่ม ({list.length - limit} รายการ)
        </button>
      )}
    </div>
  );
}

/* ───────────── backup / restore ───────────── */

const STORE_KEY = "thaiwell.backoffice";

/** download everything as one file; restore from such a file */
export function BackupPanel() {
  const store = useStore();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; state: StoreState } | null>(null);
  const lastKey = "thaiwell.lastBackup";
  const [last, setLast] = useState(() => {
    try {
      return localStorage.getItem(lastKey);
    } catch {
      return null;
    }
  });

  const download = () => {
    let raw = "";
    try {
      raw = localStorage.getItem(STORE_KEY) ?? "";
    } catch {
      /* ignore */
    }
    const blob = new Blob([JSON.stringify({ app: "thaiwell-backoffice", exportedAt: new Date().toISOString(), clinic: store.settings.clinicName, data: JSON.parse(raw || "{}") }, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thaiwell-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    const now = new Date().toISOString();
    try {
      localStorage.setItem(lastKey, now);
    } catch {
      /* ignore */
    }
    setLast(now);
    toast({ message: "ดาวน์โหลดไฟล์สำรองแล้ว · เก็บไว้ในที่ปลอดภัย (มีข้อมูลผู้ป่วย)" });
  };

  const pick = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const st = (j.app === "thaiwell-backoffice" ? j.data : j) as StoreState;
      if (!st || !Array.isArray(st.patients) || !Array.isArray(st.appointments) || !st.settings) throw new Error("bad");
      setPending({ name: f.name, state: st });
    } catch {
      toast({ message: "ไฟล์นี้ไม่ใช่ไฟล์สำรองของ ThaiWell", tone: "danger" });
    }
  };

  return (
    <div className="bk">
      <div className="bk__row">
        <span className="bk__icon">
          <Download size={18} />
        </span>
        <div>
          <b>ดาวน์โหลดไฟล์สำรอง</b>
          <small>ผู้ป่วย นัด การชำระเงิน เวชระเบียน ตั้งค่า และประวัติการแก้ไขทั้งหมด · {last ? `สำรองล่าสุด ${new Date(last).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "ยังไม่เคยสำรอง"}</small>
        </div>
        <Button onClick={download}>ดาวน์โหลด</Button>
      </div>
      <div className="bk__row">
        <span className="bk__icon is-up">
          <Upload size={18} />
        </span>
        <div>
          <b>กู้คืนจากไฟล์สำรอง</b>
          <small>แทนที่ข้อมูลทั้งหมดในเครื่องนี้ด้วยข้อมูลในไฟล์</small>
        </div>
        <Button variant="outline" onClick={() => file.current?.click()}>
          เลือกไฟล์
        </Button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => (e.target.files?.[0] && pick(e.target.files[0]), (e.target.value = ""))} />
      </div>
      <div className="bk__row">
        <span className="bk__icon is-keep">
          <CalendarClock size={18} />
        </span>
        <div>
          <b>ใช้ข้อมูลจริง ไม่รีเซ็ตทุกวัน</b>
          <small>ปิด = ข้อมูลตัวอย่างจะสร้างใหม่ทุกวัน · เปิด = เก็บข้อมูลไว้ต่อเนื่อง (เปิดให้อัตโนมัติเมื่อกู้คืนไฟล์)</small>
        </div>
        <Switch checked={!!store.keepData} label="ใช้ข้อมูลจริง" onChange={(on) => store.dispatch({ type: "setKeepData", on })} />
      </div>
      <p className="bk__note">
        <ShieldCheck size={13} /> ข้อมูลเก็บในเบราว์เซอร์ของเครื่องนี้เท่านั้น ควรดาวน์โหลดไฟล์สำรองทุกวันจนกว่าจะมีเซิร์ฟเวอร์
      </p>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        title="กู้คืนข้อมูลจากไฟล์สำรอง?"
        subtitle={pending?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setPending(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.dispatch({ type: "restoreBackup", state: pending!.state });
                toast({ message: "กู้คืนข้อมูลแล้ว" });
                setPending(null);
              }}
            >
              แทนที่ข้อมูลในเครื่องนี้
            </Button>
          </>
        }
      >
        {pending && (
          <div className="bk__sum">
            <p>ข้อมูลปัจจุบันในเครื่องนี้จะถูกแทนที่ทั้งหมด แนะนำให้ดาวน์โหลดไฟล์สำรองของข้อมูลปัจจุบันก่อน</p>
            <ul>
              <li>
                ผู้ป่วย <b>{pending.state.patients.length}</b> ราย
              </li>
              <li>
                นัด / การรับบริการ <b>{pending.state.appointments.length}</b> รายการ
              </li>
              <li>
                ใบเสร็จ <b>{pending.state.appointments.filter((a) => a.payment).length}</b> ใบ
              </li>
              <li>
                คลินิก <b>{pending.state.settings.clinicName}</b>
              </li>
            </ul>
          </div>
        )}
      </Dialog>
    </div>
  );
}
