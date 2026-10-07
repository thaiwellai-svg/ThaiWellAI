import { useState } from "react";
import { DEFAULT_SETTINGS } from "../../data/seed";
import { resetBothSystems } from "../../sync/demo";
import { DEMO } from "../../data/mode";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  MapPin,
  GraduationCap,
  Bell,
  Building2,
  CalendarCog,
  Check,
  ChevronRight,
  Plus,
  Trash2,
  Clock3,
  Image,
  Lamp,
  ShieldCheck,
  Sofa,
  Sparkles,
  Stethoscope,
  Trees,
  UserRound,
  Database,
  RotateCcw,
  KeyRound,
  PenLine,
  LogOut,
  Eye,
  EyeOff,
  CircleAlert,
  History,
  Activity,
  HeartHandshake,
  Ticket,
  Receipt,
  Volume2,
  QrCode,
} from "lucide-react";
import { useStore } from "../../store/store";
import { Avatar, Badge, Button, Dialog, Field, Input, Select, Switch, ease, spring, useToast } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { TH_WEEKDAYS, TH_WEEKDAYS_SHORT, baht, fromMinutes } from "../../data/thaiDate";
import type { ClinicSettings, Service, ShareTopic, Therapist } from "../../data/types";
import { AVATAR_CHOICES, avatarUrl, avatarValue, resolvePhoto, therapistPhoto } from "../../data/avatars";
import { PhotoPicker } from "../../features/PhotoPicker";
import { UserGuide } from "../../features/UserGuide";
import { signOut } from "../../features/session";
import "../appointments/appointments.css";
import "../../features/shift-editor.css";
import "../../features/book-dialog.css";
import { VatSetting } from "../../features/TaxInvoice";
import { RoomsEditor } from "../../features/RoomsEditor";
import { AuditLog, BackupPanel, PromptPaySetting } from "../../features/SettingsExtras";
import { CALL_VOICES, DEFAULT_CALL_VOICE, announce, callText } from "../../features/tts";
import "./settings.css";

const SECTIONS = [
  { id: "account", label: "บัญชีผู้ใช้งาน", desc: "โปรไฟล์ · ตำแหน่ง · รหัสผ่าน", icon: UserRound, tint: "#4c845a" },
  { id: "clinic", label: "คลินิก", desc: "ชื่อ · ที่อยู่ · โลเคชั่น · พื้นหลังแอป", icon: Building2, tint: "#5b7fa6" },
  { id: "hours", label: "เวลาทำการและคิว", desc: "เวลาเปิด–ปิด · วันทำการ · เตียง", icon: Clock3, tint: "#d08a3c" },
  { id: "services", label: "บริการและราคา", desc: "รายการบริการของคลินิก", icon: Sparkles, tint: "#b0739a" },
  { id: "staff", label: "ผู้บำบัด", desc: "รายชื่อและตารางงาน", icon: Stethoscope, tint: "#3e9a8f" },
  { id: "safety", label: "กฎคัดกรองความปลอดภัย", desc: "ความดัน · ผ่าตัด · ข้อห้าม", icon: ShieldCheck, tint: "#c0614f" },
  { id: "notify", label: "การแจ้งเตือน", desc: "เจ้าหน้าที่ · ผู้ป่วย · ส่งประวัติไปแอป", icon: Bell, tint: "#d9a531" },
  { id: "payment", label: "การรับชำระเงิน", desc: "พร้อมเพย์ · ภาษีมูลค่าเพิ่ม", icon: QrCode, tint: "#2f8f9a" },
  { id: "audit", label: "ประวัติการแก้ไข", desc: "ใครทำอะไร เมื่อไร", icon: History, tint: "#7c5cc4" },
  { id: "guide", label: "คู่มือการใช้งาน", desc: "วิธีใช้ทุกเมนูแบบทีละขั้น", icon: GraduationCap, tint: "#2f8f9a" },
  { id: "data", label: "ข้อมูลและการสำรอง", desc: DEMO ? "สำรอง · กู้คืน · รีเซ็ตข้อมูลตัวอย่าง" : "สำรอง · กู้คืน", icon: Database, tint: "#7d8681" },
] as const;
/** menu groups (account lives in the profile card on top) */
const GROUPS: { label: string; ids: string[] }[] = [
  { label: "คลินิก", ids: ["clinic", "hours", "services", "staff"] },
  { label: "การดูแลผู้ป่วย", ids: ["safety", "notify"] },
  { label: "ระบบ", ids: ["payment", "audit", "data"] },
  { label: "ช่วยเหลือ", ids: ["guide"] },
];
type SectionId = (typeof SECTIONS)[number]["id"];

const BACKDROPS: { value: NonNullable<ClinicSettings["backdrop"]>; label: string; icon: typeof Sofa; tint: string }[] = [
  { value: "reception", label: "เคาน์เตอร์ต้อนรับ", icon: Sofa, tint: "linear-gradient(135deg, #e9dccb, #b89772)" },
  { value: "sala", label: "ศาลาริมสระ", icon: Trees, tint: "linear-gradient(135deg, #d9e6d6, #7f9f86)" },
  { value: "studio", label: "ห้องสตูดิโอ", icon: Lamp, tint: "linear-gradient(135deg, #efe9e1, #c9bba8)" },
  { value: "photo", label: "ภาพถ่ายเคลื่อนไหว", icon: Image, tint: "linear-gradient(135deg, #d8cfc2, #8c7a66)" },
];

/** A white group of rows with hairline separators (iOS-settings style). */
function Group({ title, desc, children }: { title?: string; desc?: string; children: ReactNode }) {
  return (
    <div className="st-group">
      {(title || desc) && (
        <div className="st-group__head">
          {title && <h3>{title}</h3>}
          {desc && <p>{desc}</p>}
        </div>
      )}
      <div className="st-group__body">{children}</div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="st-row">
      <div className="st-row__text">
        <b>{title}</b>
        {desc && <small>{desc}</small>}
      </div>
      <div className="st-row__control">{children}</div>
    </div>
  );
}

