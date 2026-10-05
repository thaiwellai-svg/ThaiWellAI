import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { X, Maximize2, Minimize2, CalendarRange, ClipboardPlus, Hourglass, ListFilter, UserPlus, UsersRound } from "lucide-react";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, Input, SearchField, Select, Textarea, useToast } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { PatientDrawer } from "../../features/PatientDrawer";
import { PainMini } from "../../features/RecordCards";
import { creditInfo } from "../../data/domain";
import type { CreditInfo } from "../../data/domain";
import type { Appointment, Patient } from "../../data/types";
import { addISODays, diffDays, relativeDay, thaiDateShort, todayISO } from "../../data/thaiDate";
import { patientPhoto } from "../../data/avatars";
import { PhotoPicker } from "../../features/PhotoPicker";
import { PatientDetail } from "./PatientDetail";
import { AIPlanCard } from "../../features/AIPlan";
import "../visits/visits.css";
import { FilterMenu } from "../../features/FilterMenu";
import { Workspace } from "../../features/Workspace";
import { ListModeMenu } from "../../features/ListModeMenu";
import "./patients.css";

type Filter = "all" | "course" | "low" | "week";

interface Row {
  p: Patient;
  c: CreditInfo | null;
  pain?: number;
  next?: Appointment;
}

const bare = (name: string) => name.replace(/^(นาย|นางสาว|นาง)\s*/, "");

