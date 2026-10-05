import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { X, Activity, Thermometer, Scissors, Droplet, Zap, Bandage, Baby, IdCard, PhoneCall, HeartPulse, CreditCard, Check, ShieldAlert, ShieldCheck, Maximize2, Minimize2, CalendarRange, ClipboardPlus, Hourglass, ListFilter, UserPlus, UsersRound } from "lucide-react";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, Dialog, EmptyState, Field, IconButton, Input, SearchField, Select, Textarea, useToast } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { PatientDrawer } from "../../features/PatientDrawer";
import { PainMini } from "../../features/RecordCards";
import { creditInfo } from "../../data/domain";
import type { CreditInfo } from "../../data/domain";
import type { Appointment, CounterScreening, Patient } from "../../data/types";
import { addISODays, diffDays, relativeDay, thaiDateShort, todayISO } from "../../data/thaiDate";
import { patientPhoto } from "../../data/avatars";
import { PatientDetail } from "./PatientDetail";
import { AIPlanCard } from "../../features/AIPlan";
import "../visits/visits.css";
import { FilterMenu } from "../../features/FilterMenu";
import { Workspace } from "../../features/Workspace";
import { CardReaderDialog } from "../../features/CardReaderDialog";
import { PhotoSlot } from "../../features/PhotoSlot";
import { BirthDateField, ageFrom, isFullDate, thaiBirth } from "../../features/BirthDateField";
import { ListModeMenu } from "../../features/ListModeMenu";
import { Body3D } from "../../features/Body3D";
import { toArea, type BodyArea } from "../../features/BodyMap";
import idFace from "../../assets/cardreader/id_face.png";
import "./patients.css";