function Stepper({ value, onChange, min, max, step = 1, unit }: { value: number; onChange: (n: number) => void; min: number; max: number; step?: number; unit: string }) {
  return (
    <div className="num-stepper">
      <button type="button" aria-label="ลด" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={spring.snappy}>
          {value} <small>{unit}</small>
        </motion.span>
      </AnimatePresence>
      <button type="button" aria-label="เพิ่ม" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

const SHARE_TOPICS: { id: ShareTopic; label: string; desc: string; icon: typeof Sparkles }[] = [
  { id: "visits", label: "ประวัติการรับบริการ", desc: "วันที่ บริการ ผู้บำบัด", icon: History },
  { id: "pain", label: "Pain Score ก่อน–หลัง", desc: "กราฟระดับความปวด", icon: Activity },
  { id: "advice", label: "คำแนะนำและท่ากายบริหาร", desc: "ที่ผู้บำบัดบันทึกไว้", icon: HeartHandshake },
  { id: "credits", label: "แผนการรักษาและเครดิต", desc: "ครั้งที่ใช้ไปและคงเหลือ", icon: Ticket },
  { id: "screening", label: "ผลคัดกรองก่อนนวด", desc: "ความดัน ไข้ ข้อห้าม", icon: ShieldCheck },
  { id: "receipt", label: "ใบเสร็จรับเงิน", desc: "ค่าบริการแต่ละครั้ง", icon: Receipt },
];

const previewText = (topics: ShareTopic[]) => {
  const parts: string[] = [];
  if (topics.includes("visits")) parts.push("นวดไทยเพื่อสุขภาพ กับ พท.ป. วิภาวดี");
  if (topics.includes("pain")) parts.push("ความปวด 7 → 3");
  if (topics.includes("advice")) parts.push("มีท่ากายบริหารใหม่ 2 ท่า");
  if (topics.includes("credits")) parts.push("เครดิตคงเหลือ 4/6 ครั้ง");
  if (topics.includes("screening")) parts.push("ผลคัดกรองผ่าน");
  if (topics.includes("receipt")) parts.push("ใบเสร็จ 350 บาท");
  return parts.length ? parts.join(" · ") : "ยังไม่ได้เลือกหัวข้อ";
};

const HOURS = Array.from({ length: 18 }, (_, i) => fromMinutes((5 + i) * 60)); // 05:00 – 22:00

export default function Settings() {
  const store = useStore();
  const { settings } = store;
  const [active, setActive] = useState<SectionId>("account");
  const [saved, setSaved] = useState(0);
  const [editSvc, setEditSvc] = useState<string | null>(null);
  const [editStaff, setEditStaff] = useState<string | null>(null);
  const [clinicEdit, setClinicEdit] = useState<ClinicForm | null>(null);
  const [locating, setLocating] = useState(false);
  const [askOut, setAskOut] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const set = <K extends keyof ClinicSettings>(key: K, value: ClinicSettings[K]) => {
    store.dispatch({ type: "updateSettings", patch: { [key]: value } as Partial<ClinicSettings> });
    setSaved(Date.now());
  };
  const section = SECTIONS.find((s) => s.id === active)!;
  const backdrop = settings.backdrop === "room3d" || !settings.backdrop ? "reception" : settings.backdrop;
  const openDays = [1, 2, 3, 4, 5, 6, 0].filter((d) => !settings.closedWeekdays.includes(d));

  return (
    <WorkPage
      eyebrow="ตั้งค่า"
      title="ตั้งค่า"
      bell={false}
      actions={
        <>
        <Button variant="white" size="md" className="set-tour" leading={<GraduationCap size={16} />} onClick={() => setActive("guide")}>
          คู่มือการใช้งาน
        </Button>
        <AnimatePresence>
          {saved > 0 && (
            <motion.span
              key={saved}
              className="saved-pill"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 1.8, times: [0, 0.1, 0.8, 1] }}
            >
              <Check size={14} strokeWidth={3} /> บันทึกอัตโนมัติแล้ว
            </motion.span>
          )}
        </AnimatePresence>
        </>
      }
    >
      <div className="appt st-page">
        {/* rail */}
        <aside className="appt__rail scroll-y">
          <button type="button" className="st-me" aria-pressed={active === "account"} onClick={() => setActive("account")}>
            {active === "account" && <motion.span layoutId="st-sel" className="st-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <Avatar name={settings.staffName} src={settings.staffPhoto} size="lg" shape="squircle" color="var(--color-brand)" />
            <span className="st-me__text">
              <b>{settings.staffName}</b>
              <small>{settings.staffRole}</small>
              <em>บัญชี · รหัสผ่าน</em>
            </span>
            <ChevronRight size={16} className="st-nav__chev" />
          </button>

          {GROUPS.map((g) => (
            <nav key={g.label} className="st-group" aria-label={g.label}>
              <p className="st-group__label">{g.label}</p>
              <div className="st-nav">
                {g.ids.map((id) => {
                  const s = SECTIONS.find((x) => x.id === id)!;
                  const on = active === s.id;
                  return (
                    <button key={s.id} type="button" className="st-nav__item" aria-pressed={on} onClick={() => setActive(s.id)}>
                      {on && <motion.span layoutId="st-sel" className="st-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                      <span className="st-nav__icon" style={{ background: s.tint }}>
                        <s.icon size={16} strokeWidth={2.1} />
                      </span>
                      <b className="st-nav__label">{s.label}</b>
                      <ChevronRight size={16} className="st-nav__chev" />
                    </button>
                  );
                })}
              </div>
            </nav>
          ))}

          <div className="st-nav st-nav--out">
            <button type="button" className="st-nav__item st-nav__out" onClick={() => setAskOut(true)}>
              <span className="st-nav__icon">
                <LogOut size={16} strokeWidth={2.1} />
              </span>
              <b className="st-nav__label">ออกจากระบบ</b>
            </button>
          </div>
        </aside>

        {/* section */}
        <div className="panel appt__main">
          <div className="sheet">
            <div className="st-head">
              <span className="st-head__icon" style={{ background: section.tint, color: "var(--white)" }}>
                <section.icon size={20} strokeWidth={1.9} />
              </span>
              <div>
                <h2>{section.label}</h2>
                <p>{section.desc}</p>
              </div>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                className="st-body scroll-y scroll-y--light"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: ease.out }}
              >
                <div className="st-inner">
                {active === "account" && <AccountSection onSaved={() => setSaved(Date.now())} />}

                {active === "payment" && (
                  <Group title="พร้อมเพย์ของคลินิก" desc="ใช้สร้าง QR ตอนรับชำระเงินที่เคาน์เตอร์ · ตรวจให้ตรงกับบัญชีจริงของคลินิก">
                    <PromptPaySetting />
                  </Group>
                )}
                {active === "payment" && (
                  <Group title="ภาษีมูลค่าเพิ่มและใบกำกับภาษี" desc="เปิดเมื่อคลินิกจดทะเบียน VAT · ใช้ออกใบกำกับภาษีเต็มรูปให้ผู้รับบริการ">
                    <VatSetting />
                  </Group>
                )}

                {active === "audit" && <AuditLog />}

                {active === "guide" && <UserGuide />}
                {active === "data" && (
                  <>
                    <Group title="สำรองและกู้คืนข้อมูล">
                      <BackupPanel />
                    </Group>
                    {DEMO && <Group title="รีเซ็ตข้อมูลจำลอง" desc="ข้อมูลทั้งหมดในแอปเป็นข้อมูลสมมติ ไม่มีข้อมูลสุขภาพของบุคคลจริง บันทึกไว้ในเครื่องนี้เท่านั้น">
                      <Row title="สร้างข้อมูลตัวอย่างใหม่" desc="ผู้ป่วย คิวนัด คำขอจอง การชำระเงิน แจ้งเตือน และตารางงาน จะกลับเป็นชุดเริ่มต้นของวันนี้ · การตั้งค่าคลินิกและบัญชีผู้ใช้ยังอยู่">
                        <Button variant="outline" size="md" className="acc-logout" leading={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)}>
                          รีเซ็ตข้อมูล
                        </Button>
                      </Row>
                    </Group>}
                  </>
                )}

                {active === "clinic" && (
                  <>
                    <Group title="ข้อมูลคลินิก" desc="ชื่อ ที่อยู่ เบอร์โทร และตำแหน่ง แสดงในหน้า “สถานที่” ของแอป ThaiWell AI ให้ผู้ใช้โทร/นำทางมาได้">
                      <div className="st-row">
                        <div className="st-row__text">
                          <small>ชื่อหน่วยบริการ</small>
                          <b>{settings.clinicName}</b>
                          <small>{settings.clinicAddress || "ยังไม่ได้ระบุที่อยู่"}</small>
                          <small>
                            {settings.clinicPhone ? `โทร ${settings.clinicPhone}` : "ยังไม่ได้ระบุเบอร์โทร"} ·{" "}
                            {settings.clinicLat !== undefined && settings.clinicLng !== undefined ? (
                              <a href={`https://www.google.com/maps?q=${settings.clinicLat},${settings.clinicLng}`} target="_blank" rel="noreferrer">
                                ดูตำแหน่งบนแผนที่
                              </a>
                            ) : (
                              "ยังไม่ได้ปักตำแหน่ง"
                            )}
                          </small>
                        </div>
                        <Button
                          variant="outline"
                          size="md"
                          leading={<PenLine size={15} />}
                          onClick={() =>
                            setClinicEdit({
                              name: settings.clinicName,
                              address: settings.clinicAddress ?? "",
                              phone: settings.clinicPhone ?? "",
                              where: settings.clinicLat !== undefined && settings.clinicLng !== undefined ? `${settings.clinicLat}, ${settings.clinicLng}` : "",
                            })
                          }
                        >
                          แก้ไข
                        </Button>
                      </div>
                    </Group>
                    <Group title="พื้นหลังแอป" desc="ฉาก 3D สร้างด้วยโค้ดทั้งหมด · ภาพถ่ายเคลื่อนไหวใช้ภาพจาก Figma">
                      <div className="st-backdrops">
                        {BACKDROPS.map((b) => (
                          <button key={b.value} type="button" className="st-bd" aria-pressed={backdrop === b.value} onClick={() => set("backdrop", b.value)}>
                            <span className="st-bd__thumb" style={{ background: b.tint }}>
                              <b.icon size={22} strokeWidth={1.7} />
                            </span>
                            <span className="st-bd__label">{b.label}</span>
                            <i className="st-bd__tick" aria-hidden>
                              <Check size={11} strokeWidth={3} />
                            </i>
                          </button>
                        ))}
                      </div>
                    </Group>
                  </>
                )}

                {active === "hours" && (
                  <>
                    <Group title="เวลาทำการ" desc="รอบคิวและตารางงานของเจ้าหน้าที่จะอยู่ในช่วงนี้ · พักกลางวัน 12:00–13:00">
                      <Row title="เปิด – ปิด">
                        <div className="st-time">
                          <Select value={settings.openTime} onChange={(e) => set("openTime", e.target.value)} aria-label="เวลาเปิด">
                            {HOURS.filter((h) => h < settings.closeTime).map((h) => (
                              <option key={h}>{h}</option>
                            ))}
                          </Select>
                          <span>ถึง</span>
                          <Select value={settings.closeTime} onChange={(e) => set("closeTime", e.target.value)} aria-label="เวลาปิด">
                            {HOURS.filter((h) => h > settings.openTime).map((h) => (
                              <option key={h}>{h}</option>
                            ))}
                          </Select>
                        </div>
                      </Row>
                      <Row title="วันเปิดทำการ" desc={`เปิด ${openDays.length} วัน · วันที่ปิด ผู้ป่วยจะจองคิวไม่ได้`}>
                        <div className="days">
                          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                            const closed = settings.closedWeekdays.includes(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                className="day-toggle"
                                aria-pressed={!closed}
                                title={`${TH_WEEKDAYS[d]} · ${closed ? "ปิด" : "เปิด"}`}
                                onClick={() => set("closedWeekdays", closed ? settings.closedWeekdays.filter((x) => x !== d) : [...settings.closedWeekdays, d])}
                              >
                                {TH_WEEKDAYS_SHORT[d]}
                              </button>
                            );
                          })}
                        </div>
                      </Row>
                    </Group>
                    <Group title="คิว">
                      <Row title="จำนวนเตียงต่อรอบ" desc="จำกัดผู้รับบริการในแต่ละช่วงเวลา">
                        <Stepper value={settings.bedsPerSlot} min={1} max={20} unit="เตียง" onChange={(n) => set("bedsPerSlot", n)} />
                      </Row>
                      <Row title="ระยะห่างขั้นต่ำระหว่างนัด" desc="ใช้ตรวจตอนวางแผนนัดตามคอร์ส">
                        <Stepper value={settings.minDaysBetweenSessions} min={1} max={7} unit="วัน" onChange={(n) => set("minDaysBetweenSessions", n)} />
                      </Row>
                      <Row title="ต้องอนุมัติคำขอจองคิว" desc="คำขอจากแอป ThaiWell AI ต้องผ่านเจ้าหน้าที่ก่อนเข้าคิว">
                        <Switch checked={settings.requireApproval} label="ต้องอนุมัติคำขอจองคิว" onChange={(v) => set("requireApproval", v)} />
                      </Row>
                    </Group>
                    <Group title="ห้องและเตียง" desc="ใช้ตอนเลือกเตียงเริ่มรับบริการ · แตะชื่อห้องเพื่อแก้ · เตียงที่มีผู้ป่วยใช้อยู่ลบไม่ได้">
                      <RoomsEditor />
                    </Group>
                    <Group title="เสียงเรียกคิว" desc="เสียง AI ภาษาไทยจาก BMS VoxCPM · มีเสียงกริ่งก่อนประกาศ · ถ้าเชื่อมต่อไม่ได้จะใช้เสียงของเครื่องแทน">
                      <Row title="เสียงผู้ประกาศ">
                        <div className="st-voice">
                          <Select value={settings.callVoice ?? DEFAULT_CALL_VOICE} onChange={(e) => set("callVoice", e.target.value)} aria-label="เสียงผู้ประกาศ">
                            {CALL_VOICES.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label} · {v.gender}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="outline"
                            leading={<Volume2 size={15} />}
                            onClick={() => {
                              void announce(callText("A001", "สมใจ ใจดี", "ห้องนวดไทย"), settings.callVoice ?? DEFAULT_CALL_VOICE).then((how) => how === "device" && toast({ message: "เชื่อมต่อ VoxCPM ไม่ได้ · ใช้เสียงของเครื่องแทน", tone: "danger" }));
                            }}
                          >
                            ฟังตัวอย่าง
                          </Button>
                        </div>
                      </Row>
                    </Group>
                  </>
                )}

                {active === "safety" && (
                  <>
                    <Group title="เกณฑ์ที่ปรับได้" desc="ระบบใช้กฎเหล่านี้ตรวจแบบคัดกรองก่อนอนุมัติคิว — ตรวจสอบย้อนกลับได้ ไม่ใช้ AI ตัดสินแทน">
                      <Row title="ความดันตัวบนที่ต้องพบแพทย์ก่อน" desc="เกินค่านี้ระบบแจ้งเตือนระดับห้ามนวด">
                        <Stepper value={settings.bpThreshold} min={130} max={200} step={5} unit="mmHg" onChange={(n) => set("bpThreshold", n)} />
                      </Row>
                      <Row title="ระยะพักฟื้นหลังผ่าตัด" desc="ห้ามนวดหากผ่าตัดไม่เกินจำนวนวันนี้">
                        <Stepper value={settings.surgeryRecoveryDays} min={7} max={90} unit="วัน" onChange={(n) => set("surgeryRecoveryDays", n)} />
                      </Row>
                    </Group>
                    <Group title="ข้อห้ามและข้อควรระวัง" desc="กฎตายตัวตามแนวทางการนวดไทย">
                      {[
                        ["โรคติดต่อระยะแพร่กระจาย", "ห้ามให้บริการ", "danger"],
                        ["มีไข้", "ห้ามให้บริการ", "danger"],
                        ["ตั้งครรภ์", "พบแพทย์แผนไทยก่อน", "danger"],
                        ["มีประจำเดือน", "ข้อควรระวัง", "warning"],
                      ].map(([k, v, tone]) => (
                        <Row key={k} title={k}>
                          <Badge tone={tone as "danger" | "warning"} compact>
                            {v}
                          </Badge>
                        </Row>
                      ))}
                    </Group>
                  </>
                )}

                {active === "services" && (
                  <>
                    <div className="st-group">
                      <div className="st-group__head st-group__head--row">
                        <div>
                          <h3>บริการ {store.services.length} รายการ</h3>
                          <p>แตะบริการเพื่อแก้ชื่อ ระยะเวลา หรือราคา</p>
                        </div>
                        <Button size="md" leading={<Plus size={16} />} onClick={() => setEditSvc("new")}>
                          เพิ่มบริการ
                        </Button>
                      </div>
                      <div className="st-group__body">
                        {store.services.map((s) => {
                          const by = store.therapists.filter((t) => t.shifts.some((x) => x.services.includes(s.id)));
                          return (
                            <button key={s.id} type="button" className="st-row st-row--btn" onClick={() => setEditSvc(s.id)}>
                              <div className="st-row__text">
                                <b>{s.name}</b>
                                <small>
                                  {s.minutes} นาที · {by.length ? `${by.length} คนให้บริการ` : "ยังไม่มีผู้ให้บริการ"}
                                </small>
                              </div>
                              <span className="st-faces">
                                {by.map((t) => (
                                  <Avatar key={t.id} name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                                ))}
                              </span>
                              <span className="st-price">{baht(s.price)} ฿</span>
                              <ChevronRight size={16} className="st-nav__chev" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {active === "staff" && (
                  <div className="st-group">
                    <div className="st-group__head st-group__head--row">
                      <div>
                        <h3>ผู้บำบัด {store.therapists.length} คน</h3>
                        <p>แตะเพื่อแก้ข้อมูล · เวลาทำงานและบริการกำหนดที่หน้าจัดตารางงาน</p>
                      </div>
                      <Button size="md" leading={<Plus size={16} />} onClick={() => setEditStaff("new")}>
                        เพิ่มผู้บำบัด
                      </Button>
                    </div>
                    <div className="st-group__body">
                      {store.therapists.map((t) => {
                        const days = new Set(t.shifts.flatMap((x) => x.days)).size;
                        return (
                          <button key={t.id} type="button" className="st-row st-row--btn" onClick={() => setEditStaff(t.id)}>
                            <Avatar name={t.name} src={therapistPhoto(t)} size="md" color={t.color} />
                            <div className="st-row__text">
                              <b>{t.name}</b>
                              <small>
                                {t.role}
                                {t.phone ? ` · ${t.phone}` : ""}
                              </small>
                            </div>
                            <span className="st-meta">
                              {days ? (
                                <>
                                  <b>{days} วัน</b>
                                  <small>{t.services.length} บริการ</small>
                                </>
                              ) : (
                                <em className="so-ex">ยังไม่มีตาราง</em>
                              )}
                            </span>
                            <ChevronRight size={16} className="st-nav__chev" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {active === "notify" && (
                  <>
                    <Group title="แจ้งเตือนเจ้าหน้าที่" desc="แสดงที่กระดิ่งในแอปนี้">
                      <Row title="คำขอจองคิวใหม่" desc="เมื่อผู้ป่วยส่งคำขอผ่านแอป ThaiWell AI">
                        <Switch checked={settings.notifyNewRequest} label="คำขอจองคิวใหม่" onChange={(v) => set("notifyNewRequest", v)} />
                      </Row>
                      <Row title="ผู้ป่วยไม่มาตามนัด" desc={settings.notifyNoShow ? `เมื่อพ้นเวลานัด ${settings.noShowMinutes} นาที` : "ปิดอยู่"}>
                        <Switch checked={settings.notifyNoShow} label="ผู้ป่วยไม่มาตามนัด" onChange={(v) => set("notifyNoShow", v)} />
                      </Row>
                      <AnimatePresence initial={false}>
                        {settings.notifyNoShow && (
                          <motion.div className="st-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            <Row title="แจ้งหลังเวลานัด">
                              <Stepper value={settings.noShowMinutes} min={5} max={60} step={5} unit="นาที" onChange={(n) => set("noShowMinutes", n)} />
                            </Row>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Group>

                    <Group title="แจ้งเตือนผู้มารับบริการ" desc="ส่งผ่านแอป ThaiWell AI ของผู้ป่วย">
                      <Row title="ยืนยันและเลื่อนนัด" desc="เมื่ออนุมัติคำขอ จัดคิวใหม่ หรือปฏิเสธพร้อมเหตุผล">
                        <Switch checked={settings.notifyConfirm} label="ยืนยันและเลื่อนนัด" onChange={(v) => set("notifyConfirm", v)} />
                      </Row>
                      <Row title="เตือนก่อนถึงนัด" desc={settings.notifyReminder ? `ล่วงหน้า ${settings.reminderHours} ชม.` : "ปิดอยู่"}>
                        <Switch checked={settings.notifyReminder} label="เตือนก่อนถึงนัด" onChange={(v) => set("notifyReminder", v)} />
                      </Row>
                      <AnimatePresence initial={false}>
                        {settings.notifyReminder && (
                          <motion.div className="st-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            <Row title="ส่งล่วงหน้า">
                              <Stepper value={settings.reminderHours} min={2} max={72} step={2} unit="ชม." onChange={(n) => set("reminderHours", n)} />
                            </Row>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <Row title="แบบติดตามผลหลังนวด" desc={settings.followUpReminder ? `Pain Score และท่ากายบริหาร · หลังรับบริการ ${settings.followUpHours} ชม.` : "ปิดอยู่"}>
                        <Switch checked={settings.followUpReminder} label="แบบติดตามผลหลังนวด" onChange={(v) => set("followUpReminder", v)} />
                      </Row>
                      <AnimatePresence initial={false}>
                        {settings.followUpReminder && (
                          <motion.div className="st-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            <Row title="ส่งหลังรับบริการ">
                              <Stepper value={settings.followUpHours} min={12} max={96} step={12} unit="ชม." onChange={(n) => set("followUpHours", n)} />
                            </Row>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Group>

                    <Group title="ใบเสร็จและการชำระเงิน" desc="ใช้ในหน้าคิดเงิน">
                      <Row title="ส่งสลิปอัตโนมัติ" desc={settings.autoSendSlip ? "ส่งสลิปเข้าแอป ThaiWell AI ทันทีที่ชำระเงินเสร็จ" : "ปิดอยู่ · กดส่งเองจากหน้าสลิป"}>
                        <Switch checked={!!settings.autoSendSlip} label="ส่งสลิปอัตโนมัติ" onChange={(v) => set("autoSendSlip", v)} />
                      </Row>
                    </Group>

                    <Group title="ส่งประวัติไปแอป ThaiWell AI" desc="ผู้ป่วยดูประวัติการรักษาของตัวเองในแอปได้ · ส่งเฉพาะหัวข้อที่เลือก">
                      <Row title="ส่งประวัติให้ผู้ป่วย" desc={settings.shareHistory ? `${settings.shareTopics.length} หัวข้อ · ${settings.shareTiming === "after" ? "ทันทีหลังรับบริการ" : "สรุปทุกวันจันทร์"}` : "ปิดอยู่ · ผู้ป่วยจะไม่เห็นประวัติในแอป"}>
                        <Switch checked={settings.shareHistory} label="ส่งประวัติให้ผู้ป่วย" onChange={(v) => set("shareHistory", v)} />
                      </Row>
                      <AnimatePresence initial={false}>
                        {settings.shareHistory && (
                          <motion.div className="st-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            <div className="st-share">
                              <span className="tw-field__label">หัวข้อที่ส่ง</span>
                              <div className="st-topics">
                                {SHARE_TOPICS.map((tp) => {
                                  const on = settings.shareTopics.includes(tp.id);
                                  return (
                                    <button
                                      key={tp.id}
                                      type="button"
                                      className="st-topic"
                                      aria-pressed={on}
                                      onClick={() => set("shareTopics", on ? settings.shareTopics.filter((x) => x !== tp.id) : [...settings.shareTopics, tp.id])}
                                    >
                                      <span className="st-topic__icon">
                                        <tp.icon size={17} strokeWidth={1.9} />
                                      </span>
                                      <span className="st-topic__text">
                                        <b>{tp.label}</b>
                                        <small>{tp.desc}</small>
                                      </span>
                                      <i className="shift__tick" aria-hidden>
                                        <Check size={11} strokeWidth={3} />
                                      </i>
                                    </button>
                                  );
                                })}
                              </div>

                              <span className="tw-field__label">ส่งเมื่อ</span>
                              <div className="st-timing" role="radiogroup" aria-label="ส่งเมื่อ">
                                {(
                                  [
                                    ["after", "ทันทีหลังรับบริการ", "เมื่อเจ้าหน้าที่กดรับบริการเสร็จ"],
                                    ["weekly", "สรุปรายสัปดาห์", "ส่งรวมทุกวันจันทร์ 09:00"],
                                  ] as const
                                ).map(([v, l, d]) => (
                                  <button key={v} type="button" role="radio" aria-checked={settings.shareTiming === v} onClick={() => set("shareTiming", v)}>
                                    <b>{l}</b>
                                    <small>{d}</small>
                                  </button>
                                ))}
                              </div>

                              <span className="tw-field__label">ตัวอย่างที่ผู้ป่วยเห็น</span>
                              <div className="st-preview">
                                <span className="st-preview__app">
                                  <Sparkles size={14} />
                                </span>
                                <div>
                                  <div className="st-preview__top">
                                    <b>ThaiWell AI</b>
                                    <small>{settings.shareTiming === "after" ? "เมื่อสักครู่" : "จันทร์ 09:00"}</small>
                                  </div>
                                  <p className="st-preview__title">{settings.shareTiming === "after" ? "บันทึกการรับบริการวันนี้" : "สรุปการรักษาสัปดาห์นี้"}</p>
                                  <p className="st-preview__body">{previewText(settings.shareTopics)}</p>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Group>
                  </>
                )}

                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <Dialog
        open={clinicEdit !== null}
        onClose={() => setClinicEdit(null)}
        className="svc-dialog"
        leading={
          <span className="st-head__icon">
            <Building2 size={20} strokeWidth={1.9} />
          </span>
        }
        title="แก้ไขข้อมูลคลินิก"
        subtitle="แสดงบนหน้าหลัก ข้อความถึงผู้ป่วย และหน้า “สถานที่” ในแอปผู้ใช้"
        footer={
          <>
            <Button variant="outline" size="lg" onClick={() => setClinicEdit(null)}>
              ยกเลิก
            </Button>
            <Button
              size="lg"
              disabled={!clinicEdit?.name.trim() || (!!clinicEdit?.where.trim() && !parseLatLng(clinicEdit.where))}
              leading={<Check size={16} />}
              onClick={() => {
                const c = clinicEdit!;
                const ll = parseLatLng(c.where);
                store.dispatch({
                  type: "updateSettings",
                  patch: { clinicName: c.name.trim(), clinicAddress: c.address.trim() || undefined, clinicPhone: c.phone.trim() || undefined, clinicLat: ll?.[0], clinicLng: ll?.[1] },
                });
                setSaved(Date.now());
                setClinicEdit(null);
              }}
            >
              บันทึก
            </Button>
          </>
        }
      >
        {clinicEdit && (
          <div className="clinic-form">
            <Field label="ชื่อหน่วยบริการ">
              <Input value={clinicEdit.name} onChange={(e) => setClinicEdit({ ...clinicEdit, name: e.target.value })} autoFocus />
            </Field>
            <Field label="ที่อยู่">
              <textarea className="tw-input clinic-form__addr" rows={3} value={clinicEdit.address} onChange={(e) => setClinicEdit({ ...clinicEdit, address: e.target.value })} placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" />
            </Field>
            <Field label="เบอร์โทรคลินิก">
              <Input inputMode="tel" value={clinicEdit.phone} onChange={(e) => setClinicEdit({ ...clinicEdit, phone: e.target.value })} placeholder="02-123-4567" />
            </Field>
            <Field
              label="ตำแหน่งบนแผนที่"
              hint={clinicEdit.where.trim() && !parseLatLng(clinicEdit.where) ? "อ่านพิกัดไม่ได้ — วางลิงก์ Google Maps หรือพิมพ์ เช่น 13.7337, 100.5717" : "อยู่ที่คลินิก → กด “ใช้ตำแหน่งปัจจุบัน” · หรือคัดลอกลิงก์จาก Google Maps มาวาง"}
            >
              <div className="clinic-form__loc">
                <Input value={clinicEdit.where} onChange={(e) => setClinicEdit({ ...clinicEdit, where: e.target.value })} placeholder="ลิงก์ Google Maps หรือ ละติจูด, ลองจิจูด" />
                <Button
                  variant="outline"
                  size="md"
                  leading={<MapPin size={15} />}
                  disabled={locating}
                  onClick={() => {
                    if (!navigator.geolocation) return toast({ message: "อุปกรณ์นี้หาตำแหน่งไม่ได้" });
                    setLocating(true);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setLocating(false);
                        setClinicEdit((c) => c && { ...c, where: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` });
                      },
                      () => {
                        setLocating(false);
                        toast({ message: "หาตำแหน่งไม่ได้ — อนุญาตการเข้าถึงตำแหน่ง หรือวางลิงก์ Google Maps แทน" });
                      },
                      { enableHighAccuracy: true, timeout: 15000 },
                    );
                  }}
                >
                  {locating ? "กำลังหา…" : "ใช้ตำแหน่งปัจจุบัน"}
                </Button>
              </div>
              {parseLatLng(clinicEdit.where) && (
                <a className="clinic-form__map" href={`https://www.google.com/maps?q=${parseLatLng(clinicEdit.where)!.join(",")}`} target="_blank" rel="noreferrer">
                  ตรวจตำแหน่งบน Google Maps ({parseLatLng(clinicEdit.where)!.map((x) => x.toFixed(5)).join(", ")})
                </a>
              )}
            </Field>
          </div>
        )}
      </Dialog>
      <Dialog
        open={askOut}
        onClose={() => setAskOut(false)}
        title="ออกจากระบบ?"
        subtitle="ข้อมูลคิวและการตั้งค่ายังอยู่ในเครื่องนี้ เข้าสู่ระบบอีกครั้งเพื่อใช้งานต่อ"
        footer={
          <>
            <Button variant="outline" size="lg" fill onClick={() => setAskOut(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              size="lg"
              fill
              leading={<LogOut size={16} />}
              onClick={() => {
                setAskOut(false);
                navigate("/");
                signOut();
              }}
            >
              ออกจากระบบ
            </Button>
          </>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="รีเซ็ตข้อมูลจำลอง?"
        subtitle="ข้อมูลผู้ป่วย คิว และการชำระเงินในเครื่องนี้ และข้อมูลที่เชื่อมกับแอป ThaiWell AI (cloud) จะถูกแทนด้วยชุดตัวอย่างใหม่ ย้อนกลับไม่ได้ · แอปบนมือถือให้ปิดแล้วเปิดใหม่"
        footer={
          <>
            <Button variant="outline" size="lg" fill onClick={() => setConfirmReset(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              size="lg"
              fill
              leading={<RotateCcw size={16} />}
              onClick={() => {
                // ข้อมูลสาธิตชุดเดียวกับแอป ThaiWell AI → รีเซ็ต cloud ไปพร้อมกัน
                setConfirmReset(false);
                toast({ message: "รีเซ็ตข้อมูลจำลองทั้ง 2 ระบบแล้ว" });
                resetBothSystems(store.dispatch, DEFAULT_SETTINGS.clinicName);
              }}
            >
              รีเซ็ตข้อมูล
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
      <TherapistDialog id={editStaff} onClose={() => setEditStaff(null)} onSaved={() => setSaved(Date.now())} />
      <ServiceDialog id={editSvc} onClose={() => setEditSvc(null)} onSaved={() => setSaved(Date.now())} />

    </WorkPage>
  );
}

const DURATIONS = [30, 45, 60, 90, 120];

/** Add or edit a service: name, short label for the timetables, duration and price. */
function ServiceDialog({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [shown, setShown] = useState(id);
  if (id && id !== shown) setShown(id);
  const isNew = shown === "new";
  const current = !isNew && shown ? store.services.find((x) => x.id === shown) : undefined;
  const blank: Service = { id: "", name: "", short: "", minutes: 60, price: 300 };
  const [f, setF] = useState<Service>(blank);
  const [askDelete, setAskDelete] = useState(false);

  // load the service whenever the dialog opens
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (id && id !== loadedFor) {
    setLoadedFor(id);
    setF(id === "new" ? blank : { ...(store.services.find((x) => x.id === id) ?? blank) });
    setAskDelete(false);
  }
  if (!id && loadedFor) setLoadedFor(null);

  const used = current ? store.appointments.filter((a) => a.serviceId === current.id).length : 0;
  const offeredBy = current ? store.therapists.filter((t) => t.shifts.some((x) => x.services.includes(current.id))).length : 0;
  const dupe = store.services.some((x) => x.id !== f.id && x.name.trim() === f.name.trim());
  const valid = !!f.name.trim() && !!f.short.trim() && f.minutes > 0 && f.price >= 0 && !dupe;

  const save = () => {
    if (!valid) return;
    const service = { ...f, name: f.name.trim(), short: f.short.trim(), id: isNew ? store.nextId("s") : f.id };
    store.dispatch({ type: "saveService", service });
    toast({ message: isNew ? `เพิ่มบริการ ${service.name} แล้ว` : `บันทึกบริการ ${service.name} แล้ว` });
    onSaved();
    onClose();
  };
  const remove = () => {
    if (!current) return;
    store.dispatch({ type: "removeService", id: current.id });
    toast({ message: `ลบบริการ ${current.name} แล้ว` });
    onSaved();
    onClose();
  };

  const by = current ? store.therapists.filter((t) => t.shifts.some((x) => x.services.includes(current.id))) : [];
  const step = (n: number) => setF({ ...f, price: Math.max(0, f.price + n) });

  return (
    <Dialog
      open={id !== null}
      onClose={onClose}
      className="svc-dialog"
      leading={
        <span className="st-head__icon">
          <Sparkles size={20} strokeWidth={1.9} />
        </span>
      }
      title={isNew ? "เพิ่มบริการ" : "แก้ไขบริการ"}
      subtitle={isNew ? "บริการใหม่จะเลือกได้ในหน้ากำหนดตารางของเจ้าหน้าที่" : current?.name}
      footer={
        <>
          {!isNew && (
            <button type="button" className="svc-del" onClick={() => setAskDelete(true)}>
              <Trash2 size={15} /> ลบบริการ
            </button>
          )}
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!valid} leading={<Check size={16} />} onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="svc">
        {/* name */}
        <div className="st-group">
          <div className="st-group__body svc__card">
            <Field label="ชื่อบริการ" hint={dupe ? "มีบริการชื่อนี้แล้ว" : undefined}>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น นวดไทยเพื่อสุขภาพ" autoFocus={isNew} />
            </Field>
            <div className="svc__short">
              <Field label="ชื่อย่อ" hint="ไม่เกิน 14 ตัวอักษร">
                <Input value={f.short} maxLength={14} onChange={(e) => setF({ ...f, short: e.target.value })} placeholder="เช่น นวดสุขภาพ" />
              </Field>
              <div className="svc__preview">
                <span className="tw-field__label">แสดงในตาราง</span>
                <span className="svc__tag">{f.short.trim() || "ชื่อย่อ"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* duration */}
        <div className="st-group">
          <div className="st-group__head">
            <h3>ระยะเวลารับบริการ</h3>
          </div>
          <div className="svc__seg" role="radiogroup" aria-label="ระยะเวลา">
            {DURATIONS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={f.minutes === m} onClick={() => setF({ ...f, minutes: m })}>
                <b>{m}</b>
                <small>นาที</small>
              </button>
            ))}
          </div>
        </div>

        {/* price */}
        <div className="st-group">
          <div className="st-group__head">
            <h3>ราคา</h3>
          </div>
          <div className="svc__price">
            <button type="button" aria-label="ลด 50 บาท" disabled={f.price <= 0} onClick={() => step(-50)}>
              −
            </button>
            <label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={10}
                value={f.price}
                onChange={(e) => setF({ ...f, price: Math.max(0, Number(e.target.value)) })}
                aria-label="ราคา (บาท)"
              />
              <span>บาท</span>
            </label>
            <button type="button" aria-label="เพิ่ม 50 บาท" onClick={() => step(50)}>
              +
            </button>
          </div>
        </div>

        {/* usage */}
        {!isNew && (
          <div className="svc__usage">
            <span className="st-faces">
              {by.map((t) => (
                <Avatar key={t.id} name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
              ))}
            </span>
            <span>
              {by.length} คนให้บริการ · ใช้ในคิว {used} รายการ
            </span>
          </div>
        )}

        {askDelete && (
          <div className="alert alert--stop">
            <CircleAlert size={16} />
            <div>
              {used > 0 ? (
                <>
                  <b>ลบไม่ได้ — มีคิว {used} รายการใช้บริการนี้</b>
                  ประวัติการรับบริการยังอ้างถึงบริการนี้ ถ้าไม่เปิดให้จองแล้ว ให้นำออกจากตารางของเจ้าหน้าที่แทน
                </>
              ) : (
                <>
                  <b>ลบ {current?.name}?</b>
                  จะนำออกจากตารางของเจ้าหน้าที่ {offeredBy} คนด้วย ·{" "}
                  <button type="button" className="book__link" onClick={remove}>
                    ยืนยันลบ
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

const ROLES = ["แพทย์แผนไทยประยุกต์", "แพทย์แผนไทย", "นักศึกษาแพทย์แผนไทย", "ผู้ช่วยแพทย์แผนไทย"];
const COLORS = ["#4c845a", "#c1723e", "#077dd7", "#8b5cf6", "#d97706", "#0f766e", "#db2777", "#64748b"];

type ClinicForm = { name: string; address: string; phone: string; where: string };
/** "13.73, 100.57" · ลิงก์ Google Maps (@lat,lng / q=lat,lng / !3dlat!4dlng) → [lat, lng] */
function parseLatLng(text: string): [number, number] | null {
  const t = text.trim();
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) ?? /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t) ?? /(?:q|ll|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t) ?? /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

/** Add or edit a therapist's profile: photo, name, role, phone and colour (schedule lives in จัดตารางงาน). */
function TherapistDialog({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [shown, setShown] = useState(id);
  if (id && id !== shown) setShown(id);
  const isNew = shown === "new";
  const current = !isNew && shown ? store.therapists.find((t) => t.id === shown) : undefined;
  type Form = Pick<Therapist, "id" | "name" | "role" | "color" | "phone" | "photo">;
  const blank: Form = { id: "", name: "", role: ROLES[0], color: COLORS[store.therapists.length % COLORS.length], phone: "", photo: undefined };
  const [f, setF] = useState<Form>(blank);
  const [askDelete, setAskDelete] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (id && id !== loadedFor) {
    setLoadedFor(id);
    const t = id === "new" ? undefined : store.therapists.find((x) => x.id === id);
    setF(t ? { id: t.id, name: t.name, role: t.role, color: t.color, phone: t.phone ?? "", photo: t.photo } : blank);
    setAskDelete(false);
  }
  if (!id && loadedFor) setLoadedFor(null);

  const queues = current ? store.appointments.filter((a) => a.therapistId === current.id).length : 0;
  const days = current ? new Set(current.shifts.flatMap((x) => x.days)).size : 0;
  const phoneOk = !f.phone || /^[0-9-]{9,12}$/.test(f.phone);
  const valid = !!f.name.trim() && phoneOk;

  const save = () => {
    if (!valid) return;
    const therapist = { ...f, name: f.name.trim(), phone: f.phone?.trim() || undefined, id: isNew ? store.nextId("t") : f.id };
    store.dispatch({ type: "saveTherapist", therapist });
    toast({ message: isNew ? `เพิ่ม ${therapist.name} แล้ว · กำหนดตารางงานต่อที่หน้าจัดตารางงาน` : `บันทึกข้อมูล ${therapist.name} แล้ว` });
    onSaved();
    onClose();
  };
  const remove = () => {
    if (!current) return;
    store.dispatch({ type: "removeTherapist", id: current.id });
    toast({ message: `ลบ ${current.name} แล้ว` });
    onSaved();
    onClose();
  };

  return (
    <Dialog
      open={id !== null}
      onClose={onClose}
      className="svc-dialog"
      leading={
        <span className="st-head__icon">
          <Stethoscope size={20} strokeWidth={1.9} />
        </span>
      }
      title={isNew ? "เพิ่มผู้บำบัด" : "แก้ไขข้อมูลผู้บำบัด"}
      subtitle={isNew ? "เพิ่มแล้วกำหนดวัน เวลา และบริการที่หน้าจัดตารางงาน" : current?.name}
      footer={
        <>
          {!isNew && (
            <button type="button" className="svc-del" onClick={() => setAskDelete(true)}>
              <Trash2 size={15} /> ลบผู้บำบัด
            </button>
          )}
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!valid} leading={<Check size={16} />} onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="svc">
        <div className="tp-hero">
          <PhotoPicker name={f.name || "?"} src={resolvePhoto(f.photo) ?? (current ? therapistPhoto(current) : undefined)} size="xl" onPick={(photo) => setF({ ...f, photo })} />
          <div className="tp-hero__text">
            <b>{f.name.trim() || "ชื่อผู้บำบัด"}</b>
            <small>{f.role}</small>
            <span className="tw-meta">เลือก avatar ด้านล่าง หรือแตะรูปเพื่อถ่าย/เลือกจากคลังภาพ</span>
          </div>
        </div>

        <div className="st-group">
          <div className="st-group__body svc__card">
            <Field label="ชื่อ–นามสกุล (พร้อมคำนำหน้าวิชาชีพ)">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น พท.ป. สมใจ ใจดี" autoFocus={isNew} />
            </Field>
            <Field label="เบอร์โทรศัพท์" hint={phoneOk ? undefined : "รูปแบบเบอร์ไม่ถูกต้อง"}>
              <Input inputMode="tel" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="081-234-5678" />
            </Field>
          </div>
        </div>

        <div className="st-group">
          <div className="st-group__head">
            <h3>Avatar</h3>
            <p>ภาพประจำตัวที่แสดงในตารางนัด คิว และในแอปผู้ใช้</p>
          </div>
          <div className="tp-avatars" role="radiogroup" aria-label="เลือก avatar">
            {AVATAR_CHOICES.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={f.photo === avatarValue(k)} aria-label={`avatar ${k}`} onClick={() => setF({ ...f, photo: avatarValue(k) })}>
                <img src={avatarUrl(k)} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="st-group">
          <div className="st-group__head">
            <h3>ตำแหน่ง</h3>
          </div>
          <div className="tp-roles">
            {ROLES.map((r) => (
              <button key={r} type="button" className="shift__daychip" aria-pressed={f.role === r} onClick={() => setF({ ...f, role: r })}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="st-group">
          <div className="st-group__head">
            <h3>สีประจำตัว</h3>
            <p>ใช้ในตารางนัดเพื่อบอกว่าคิวไหนเป็นของใคร</p>
          </div>
          <div className="tp-colors" role="radiogroup" aria-label="สีประจำตัว">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c} style={{ background: c }} onClick={() => setF({ ...f, color: c })}>
                <Check size={14} strokeWidth={3} />
              </button>
            ))}
          </div>
        </div>

        {current && (
          <div className="svc__usage">
            <CalendarCog size={16} />
            <span style={{ flex: 1 }}>
              {days ? `ทำงาน ${days} วัน/สัปดาห์ · ${current.services.length} บริการ` : "ยังไม่ได้กำหนดตารางงาน"} · ลงคิวแล้ว {queues} รายการ
            </span>
            <button type="button" className="book__link" onClick={() => navigate("/planner")}>
              ไปจัดตาราง
            </button>
          </div>
        )}

        {askDelete && (
          <div className="alert alert--stop">
            <CircleAlert size={16} />
            <div>
              {queues > 0 ? (
                <>
                  <b>ลบไม่ได้ — มีคิว {queues} รายการของผู้บำบัดคนนี้</b>
                  ประวัติการรับบริการยังอ้างถึงอยู่ ถ้าไม่ได้ทำงานแล้ว ให้ปิดวันทำงานทั้งหมดในหน้าจัดตารางงานแทน
                </>
              ) : (
                <>
                  <b>ลบ {current?.name}?</b>
                  ตารางงานของคนนี้จะหายไปด้วย ·{" "}
                  <button type="button" className="book__link" onClick={remove}>
                    ยืนยันลบ
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

const STAFF_ROLES = ["เจ้าหน้าที่ประจำคลินิก", "หัวหน้าคลินิก", "แพทย์แผนไทยประยุกต์", "เจ้าหน้าที่เวชระเบียน"];

/** Signed-in user, read-only — edits happen in popups. */
function AccountSection({ onSaved }: { onSaved: () => void }) {
  const store = useStore();
  const { settings } = store;
  const [editing, setEditing] = useState<"profile" | "password" | null>(null);

  const changedAt = settings.passwordChangedAt
    ? new Date(settings.passwordChangedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <>
      <div className="st-group">
        <div className="st-group__head st-group__head--row">
          <div>
            <h3>โปรไฟล์</h3>
            <p>ชื่อและรูปแสดงบนหน้าหลัก และในประวัติการอนุมัติคิว</p>
          </div>
          <Button variant="outline" size="md" leading={<PenLine size={15} />} onClick={() => setEditing("profile")}>
            แก้ไข
          </Button>
        </div>
        <div className="st-group__body">
          <div className="acc-hero">
            <Avatar name={settings.staffName} src={settings.staffPhoto} size="xl" color="var(--color-brand)" />
            <div className="tp-hero__text">
              <b>{settings.staffName}</b>
              <small>{settings.staffRole}</small>
            </div>
          </div>
          <ReadRow label="ชื่อ–นามสกุล" value={settings.staffName} />
          <ReadRow label="ตำแหน่ง" value={settings.staffRole} />
          <ReadRow label="อีเมล" value={settings.staffEmail} empty="ยังไม่ได้ระบุ" />
          <ReadRow label="หน่วยบริการ" value={settings.clinicName} />
        </div>
      </div>

      <div className="st-group">
        <div className="st-group__head">
          <h3>ความปลอดภัย</h3>
        </div>
        <div className="st-group__body">
          <div className="st-row">
            <div className="st-row__text">
              <b>รหัสผ่าน</b>
              <small>{changedAt ? `เปลี่ยนล่าสุด ${changedAt}` : "ควรเปลี่ยนรหัสผ่านทุก 90 วัน"}</small>
            </div>
            <span className="acc-dots" aria-hidden>
              ••••••••
            </span>
            <Button variant="outline" size="md" leading={<KeyRound size={15} />} onClick={() => setEditing("password")}>
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </div>
      </div>

      <ProfileDialog open={editing === "profile"} onClose={() => setEditing(null)} onSaved={onSaved} />
      <PasswordDialog open={editing === "password"} onClose={() => setEditing(null)} onSaved={onSaved} />
    </>
  );
}

function ReadRow({ label, value, empty = "—" }: { label: string; value?: string; empty?: string }) {
  return (
    <div className="st-row acc-read">
      <span className="acc-read__label">{label}</span>
      <span className={value ? "acc-read__value" : "acc-read__value is-empty"}>{value || empty}</span>
    </div>
  );
}

function ProfileDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { settings } = store;
  const init = () => ({ name: settings.staffName, role: settings.staffRole, email: settings.staffEmail ?? "", photo: settings.staffPhoto });
  const [p, setP] = useState(init);
  const [was, setWas] = useState(false);
  if (open && !was) {
    setWas(true);
    setP(init());
  }
  if (!open && was) setWas(false);

  const emailOk = !p.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email);
  const valid = !!p.name.trim() && !!p.role.trim() && emailOk;
  const save = () => {
    if (!valid) return;
    store.dispatch({
      type: "updateSettings",
      patch: { staffName: p.name.trim(), staffRole: p.role.trim(), staffEmail: p.email.trim() || undefined, staffPhoto: p.photo },
    });
    toast({ message: "บันทึกโปรไฟล์แล้ว" });
    onSaved();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="svc-dialog"
      leading={
        <span className="st-head__icon">
          <UserRound size={20} strokeWidth={1.9} />
        </span>
      }
      title="แก้ไขโปรไฟล์"
      subtitle="ชื่อ ตำแหน่ง อีเมล และรูปโปรไฟล์"
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!valid} leading={<Check size={16} />} onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="svc">
        <div className="tp-hero">
          <PhotoPicker name={p.name || "?"} src={p.photo} size="xl" onPick={(photo) => setP({ ...p, photo })} />
          <div className="tp-hero__text">
            <b>{p.name.trim() || "ชื่อผู้ใช้งาน"}</b>
            <small>{p.role}</small>
            <span className="tw-meta">แตะรูปเพื่อถ่ายหรือเลือกจากคลังภาพ</span>
          </div>
        </div>
        <div className="st-group">
          <div className="st-group__body svc__card">
            <Field label="ชื่อ–นามสกุล">
              <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
            </Field>
            <Field label="อีเมล" hint={emailOk ? "ใช้รับลิงก์ตั้งรหัสผ่านใหม่" : "รูปแบบอีเมลไม่ถูกต้อง"}>
              <Input type="email" inputMode="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} placeholder="name@clinic.go.th" />
            </Field>
          </div>
        </div>
        <div className="st-group">
          <div className="st-group__head">
            <h3>ตำแหน่ง</h3>
          </div>
          <div className="tp-roles">
            {STAFF_ROLES.map((r) => (
              <button key={r} type="button" className="shift__daychip" aria-pressed={p.role === r} onClick={() => setP({ ...p, role: r })}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function PasswordDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [was, setWas] = useState(false);
  if (open && !was) {
    setWas(true);
    setPw({ current: "", next: "", confirm: "" });
    setShow(false);
  }
  if (!open && was) setWas(false);

  const rules = [
    { ok: pw.next.length >= 8, label: "อย่างน้อย 8 ตัวอักษร" },
    { ok: /[A-Za-z]/.test(pw.next) && /[0-9]/.test(pw.next), label: "มีทั้งตัวอักษรและตัวเลข" },
    { ok: !!pw.next && pw.next === pw.confirm, label: "ยืนยันรหัสผ่านตรงกัน" },
    { ok: !!pw.next && pw.next !== pw.current, label: "ไม่ซ้ำรหัสผ่านเดิม" },
  ];
  const valid = !!pw.current && rules.every((r) => r.ok);
  const save = () => {
    if (!valid) return;
    store.dispatch({ type: "updateSettings", patch: { passwordChangedAt: new Date().toISOString() } });
    toast({ message: "เปลี่ยนรหัสผ่านแล้ว" });
    onSaved();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="svc-dialog"
      leading={
        <span className="st-head__icon">
          <KeyRound size={20} strokeWidth={1.9} />
        </span>
      }
      title="เปลี่ยนรหัสผ่าน"
      subtitle="ใช้รหัสผ่านที่ไม่ซ้ำกับบัญชีอื่น"
      footer={
        <>
          <button type="button" className="svc-del acc-show" onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />} {show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          </button>
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!valid} leading={<Check size={16} />} onClick={save}>
            เปลี่ยนรหัสผ่าน
          </Button>
        </>
      }
    >
      <div className="svc">
        <div className="st-group">
          <div className="st-group__body svc__card">
            <Field label="รหัสผ่านปัจจุบัน">
              <Input type={show ? "text" : "password"} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="รหัสผ่านใหม่">
              <Input type={show ? "text" : "password"} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่">
              <Input type={show ? "text" : "password"} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
          </div>
        </div>
        <ul className="acc-rules">
          {rules.map((r) => (
            <li key={r.label} className={r.ok ? "is-ok" : undefined}>
              <i>
                <Check size={10} strokeWidth={3.2} />
              </i>
              {r.label}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