function useWide() {
  const q = "(min-width: 1000px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function Patients() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") as Filter) ?? "all";
  const [query, setQuery] = useState("");
  // detail fills the screen (list hidden) — toggled from the detail box's ••• toolbar
  const [solo, setSolo] = useState(false);
  // AI treatment plan opens as a third column, like the health box on รับบริการ
  const [aiOpen, setAiOpen] = useState(false);
  // narrow list: photo + name only (same switch as รับบริการ)
  const [slim, setSlim] = useState(() => {
    try {
      return localStorage.getItem("thaiwell.patients.slim") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("thaiwell.patients.slim", slim ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [slim]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const wide = useWide();
  const today = todayISO();
  const weekEnd = addISODays(today, 7);

  const rows = useMemo<Row[]>(() => {
    const next = new Map<string, Appointment>();
    for (const a of store.appointments) {
      if (a.date < today || (a.status !== "waiting" && a.status !== "active")) continue;
      const cur = next.get(a.patientId);
      if (!cur || a.date + a.start < cur.date + cur.start) next.set(a.patientId, a);
    }
    return store.patients.map((p) => ({ p, c: creditInfo(p, store.appointments), pain: [...p.painHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.score, next: next.get(p.id) }));
  }, [store.patients, store.appointments, today]);

  const stats = useMemo(
    () => ({
      all: rows.length,
      course: rows.filter((r) => r.c).length,
      low: rows.filter((r) => r.c && r.c.remaining <= 1).length,
      week: rows.filter((r) => r.next && r.next.date <= weekEnd).length,
    }),
    [rows, weekEnd],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "course" && !r.c) return false;
      if (filter === "low" && !(r.c && r.c.remaining <= 1)) return false;
      if (filter === "week" && !(r.next && r.next.date <= weekEnd)) return false;
      return !q || `${r.p.name} ${r.p.hn} ${r.p.phone} ${r.p.complaint}`.toLowerCase().includes(q);
    });
    // soonest appointment first; patients without one go last, then by name
    return list.sort((a, b) => {
      if (!a.next && !b.next) return bare(a.p.name).localeCompare(bare(b.p.name), "th");
      return (a.next ? a.next.date + a.next.start : "9") .localeCompare(b.next ? b.next.date + b.next.start : "9");
    });
  }, [rows, filter, query, weekEnd]);

  // keep a selection on wide screens
  const current = selected && visible.some((r) => r.p.id === selected) ? selected : visible[0]?.p.id ?? null;

  const open = (id: string) => (wide ? setSelected(id) : setDrawer(id));
  const setFilter = (f: Filter) => setParams(f === "all" ? {} : { filter: f });

  const STAT: { key: Filter; label: string; icon: typeof ListFilter }[] = [
    { key: "all", label: "ทั้งหมด", icon: UsersRound },
    { key: "course", label: "มีแผนการรักษา", icon: ClipboardPlus },
    { key: "low", label: "เครดิตใกล้หมด", icon: Hourglass },
    { key: "week", label: "มีนัดใน 7 วัน", icon: CalendarRange },
  ];

  const listPane = (
        <div className="panel plist">
          <div className="plist__items scroll-y">
            {visible.map((r, i) => {
              const sel = wide && r.p.id === current;
              return (
                <motion.button
                  key={r.p.id}
                  className="prow"
                  title={wide && (slim || (aiOpen && current)) ? r.p.name : undefined}
                  aria-pressed={sel}
                  onClick={() => open(r.p.id)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.25), duration: 0.28 }}
                >
                  {sel && <motion.span layoutId="prow-sel" className="prow__sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <Avatar name={r.p.name} src={patientPhoto(r.p)} shape="squircle" />
                  <span className="prow__id">
                    <b>{r.p.name}</b>
                    <small>
                      {r.p.hn} · {r.p.gender} {r.p.age} ปี
                    </small>
                    <span className="prow__chips">
                      {r.c ? (
                        <Badge tone={r.c.remaining <= 1 ? "danger" : "neutral"} compact>
                          เครดิต {r.c.remaining}/{r.c.total}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" compact>
                          รายครั้ง
                        </Badge>
                      )}
                      {r.pain !== undefined && <PainMini score={r.pain} />}
                    </span>
                  </span>
                  {(slim || (aiOpen && current)) && (
                    <span className="prow__slim">
                      <b>{r.p.name.replace(/^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.)\s*/, "").split(/\s+/)[0]}</b>
                      <small>{r.next ? r.next.start : "—"}</small>
                    </span>
                  )}
                  <span className="prow__meta">
                    {r.next ? (
                      <span className="prow__next">
                        {r.next.start}
                        <small>{Math.abs(diffDays(r.next.date, todayISO())) <= 1 ? relativeDay(r.next.date) : thaiDateShort(r.next.date)}</small>
                      </span>
                    ) : (
                      <span className="prow__next prow__next--none">ไม่มีนัด</span>
                    )}
                  </span>
                </motion.button>
              );
            })}
            {visible.length === 0 && <EmptyState onGlass icon={<UsersRound size={24} />} title="ไม่พบผู้รับบริการ" description="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />}
          </div>
        </div>
  );

  return (
    <WorkPage
      eyebrow="ผู้มารับบริการ"
      title="ผู้มารับบริการ"
      bell={false}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} />
          <FilterMenu value={filter} onChange={setFilter} options={STAT.map((f) => ({ value: f.key, label: f.label, count: stats[f.key], icon: f.icon }))} />
          <IconButton label="เพิ่มผู้รับบริการ" variant="white" className="padd-btn" onClick={() => setAdding(true)}>
            <UserPlus size={20} strokeWidth={1.8} />
          </IconButton>
        </>
      }
    >
      {wide ? (
        <Workspace
          storageKey="thaiwell.patients.layout"
          flexMin={380}
          className={slim || (aiOpen && current) ? "pws is-slim" : "pws"}
          panes={[
            ...(solo ? [] : [{ id: "list", width: slim || (aiOpen && current) ? 96 : 300, min: slim || (aiOpen && current) ? 96 : undefined, fixed: true, collapsible: true, menu: <ListModeMenu slim={slim} setSlim={setSlim} />, node: listPane }]),
            {
              id: "detail",
              locked: true,
              menu: (
                <button type="button" className="ws__icon" onClick={() => setSolo((v) => !v)} aria-label={solo ? "แสดงรายการ" : "ขยายเต็มจอ"} title={solo ? "แสดงรายการ" : "ขยายเต็มจอ"}>
                  {solo ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              ),
              node: (
                <div className="panel pdetail">
                  <div className="sheet">
                    <PatientDetail id={current} onAdd={() => setAdding(true)} onAIPlan={() => setAiOpen((v) => !v)} aiOpen={aiOpen && !!current} />
                  </div>
                </div>
              ),
            },
            ...(aiOpen && current
              ? [
                  {
                    id: "ai",
                    width: 400,
                    min: 320,
                    max: 560,
                    collapsible: true,
                    node: (
                      <div className="panel vp__hist pai">
                        <div className="sheet">
                          <div className="vp__hist-head">
                            <div>
                              <b>แผนการรักษาโดย AI</b>
                              <small>{store.patientById(current).name}</small>
                            </div>
                            <IconButton label="ปิด" variant="soft" onClick={() => setAiOpen(false)}>
                              <X size={18} />
                            </IconButton>
                          </div>
                          <div className="vp__hist-body scroll-y scroll-y--light">
                            <AIPlanCard p={store.patientById(current)} panel />
                          </div>
                        </div>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <div className="pwrap">{listPane}</div>
      )}

      <PatientDrawer id={drawer} onClose={() => setDrawer(null)} />
      <AddPatientDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setParams({});
          setQuery("");
          open(id);
        }}
      />
    </WorkPage>
  );
}

function AddPatientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const store = useStore();
  const toast = useToast();
  const empty = { title: "นาย", first: "", last: "", gender: "ชาย" as Patient["gender"], dob: "", phone: "", complaint: "", conditions: "", photo: "", cid: "", allergies: "", ecName: "", ecPhone: "", ecRel: "" };
  const [f, setF] = useState(empty);
  const age = ageFrom(f.dob);
  const cidDigits = f.cid.replace(/\D/g, "");
  const cidOk = !cidDigits || validCitizenId(cidDigits);
  const valid = f.first.trim() && f.last.trim() && age !== null && age >= 0 && age < 120 && /^[0-9-]{9,12}$/.test(f.phone) && cidOk;

  const submit = () => {
    const id = store.nextId("p");
    store.dispatch({
      type: "addPatient",
      patient: {
        id,
        hn: `HN${String(641_000 + store.patients.length).padStart(7, "0")}`,
        name: `${f.title} ${f.first.trim()} ${f.last.trim()}`,
        gender: f.gender,
        age: age ?? 0,
        birthDate: f.dob,
        birthMonth: Number(f.dob.slice(5, 7)) || undefined,
        citizenId: cidDigits || undefined,
        allergies: f.allergies.split(",").map((x) => x.trim()).filter(Boolean),
        emergency: f.ecName.trim() ? { name: f.ecName.trim(), phone: f.ecPhone.trim(), relation: f.ecRel.trim() || undefined } : undefined,
        phone: f.phone,
        complaint: f.complaint.trim() || "ต้องการนวดผ่อนคลาย",
        conditions: f.conditions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        painHistory: [],
        registeredOn: todayISO(),
        photo: f.photo || undefined,
      },
    });
    toast({ message: `ลงทะเบียน ${f.title} ${f.first} ${f.last} แล้ว` });
    setF(empty);
    onClose();
    onCreated(id);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เพิ่มผู้รับบริการใหม่"
      subtitle="ผู้ป่วยรายใหม่ต้องพบแพทย์แผนไทยเพื่อประเมินและวางแผนการรักษาก่อน"
      footer={
        <>
          <Button variant="outline" size="lg" fill onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" fill disabled={!valid} onClick={submit}>
            บันทึก
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <PhotoPicker name={`${f.first || "?"}`} src={f.photo || undefined} size="xl" onPick={(photo) => setF({ ...f, photo })} />
        <p className="tw-meta" style={{ lineHeight: 1.5, whiteSpace: "normal" }}>
          แตะเพื่อถ่ายรูปด้วยกล้อง iPad หรือเลือกจากคลังภาพ
          <br />
          ถ่ายเฉพาะเมื่อผู้ป่วยยินยอม · รูปใช้ยืนยันตัวตนในคลินิกเท่านั้น
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 12 }}>
        <Field label="คำนำหน้า">
          <Select
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value, gender: e.target.value === "นาย" ? "ชาย" : "หญิง" })}
          >
            <option>นาย</option>
            <option>นาง</option>
            <option>นางสาว</option>
          </Select>
        </Field>
        <Field label="ชื่อ">
          <Input value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} autoFocus />
        </Field>
        <Field label="นามสกุล">
          <Input value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />
        </Field>
        <Field label="วันเกิด" className="span-2" hint={age !== null ? `อายุ ${age} ปี · ใช้คำนวณธาตุเจ้าเรือน` : "ใช้คำนวณอายุและธาตุเจ้าเรือน"}>
          <Input type="date" max={todayISO()} value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />
        </Field>
        <Field label="เบอร์โทรศัพท์" hint="แจ้งเตือนนัดผ่านแอป">
          <Input inputMode="tel" placeholder="081-234-5678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="เลขบัตรประชาชน" className="span-3" hint={cidOk ? "ไม่บังคับ · 13 หลัก" : "เลขบัตรไม่ถูกต้อง ตรวจสอบอีกครั้ง"}>
          <Input inputMode="numeric" placeholder="1-2345-67890-12-3" value={f.cid} maxLength={17} onChange={(e) => setF({ ...f, cid: formatCid(e.target.value) })} aria-invalid={!cidOk} />
        </Field>
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <Field label="อาการสำคัญ">
          <Textarea value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} placeholder="เช่น ปวดคอ บ่า ไหล่ขวา 3 วัน" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="โรคประจำตัว" hint="คั่นด้วยเครื่องหมายจุลภาค">
            <Input value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} placeholder="ความดันโลหิตสูง, เบาหวาน" />
          </Field>
          <Field label="การแพ้ยา / น้ำมัน / สมุนไพร" hint="สำคัญ · แสดงเตือนตอนรับบริการ">
            <Input value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="เช่น ยาหม่อง, ไพล" />
          </Field>
        </div>
        <Field label="ผู้ติดต่อฉุกเฉิน" hint="ไม่บังคับ">
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.8fr", gap: 8 }}>
            <Input value={f.ecName} onChange={(e) => setF({ ...f, ecName: e.target.value })} placeholder="ชื่อ" />
            <Input inputMode="tel" value={f.ecPhone} onChange={(e) => setF({ ...f, ecPhone: e.target.value })} placeholder="เบอร์โทร" />
            <Input value={f.ecRel} onChange={(e) => setF({ ...f, ecRel: e.target.value })} placeholder="เกี่ยวข้องเป็น" />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

/** whole years from an ISO birth date */
function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate()) ? 1 : 0);
}
/** Thai national ID checksum */
function validCitizenId(d: string) {
  if (!/^\d{13}$/.test(d)) return false;
  const sum = d.slice(0, 12).split("").reduce((n, c, i) => n + Number(c) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}
/** 1-2345-67890-12-3 */
function formatCid(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 13);
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12)].filter(Boolean).join("-");
}