const areasOf = (xs: string[]) => [...new Set(xs.map((x) => toArea(x.trim())).filter((x): x is BodyArea => !!x))];
const RELATIONS = ["บิดา", "มารดา", "สามี", "ภรรยา", "บุตร", "พี่", "น้อง", "ญาติ", "เพื่อน", "ผู้ดูแล", "อื่น ๆ"];

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
  const [editing, setEditing] = useState<string | null>(null);
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
              // ••• → resize against the AI panel (edge grip), move, or expand to full screen
              actions: (
                <button type="button" className="ws__icon" onClick={() => setSolo((v) => !v)} aria-label={solo ? "แสดงรายการ" : "ขยายเต็มจอ"} title={solo ? "แสดงรายการ" : "ขยายเต็มจอ"}>
                  {solo ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              ),
              node: (
                <div className="panel pdetail">
                  <div className="sheet">
                    <PatientDetail id={current} onAdd={() => setAdding(true)} onEdit={() => setEditing(current)} onAIPlan={() => setAiOpen((v) => !v)} aiOpen={aiOpen && !!current} />
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
                            <AIPlanCard key={current} p={store.patientById(current)} panel />
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
      <AddPatientDialog open={!!editing} edit={editing ? store.patientById(editing) : null} onClose={() => setEditing(null)} onCreated={() => {}} />
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

function AddPatientDialog({ open, onClose, onCreated, edit }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; /** edit this patient instead of registering a new one */ edit?: Patient | null }) {
  const store = useStore();
  const toast = useToast();
  const empty = { title: "นาย", first: "", last: "", gender: "ชาย" as Patient["gender"], dob: "", phone: "", email: "", complaint: "", conditions: "", photo: "", cid: "", allergies: "", ecName: "", ecPhone: "", ecRel: "", address: "" };
  const fromPatient = (p: Patient) => {
    const m = p.name.match(/^(นางสาว|นาง|นาย)\s*(\S+)\s*(.*)$/);
    const d = p.citizenId ?? "";
    return {
      title: m?.[1] ?? (p.gender === "ชาย" ? "นาย" : "นางสาว"),
      first: m?.[2] ?? p.name,
      last: m?.[3] ?? "",
      gender: p.gender,
      dob: p.birthDate ?? "",
      phone: p.phone,
      email: p.email ?? "",
      complaint: p.complaint,
      conditions: p.conditions.join(", "),
      photo: p.photo ?? "",
      cid: [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12)].filter(Boolean).join("-"),
      allergies: (p.allergies ?? []).join(", "),
      ecName: p.emergency?.name ?? "",
      ecPhone: p.emergency?.phone ?? "",
      ecRel: p.emergency?.relation ?? "",
      address: p.address ?? "",
    };
  };
  const [f, setF] = useState(empty);
  const [step, setStep] = useState(0);
  const emptyScr = { bpSys: "", bpDia: "", pulse: "", fever: false, pregnant: false, recentSurgery: false, numbness: false, bloodThinner: false, skinProblem: false, pressure: "ปานกลาง" as CounterScreening["pressure"], painAreas: [] as BodyArea[], avoidAreas: [] as BodyArea[], pain: null as number | null };
  const [scr, setScr] = useState(emptyScr);
  const [skipScr, setSkipScr] = useState(false);
  const [hold, setHold] = useState<{ area: BodyArea; x: number; y: number } | null>(null);
  // tap = painful area; long-press opens a menu to mark it no-massage (an area is one or the other)
  const toggleArea = (a: BodyArea) => {
    setHold(null);
    setScr((x) => ({ ...x, painAreas: x.painAreas.includes(a) ? x.painAreas.filter((y) => y !== a) : [...x.painAreas, a], avoidAreas: x.avoidAreas.filter((y) => y !== a) }));
  };
  const setAvoid = (a: BodyArea, on: boolean) => {
    setHold(null);
    setScr((x) => ({ ...x, avoidAreas: on ? [...x.avoidAreas.filter((y) => y !== a), a] : x.avoidAreas.filter((y) => y !== a), painAreas: on ? x.painAreas.filter((y) => y !== a) : x.painAreas }));
  };
  const [reader, setReader] = useState(false);
  const [fromCard, setFromCard] = useState(false);
  // load the patient when the edit dialog opens
  useEffect(() => {
    if (!open) return;
    setF(edit ? fromPatient(edit) : empty);
    setStep(0);
    setFromCard(false);
    const sc = edit?.screening;
    setScr(sc ? { bpSys: sc.bpSys ? String(sc.bpSys) : "", bpDia: sc.bpDia ? String(sc.bpDia) : "", pulse: sc.pulse ? String(sc.pulse) : "", fever: sc.fever, pregnant: !!sc.pregnant, recentSurgery: sc.recentSurgery, numbness: sc.numbness, bloodThinner: sc.bloodThinner, skinProblem: sc.skinProblem, pressure: sc.pressure, painAreas: areasOf(sc.painAreas ?? []), avoidAreas: areasOf(sc.avoid.split(/[,·]\s*/)), pain: sc.pain ?? null } : emptyScr);
    setHold(null);
    setSkipScr(!!edit && !sc);
  }, [open, edit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const age = ageFrom(f.dob);
  const cidDigits = f.cid.replace(/\D/g, "");
  const cidOk = !cidDigits || validCitizenId(cidDigits);
  const valid = f.first.trim() && f.last.trim() && age !== null && age >= 0 && age < 120 && (!f.phone.trim() || /^[0-9-]{9,12}$/.test(f.phone)) && cidOk;

  const screening: CounterScreening | undefined = skipScr
    ? edit?.screening
    : {
        at: new Date().toISOString(),
        bpSys: Number(scr.bpSys) || undefined,
        bpDia: Number(scr.bpDia) || undefined,
        pulse: Number(scr.pulse) || undefined,
        fever: scr.fever,
        pregnant: f.gender === "หญิง" ? scr.pregnant : null,
        recentSurgery: scr.recentSurgery,
        numbness: scr.numbness,
        bloodThinner: scr.bloodThinner,
        skinProblem: scr.skinProblem,
        pressure: scr.pressure,
        avoid: scr.avoidAreas.join(", "),
        painAreas: scr.painAreas.length ? scr.painAreas : undefined,
        pain: scr.pain ?? undefined,
      };
  const flags = screening ? screeningFlags(screening, store.settings.bpThreshold) : [];
  const submit = () => {
    if (edit) {
      store.dispatch({
        type: "updatePatient",
        id: edit.id,
        patch: {
          name: `${f.title} ${f.first.trim()} ${f.last.trim()}`,
          gender: f.gender,
          age: age ?? edit.age,
          birthDate: f.dob,
          birthMonth: Number(f.dob.slice(5, 7)) || undefined,
          citizenId: cidDigits || undefined,
          allergies: f.allergies.split(",").map((x) => x.trim()).filter(Boolean),
          emergency: f.ecName.trim() ? { name: f.ecName.trim(), phone: f.ecPhone.trim(), relation: f.ecRel.trim() || undefined } : undefined,
          phone: f.phone.trim(),
          email: f.email.trim() || undefined,
          complaint: f.complaint.trim() || edit.complaint,
          conditions: f.conditions.split(",").map((x) => x.trim()).filter(Boolean),
          photo: f.photo || undefined,
          address: f.address.trim() || undefined,
          screening,
        },
      });
      toast({ message: "บันทึกข้อมูลผู้รับบริการแล้ว" });
      onClose();
      return;
    }
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
        phone: f.phone.trim(),
        email: f.email.trim() || undefined,
        complaint: f.complaint.trim() || "ต้องการนวดผ่อนคลาย",
        conditions: f.conditions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        painHistory: [],
        registeredOn: todayISO(),
        photo: f.photo || undefined,
        address: f.address.trim() || undefined,
        screening,
      },
    });
    toast({ message: `ลงทะเบียน ${f.title} ${f.first} ${f.last} แล้ว` });
    setF(empty);
    onClose();
    onCreated(id);
  };

  const STEPS = ["ลงทะเบียนข้อมูล", "คัดกรอง", "สรุปข้อมูล"];
  // vital-sign status shown on the tiles
  const sys = Number(scr.bpSys) || 0;
  const bpThreshold = store.settings.bpThreshold ?? 160;
  const bpState = !sys ? { tone: "idle", label: "" } : sys >= bpThreshold ? { tone: "stop", label: "สูง · ห้ามนวด" } : sys >= 140 || sys < 90 ? { tone: "warn", label: sys < 90 ? "ต่ำ" : "ค่อนข้างสูง" } : { tone: "ok", label: "ปกติ" };
  const pr = Number(scr.pulse) || 0;
  const pulseState = !pr ? { tone: "idle", label: "" } : pr > 100 ? { tone: "warn", label: "เร็ว" } : pr < 50 ? { tone: "warn", label: "ช้า" } : { tone: "ok", label: "ปกติ" };
  const contra = [
    { key: "fever", label: "มีไข้ / ติดเชื้อ", hint: "ห้ามนวด", level: "stop", Icon: Thermometer },
    { key: "recentSurgery", label: "ผ่าตัดภายใน 30 วัน", hint: `ห้ามนวด ${store.settings.surgeryRecoveryDays ?? 30} วัน`, level: "stop", Icon: Scissors },
    { key: "bloodThinner", label: "ยาละลายลิ่มเลือด", hint: "ลดแรงนวด", level: "warn", Icon: Droplet },
    { key: "numbness", label: "ชา / อ่อนแรง", hint: "ระวัง", level: "warn", Icon: Zap },
    { key: "skinProblem", label: "แผล / ผื่น / โรคผิวหนัง", hint: "เลี่ยงบริเวณนั้น", level: "warn", Icon: Bandage },
    ...(f.gender === "หญิง" ? [{ key: "pregnant", label: "ตั้งครรภ์ / อาจตั้งครรภ์", hint: "ระวัง", level: "warn", Icon: Baby }] : []),
  ].map((c) => ({ ...c, key: c.key as "fever" | "recentSurgery" | "bloodThinner" | "numbness" | "skinProblem" | "pregnant", on: !!scr[c.key as keyof typeof scr] }));
  const row = (k: string, v?: string) => (
    <div>
      <dt>{k}</dt>
      <dd>{v || "—"}</dd>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="ap"
      title={edit ? "แก้ไขข้อมูลผู้รับบริการ" : "เพิ่มผู้รับบริการใหม่"}
      subtitle={edit ? `${edit.hn} · การแก้ไขจะบันทึกในประวัติการแก้ไข` : "ลงทะเบียน 3 ขั้นตอน · ผู้ป่วยรายใหม่ต้องพบแพทย์แผนไทยก่อนเริ่มแผนการรักษา"}
      footer={
        <>
          <Button variant="outline" size="md" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? "ยกเลิก" : "ย้อนกลับ"}
          </Button>
          {step === 1 && (
            <Button
              variant="outline"
              size="md"
                            onClick={() => {
                setSkipScr(true);
                setStep(2);
              }}
            >
              ข้ามการคัดกรอง
            </Button>
          )}
          {step < 2 ? (
            <Button
                            size="md"
                            disabled={step === 0 && !valid}
              onClick={() => {
                if (step === 1) setSkipScr(false);
                setStep(step + 1);
              }}
            >
              ถัดไป
            </Button>
          ) : (
            <Button size="md" disabled={!valid} onClick={submit}>
              บันทึก
            </Button>
          )}
        </>
      }
    >
      <ol className="ap-steps">
        {STEPS.map((t, i) => (
          <li key={t} className={i < step ? "is-done" : i === step ? "is-now" : undefined}>
            <button type="button" disabled={i > step && !valid} onClick={() => setStep(i)}>
              <i>{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</i>
              <span>{t}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="ap-pane ap-cols">
          <div className="ap-col">
            <PhotoSlot name={f.first} value={f.photo || undefined} onChange={(photo) => setF({ ...f, photo })} />
            <section className="ap-sec">
              <h4>
                <span style={{ ["--c" as string]: "#3b82c4" }}>
                  <IdCard size={14} />
                </span>
                ข้อมูลตามบัตรประชาชน
              </h4>
              <div className="ap-grid">
                <Field label="เลขบัตรประชาชน" className="span-3" hint={cidOk ? undefined : "เลขบัตรไม่ถูกต้อง ตรวจสอบอีกครั้ง"}>
                  <Input inputMode="numeric" className="ap-cid" placeholder="1-2345-67890-12-3" value={f.cid} maxLength={17} onChange={(e) => setF({ ...f, cid: formatCid(e.target.value) })} aria-invalid={!cidOk} />
                </Field>
                <Field label="คำนำหน้า">
                  <Select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value, gender: e.target.value === "นาย" ? "ชาย" : "หญิง" })}>
                    <option>นาย</option>
                    <option>นาง</option>
                    <option>นางสาว</option>
                  </Select>
                </Field>
                <Field label="ชื่อ *">
                  <Input value={f.first} onChange={(e) => setF({ ...f, first: e.target.value })} />
                </Field>
                <Field label="นามสกุล *">
                  <Input value={f.last} onChange={(e) => setF({ ...f, last: e.target.value })} />
                </Field>
                <Field label="เพศ *">
                  <div className="ap-gender">
                    {(["ชาย", "หญิง"] as const).map((g) => (
                      <motion.button
                        key={g}
                        type="button"
                        className="tw-chip"
                        aria-pressed={f.gender === g}
                        whileTap={{ scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 500, damping: 26 }}
                        onClick={() => setF({ ...f, gender: g, title: g === "ชาย" ? "นาย" : f.title === "นาย" ? "นางสาว" : f.title })}
                      >
                        {f.gender === g && (
                          <motion.span layoutId="ap-gender-pill" className="ap-gender__pill" transition={{ type: "spring", stiffness: 420, damping: 32 }} />
                        )}
                        <span className="ap-gender__t">{g}</span>
                      </motion.button>
                    ))}
                  </div>
                </Field>
                <Field label="วัน เดือน ปีเกิด *" className="span-2">
                  <BirthDateField value={f.dob} onChange={(dob) => setF({ ...f, dob })} />
                </Field>
                <Field label="ที่อยู่ตามบัตร" className="span-3">
                  <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด" />
                </Field>
              </div>
            </section>
            {!valid && <p className="ap-need">กรอกช่องที่มี * ให้ครบเพื่อไปขั้นถัดไป</p>}
          </div>
          <div className="ap-col">
            {!edit && (
              <button type="button" className={fromCard ? "ap-card is-done" : "ap-card"} onClick={() => setReader(true)}>
                <span className="ap-card__body">
                  <b>{fromCard ? "อ่านข้อมูลจากบัตรแล้ว" : "อ่านข้อมูลจากบัตรประชาชน"}</b>
                  <span className="ap-card__steps">
                    {["เสียบบัตร", "อ่านชิป", "กรอกอัตโนมัติ"].map((t, i) => (
                      <span key={t} className={fromCard ? "is-done" : undefined}>
                        <i>{fromCard ? <Check size={11} strokeWidth={3} /> : i + 1}</i>
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
                <em>
                  <CreditCard size={14} />
                  {fromCard ? "อ่านบัตรใหม่" : "อ่านบัตร"}
                </em>
                <span className="ap-card__art" aria-hidden>
                  <span className="ap-card__ring" />
                  <span className="ap-card__id">
                    <img src={idFace} alt="" />
                    <span className="ap-card__scan" />
                  </span>
                </span>
              </button>
            )}
            <section className="ap-sec">
              <h4>
                <span style={{ ["--c" as string]: "#2f8a52" }}>
                  <PhoneCall size={14} />
                </span>
                ช่องทางติดต่อ
              </h4>
              <div className="ap-grid">
                <Field label="เบอร์โทรศัพท์" className="span-3">
                  <Input inputMode="tel" placeholder="081-234-5678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                </Field>
                <Field label="อีเมล" className="span-3">
                  <Input type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" placeholder="name@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                </Field>
                <Field label="ผู้ติดต่อฉุกเฉิน" className="span-3">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Input style={{ gridColumn: "1 / -1" }} value={f.ecName} onChange={(e) => setF({ ...f, ecName: e.target.value })} placeholder="ชื่อ-นามสกุล" />
                    <Input inputMode="tel" value={f.ecPhone} onChange={(e) => setF({ ...f, ecPhone: e.target.value })} placeholder="เบอร์โทร" />
                    <Select value={f.ecRel} onChange={(e) => setF({ ...f, ecRel: e.target.value })} aria-label="ความเกี่ยวข้อง">
                      <option value="">เกี่ยวข้องเป็น</option>
                      {(RELATIONS.includes(f.ecRel) || !f.ecRel ? RELATIONS : [f.ecRel, ...RELATIONS]).map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </div>
                </Field>
              </div>
            </section>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="ap-pane ap-cols ap-scr">
          <div className="ap-col">
            <section className="ap-sec ap-body">
              <Body3D compact sex={f.gender} heatmap={Object.fromEntries(scr.painAreas.map((x) => [x, Math.max(0.35, (scr.pain ?? 6) / 10)]))} avoid={scr.avoidAreas} onToggle={toggleArea} onHold={(area, at) => setHold({ area, ...at })}>
                {(scr.painAreas.length > 0 || scr.avoidAreas.length > 0) && (
                  <div className="ap-body__picked">
                    {scr.painAreas.map((x) => (
                      <button key={x} type="button" className="is-pain" onClick={() => toggleArea(x)}>
                        {x}
                        <X size={11} strokeWidth={2.6} />
                      </button>
                    ))}
                    {scr.avoidAreas.map((x) => (
                      <button key={x} type="button" className="is-avoid" onClick={() => setAvoid(x, false)}>
                        {x}
                        <X size={11} strokeWidth={2.6} />
                      </button>
                    ))}
                  </div>
                )}
                {hold && (
                  <motion.div className="ap-hold" style={{ left: hold.x, top: hold.y }} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
                    <b>{hold.area}</b>
                    {scr.avoidAreas.includes(hold.area) ? (
                      <button type="button" onClick={() => setAvoid(hold.area, false)}>
                        ยกเลิกห้ามนวด
                      </button>
                    ) : (
                      <button type="button" className="is-avoid" onClick={() => setAvoid(hold.area, true)}>
                        <i /> ห้ามนวด
                      </button>
                    )}
                    <button type="button" className="is-x" aria-label="ปิด" onClick={() => setHold(null)}>
                      <X size={13} />
                    </button>
                  </motion.div>
                )}
              </Body3D>
              <p className="ap-body__hint">แตะ = จุดที่ปวด · กดค้าง = ห้ามนวด</p>
              <Field label="ระดับความปวด (0–10)">
                <div className="ap-pain" role="radiogroup" aria-label="ระดับความปวด">
                  {Array.from({ length: 11 }, (_, n) => n).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={scr.pain === n} style={{ ["--pc" as string]: n >= 7 ? "#d8392a" : n >= 4 ? "#e08a1e" : "#2f9a5b" }} onClick={() => setScr({ ...scr, pain: scr.pain === n ? null : n })}>
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            </section>
          </div>
          <div className="ap-col">
            <section className="ap-sec">
              <h4>
                <span style={{ ["--c" as string]: "#c2482b" }}>
                  <HeartPulse size={14} />
                </span>
                ข้อมูลสุขภาพ
              </h4>
              <div className="ap-grid">
                <Field label="อาการสำคัญ" className="span-3">
                  <Textarea rows={2} value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} placeholder="เช่น ปวดคอ บ่า ไหล่ขวา 3 วัน" />
                </Field>
                <Field label="โรคประจำตัว" className="span-3">
                  <Input value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} placeholder="ความดันโลหิตสูง, เบาหวาน" />
                </Field>
                <Field label="การแพ้ยา / น้ำมัน / สมุนไพร" className="span-3">
                  <Input value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} placeholder="เช่น ยาหม่อง, ไพล" />
                </Field>
              </div>
            </section>
            <section className="ap-sec">
              <h4>
                <span style={{ ["--c" as string]: "#c2482b" }}>
                  <Activity size={14} />
                </span>
                สัญญาณชีพ
              </h4>
              <div className="ap-vt">
                <label className={`ap-vt__tile is-${bpState.tone}`}>
                  <span className="ap-vt__top">
                    <small>ความดัน</small>
                    {bpState.label && <em>{bpState.label}</em>}
                  </span>
                  <span className="ap-vt__val">
                    <input inputMode="numeric" placeholder="120" aria-label="ความดันตัวบน" value={scr.bpSys} onChange={(e) => setScr({ ...scr, bpSys: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                    <i>/</i>
                    <input inputMode="numeric" placeholder="80" aria-label="ความดันตัวล่าง" value={scr.bpDia} onChange={(e) => setScr({ ...scr, bpDia: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                    <u>mmHg</u>
                  </span>
                </label>
                <label className={`ap-vt__tile is-${pulseState.tone}`}>
                  <span className="ap-vt__top">
                    <small>ชีพจร</small>
                    {pulseState.label && <em>{pulseState.label}</em>}
                  </span>
                  <span className="ap-vt__val">
                    <input inputMode="numeric" placeholder="72" aria-label="ชีพจร" value={scr.pulse} onChange={(e) => setScr({ ...scr, pulse: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                    <u>ครั้ง/นาที</u>
                  </span>
                </label>
              </div>
              <div className="ap-press">
                <small>แรงนวดที่ต้องการ</small>
                <div className="ap-seg">
                  {(["เบา", "ปานกลาง", "หนัก"] as const).map((x) => (
                    <button key={x} type="button" aria-pressed={scr.pressure === x} onClick={() => setScr({ ...scr, pressure: x })}>
                      {x}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="ap-sec">
              <h4>
                <span style={{ ["--c" as string]: "#d97706" }}>
                  <ShieldCheck size={14} />
                </span>
                ข้อห้ามก่อนนวด
                <em className={`ap-ci__sum ${contra.some((c) => c.on && c.level === "stop") ? "is-stop" : contra.some((c) => c.on) ? "is-warn" : "is-ok"}`}>
                  {contra.some((c) => c.on) ? `พบ ${contra.filter((c) => c.on).length} ข้อ` : "ไม่พบ"}
                </em>
              </h4>
              <div className="ap-ci">
                {contra.map((c) => (
                  <button key={c.key} type="button" className={`is-${c.level}`} aria-pressed={c.on} onClick={() => setScr({ ...scr, [c.key]: !c.on })}>
                    <i>
                      <c.Icon size={16} strokeWidth={2.2} />
                    </i>
                    <span>
                      <b>{c.label}</b>
                      <small>{c.hint}</small>
                    </span>
                    <span className="ap-ci__tick">{c.on && <Check size={12} strokeWidth={3} />}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      <CardReaderDialog
        open={reader}
        onClose={() => setReader(false)}
        onRead={(d) => {
          setF((x) => ({ ...x, title: d.title, first: d.first, last: d.last, gender: d.gender, dob: d.dob, cid: formatCid(d.cid), address: d.address }));
          setFromCard(true);
          toast({ message: `อ่านบัตรของ ${d.title} ${d.first} ${d.last} แล้ว · ตรวจสอบข้อมูลก่อนไปขั้นถัดไป` });
        }}
      />

      {step === 2 && (
        <div className="ap-pane ap-sum">
          <div className="ap-sum__who">
            <Avatar name={f.first || "?"} src={f.photo || undefined} size="lg" shape="squircle" />
            <div>
              <b>
                {f.title} {f.first} {f.last}
              </b>
              <small>
                {f.gender} · {age ?? "—"} ปี{f.dob && isFullDate(f.dob) ? ` · เกิด ${thaiBirth(f.dob)}` : ""}
              </small>
            </div>
            <button type="button" onClick={() => setStep(0)}>
              แก้ไข
            </button>
          </div>
          <dl className="ap-kv">
            {row("เบอร์โทร", f.phone)}
            {row("อีเมล", f.email)}
            {row("เลขบัตรประชาชน", f.cid)}
            {row("ที่อยู่", f.address)}
            {row("อาการสำคัญ", f.complaint)}
            {row("โรคประจำตัว", f.conditions)}
            {row("การแพ้", f.allergies)}
            {row("ผู้ติดต่อฉุกเฉิน", f.ecName ? `${f.ecName}${f.ecRel ? ` (${f.ecRel})` : ""} · ${f.ecPhone}` : "")}
          </dl>
          <div className="ap-sum__scr">
            <div className="ap-sum__h">
              <b>ผลคัดกรอง</b>
              <button type="button" onClick={() => setStep(1)}>
                {skipScr ? "คัดกรองตอนนี้" : "แก้ไข"}
              </button>
            </div>
            {skipScr && !screening ? (
              <p className="ap-skip">ข้ามการคัดกรอง · คัดกรองได้ตอนผู้ป่วยมารับบริการ</p>
            ) : (
              <>
                <p className={flags.some((x) => x.level === "stop") ? "ap-res is-stop" : flags.length ? "ap-res is-warn" : "ap-res is-ok"}>
                  {flags.length ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
                  {flags.length ? (flags.some((x) => x.level === "stop") ? "พบข้อห้าม · ต้องให้แพทย์ประเมินก่อนนวด" : `ข้อควรระวัง ${flags.length} ข้อ`) : "ผ่านการคัดกรอง"}
                </p>
                {flags.length > 0 && (
                  <ul className="ap-flags">
                    {flags.map((x) => (
                      <li key={x.label} className={`is-${x.level}`}>
                        {x.label}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="ap-mini">
                  ความดัน {screening?.bpSys ? `${screening.bpSys}/${screening.bpDia ?? "—"}` : "—"} · ชีพจร {screening?.pulse ?? "—"} · แรงนวด {screening?.pressure}
                  {screening?.pain != null ? ` · ปวด ${screening.pain}/10` : ""}
                  {screening?.painAreas?.length ? ` · จุดที่ปวด ${screening.painAreas.join(", ")}` : ""}
                  {screening?.avoid ? ` · ไม่นวด ${screening.avoid}` : ""}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
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

/** flags from the counter screening (stop = do not massage today) */
function screeningFlags(s: CounterScreening, bpThreshold = 160): { label: string; level: "stop" | "warn" }[] {
  const out: { label: string; level: "stop" | "warn" }[] = [];
  if (s.fever) out.push({ label: "มีไข้ / การติดเชื้อ", level: "stop" });
  if (s.bpSys && s.bpSys >= bpThreshold) out.push({ label: `ความดันสูง ${s.bpSys}/${s.bpDia ?? "—"}`, level: "stop" });
  if (s.recentSurgery) out.push({ label: "ผ่าตัดภายใน 30 วัน", level: "stop" });
  if (s.pregnant) out.push({ label: "ตั้งครรภ์", level: "warn" });
  if (s.bloodThinner) out.push({ label: "ใช้ยาละลายลิ่มเลือด · ลดแรงนวด", level: "warn" });
  if (s.numbness) out.push({ label: "มีอาการชา / อ่อนแรง", level: "warn" });
  if (s.skinProblem) out.push({ label: "มีแผล / ผื่นบริเวณที่นวด", level: "warn" });
  return out;
}
