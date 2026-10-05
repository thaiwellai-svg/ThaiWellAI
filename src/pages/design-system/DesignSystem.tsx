import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import {
  AnimatedNumber,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Field,
  Icon,
  IconButton,
  Input,
  SearchField,
  Segmented,
  Select,
  Switch,
  fadeUp,
  stagger,
  useToast,
} from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { PainBadge } from "../../features/RecordCards";
import houseIcon from "../../assets/figma/house-blank.svg";
import usersIcon from "../../assets/figma/users.svg";
import calendarIcon from "../../assets/figma/calendar-lines.svg";
import planIcon from "../../assets/icons/calendar-plus.svg";
import settingsIcon from "../../assets/figma/settings.svg";
import bellIcon from "../../assets/figma/bell.svg";
import usersOutline from "../../assets/figma/users-outline.svg";
import cardIcon from "../../assets/figma/credit-card.svg";
import { AppointmentsIcon, HomeIcon, PatientsIcon, PlannerIcon, SettingsIcon, SparkleIcon } from "../../design-system/icons";
import "./design-system.css";

const COLORS: { group: string; items: [string, string, string][] }[] = [
  {
    group: "Brand · Sage",
    items: [
      ["--sage-900", "#2C3E2B", "Ink / text"],
      ["--sage-700", "#4C845A", "Brand / primary"],
      ["--sage-500", "#6E7E6B", "Muted text"],
      ["--sage-300", "#D6DED1", "Hairline / border"],
      ["--sage-100", "#EEF3EC", "Tint"],
      ["--sage-50", "#F6F8F4", "Sunken surface"],
    ],
  },
  {
    group: "Status (KPI legend)",
    items: [
      ["--status-done", "#22C55E", "รับบริการแล้ว"],
      ["--status-waiting", "#FFD54F", "รอรับบริการ"],
      ["--status-active", "#007AFF", "กำลังรับบริการ"],
      ["--status-absent", "#EF4444", "ไม่มารับบริการ"],
      ["--green-700", "#15803D", "Avatar / active icon"],
      ["--red-600", "#DC2626", "Danger text"],
    ],
  },
  {
    group: "Accent & glass",
    items: [
      ["--clay-500", "#C1723E", "Finance accent"],
      ["--blue-600", "#077DD7", "Info text"],
      ["--glass-panel-bg", "rgba(255,255,255,.2)", "Glass panel · blur 10"],
      ["--glass-chip-bg", "rgba(255,255,255,.1)", "Glass control"],
      ["--glass-dock-bg", "rgba(246,246,246,.36)", "Dock · blur 68"],
      ["--neutral-900", "#111111", "Stat figures"],
    ],
  },
];

const TYPE: [string, string, string, string][] = [
  ["--text-display", "Display · 28 / Bold", "42 ราย", "KPI figures"],
  ["--text-title-lg", "Title L · 20 / Bold", "รายการงานวันนี้", "Section, greeting"],
  ["--text-title", "Title · 16 / Bold", "คำขอจองคิวใหม่ (รออนุมัติ)", "Panel headings"],
  ["--text-body-strong", "Body strong · 14 / Bold", "นาย สุรชัย ใจดี", "Names"],
  ["--text-label", "Label · 13 / Semibold", "จำนวนผู้มารับบริการวันนี้", "Card labels"],
  ["--text-time", "Time · 13 / Bold", "09:00 - 10:00", "Schedule times"],
  ["--text-meta", "Meta · 12 / Regular", "นวดไทยเพื่อสุขภาพ (60 นาที) | ผู้บำบัด: นศ.พท. สมชาย", "Secondary lines"],
  ["--text-caption", "Caption · 11 / Regular", "• นัดล่วงหน้า 30 ราย • Walk-in 12 ราย", "Helper text"],
  ["--text-badge", "Badge · Sarabun 10 / Medium", "Pain Score: 7/10", "Pills"],
];

function Block({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <motion.section className="ds-block" variants={fadeUp}>
      <header className="ds-block__head">
        <h2 className="ds-block__title">{title}</h2>
        {desc && <p className="tw-meta">{desc}</p>}
      </header>
      {children}
    </motion.section>
  );
}

export default function DesignSystem() {
  const toast = useToast();
  const [seg, setSeg] = useState<"a" | "b" | "c">("b");
  const [sw, setSw] = useState(true);
  const [chip, setChip] = useState(true);
  const [q, setQ] = useState("");
  const [n, setN] = useState(42);

  return (
    <WorkPage eyebrow="ThaiWell Design System · v1.0" title="Foundations & Components">
      <div className="panel">
        <div className="sheet">
          <motion.div className="ds scroll-y scroll-y--light" variants={stagger(0.05, 0.06)} initial="hidden" animate="show">
            <Block title="หลักการออกแบบ" desc="Calm clinical luxury — ภาพบรรยากาศสปาจริง เป็นพื้นหลังที่มีชีวิต ข้อมูลอยู่บนการ์ดขาวที่อ่านง่าย">
              <div className="ds-principles">
                {[
                  ["Glass over photo", "ส่วนควบคุมและคอลัมน์ใช้กระจกฝ้า (blur 2.5–68) เพื่อให้บรรยากาศสปาทะลุผ่าน"],
                  ["White for data", "ข้อมูลที่ต้องอ่าน/ตัดสินใจ อยู่บนการ์ดขาว r24 เงา 0 8 40 /12 เสมอ"],
                  ["Status = colour", "เขียว เหลือง ฟ้า แดง ใช้ความหมายเดียวทั้งระบบ ตรงกับแถบ KPI"],
                  ["Looped Thai", "Sarabun (ไทยมีหัว) คู่กับ Inter สำหรับตัวเลขและละติน อ่านง่ายในบริบทการแพทย์"],
                ].map(([t, d]) => (
                  <div key={t} className="ds-principle">
                    <b>{t}</b>
                    <p className="tw-meta">{d}</p>
                  </div>
                ))}
              </div>
            </Block>

            <Block title="Colour tokens" desc="Primitive → semantic. คอมโพเนนต์อ้างอิงเฉพาะ semantic token">
              {COLORS.map((g) => (
                <div key={g.group} className="ds-swatch-group">
                  <p className="ds-kicker">{g.group}</p>
                  <div className="ds-swatches">
                    {g.items.map(([token, hex, use]) => (
                      <div key={token} className="ds-swatch">
                        <span
                          className="ds-swatch__chip"
                          style={{
                            background: token.startsWith("--glass")
                              ? `linear-gradient(var(${token}), var(${token})), radial-gradient(circle at 30% 30%, #b9894f, #4b3524 75%)`
                              : `var(${token})`,
                          }}
                        />
                        <b>{use}</b>
                        <code>{token}</code>
                        <small>{hex}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Block>

            <Block title="Typography" desc="Inter + Sarabun · line-height normal (1.21) ตาม Figma">
              <div className="ds-type">
                {TYPE.map(([token, name, sample, use]) => (
                  <div key={token} className="ds-type__row">
                    <div className="ds-type__meta">
                      <b>{name}</b>
                      <code>{token}</code>
                      <small>{use}</small>
                    </div>
                    <p style={{ font: `var(${token})`, color: "var(--color-text)" }}>{sample}</p>
                  </div>
                ))}
              </div>
            </Block>

            <Block title="Spacing · Radius · Elevation" desc="4px grid · gap การ์ด 10 · padding 16 · คอลัมน์ 450">
              <div className="ds-row">
                {[4, 8, 10, 12, 16, 20, 24, 32, 48].map((s) => (
                  <div key={s} className="ds-space">
                    <span style={{ width: s, height: s }} />
                    <small>{s}</small>
                  </div>
                ))}
              </div>
              <div className="ds-row">
                {[
                  ["sm", 8],
                  ["md", 12],
                  ["lg", 16],
                  ["xl", 24],
                  ["pill", 100],
                ].map(([k, r]) => (
                  <div key={k} className="ds-radius" style={{ borderRadius: Number(r) }}>
                    <b>{k}</b>
                    <small>{r}</small>
                  </div>
                ))}
                <div className="ds-radius" style={{ boxShadow: "var(--shadow-card)", borderRadius: 24 }}>
                  <b>card</b>
                  <small>0 8 40 /12</small>
                </div>
                <div className="ds-radius" style={{ boxShadow: "var(--shadow-modal)", borderRadius: 28 }}>
                  <b>modal</b>
                  <small>0 24 80 /35</small>
                </div>
              </div>
            </Block>

            <Block title="Iconography" desc="Dock: 24px grid · stroke 1.8 round · active = duotone (--icon-fill) · อื่น ๆ: Figma exports tint ผ่าน mask">
              <div className="ds-row">
                <span className="ds-dark" style={{ gap: 18, padding: "12px 18px", color: "#fff" }}>
                  <HomeIcon />
                  <PatientsIcon />
                  <AppointmentsIcon />
                  <PlannerIcon />
                  <SettingsIcon />
                  <SparkleIcon />
                </span>
                <span className="ds-icon" style={{ color: "var(--green-700)", ["--icon-fill" as string]: "rgba(21,128,61,.16)" }}>
                  <HomeIcon />
                </span>
                <span className="ds-icon" style={{ color: "var(--green-700)", ["--icon-fill" as string]: "rgba(21,128,61,.16)" }}>
                  <PatientsIcon />
                </span>
              </div>
              <div className="ds-row">
                {[houseIcon, usersIcon, calendarIcon, planIcon, settingsIcon].map((src, i) => (
                  <span key={src} className="ds-icon">
                    <Icon src={src} size={20} color={i === 0 ? "var(--green-700)" : "var(--neutral-900)"} />
                  </span>
                ))}
                <span className="ds-icon ds-icon--dark">
                  <img src={bellIcon} alt="" width={20} height={20} />
                </span>
                <span className="tw-icon-tile">
                  <img src={usersOutline} alt="" />
                </span>
                <span className="tw-icon-tile tw-icon-tile--accent">
                  <img src={cardIcon} alt="" />
                </span>
              </div>
            </Block>

            <Block title="Buttons" desc="Pill · h28 (sm) / 36 (md) / 44 (lg) · กดแล้วย่อ 0.96 ด้วย spring">
              <div className="ds-row">
                <Button>อนุมัติและจัดคิว</Button>
                <Button variant="outline">ปฏิเสธ</Button>
                <Button variant="ghost">ดูทั้งหมด</Button>
                <Button variant="danger">ยืนยันการปฏิเสธ</Button>
                <Button variant="white" leading={<Plus size={14} />}>
                  เพิ่ม
                </Button>
                <Button disabled>ปิดใช้งาน</Button>
              </div>
              <div className="ds-row">
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
                <div className="ds-dark">
                  <Button variant="glass" size="md">
                    Glass
                  </Button>
                  <IconButton label="แจ้งเตือน" indicator>
                    <img src={bellIcon} alt="" width={20} height={20} />
                  </IconButton>
                </div>
              </div>
            </Block>

            <Block title="Badges · Chips · Avatars">
              <div className="ds-row">
                <PainBadge score={8} />
                <PainBadge score={5} />
                <PainBadge score={2} />
                <Badge tone="info" compact>
                  50 คน
                </Badge>
                <Badge tone="success" dot compact>
                  รับบริการแล้ว
                </Badge>
                <Badge tone="warning" dot compact>
                  รอรับบริการ
                </Badge>
                <Badge tone="white" size="lg">
                  10
                </Badge>
              </div>
              <div className="ds-row">
                <Chip pressed={chip} onClick={() => setChip(!chip)} count={12}>
                  เลือกได้
                </Chip>
                <Chip pressed={!chip} onClick={() => setChip(!chip)}>
                  ตัวเลือก
                </Chip>
                <Avatar name="นาย สุรชัย ใจดี" size="sm" />
                <Avatar name="นาย สุรชัย ใจดี" />
                <Avatar name="พท.ป. วิภาวดี" size="lg" color="#c1723e" />
                <Avatar name="เอกชัย" size="xl" />
              </div>
            </Block>

            <Block title="Inputs & controls">
              <div className="ds-grid">
                <Field label="ข้อความ" hint="ขอบ #D6DED1 · focus ring brand 28%">
                  <Input placeholder="พิมพ์ที่นี่" />
                </Field>
                <Field label="ตัวเลือก">
                  <Select defaultValue="1">
                    <option value="1">นวดไทยเพื่อสุขภาพ</option>
                    <option value="2">ประคบสมุนไพร</option>
                  </Select>
                </Field>
                <Field label="ค้นหา (light)">
                  <SearchField tone="light" value={q} onChange={setQ} />
                </Field>
              </div>
              <div className="ds-row">
                <Segmented
                  tone="light"
                  label="ตัวอย่าง"
                  value={seg}
                  onChange={setSeg}
                  options={[
                    { value: "a", label: "วัน" },
                    { value: "b", label: "สัปดาห์" },
                    { value: "c", label: "เดือน" },
                  ]}
                />
                <Switch checked={sw} onChange={setSw} label="ตัวอย่างสวิตช์" />
              </div>
            </Block>

            <Block title="Cards" desc="Solid (ข้อมูล) · Glass (กลุ่ม/บริบท)">
              <div className="ds-grid">
                <Card elevated>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p className="tw-label">จำนวนผู้มารับบริการวันนี้</p>
                    <span className="tw-icon-tile">
                      <img src={usersOutline} alt="" />
                    </span>
                  </div>
                  <div className="tw-figure">
                    <span className="tw-figure__value">
                      <AnimatedNumber value={n} />
                    </span>
                    <span className="tw-figure__unit">ราย</span>
                  </div>
                  <Divider />
                  <Button variant="outline" onClick={() => setN((x) => x + 7)}>
                    เพิ่มตัวเลข (ดูอนิเมชัน)
                  </Button>
                </Card>
                <div className="ds-dark" style={{ padding: 16, borderRadius: 28 }}>
                  <Card variant="glass" style={{ width: "100%" }}>
                    <p className="tw-title" style={{ font: "var(--text-title)", color: "var(--color-text)" }}>
                      Glass panel
                    </p>
                    <p className="tw-meta" style={{ color: "var(--color-text)" }}>
                      rgba(255,255,255,.2) · backdrop-blur 10 · r24
                    </p>
                  </Card>
                </div>
              </div>
            </Block>

            <Block title="Motion" desc="ทุกอนิเมชันใช้ spring 3 ระดับ และเคารพ prefers-reduced-motion">
              <div className="ds-motion">
                {[
                  ["snappy", "520 / 38", "ปุ่ม, segmented, dock, switch"],
                  ["soft", "300 / 32", "การ์ด, รายการ, การเรียงใหม่"],
                  ["gentle", "240 / 30", "dialog, drawer"],
                  ["ease-out", "0.22 1 0.36 1", "เฟดเข้า, ตัวเลขนับขึ้น, progress"],
                ].map(([k, v, d]) => (
                  <div key={k} className="ds-principle">
                    <b>{k}</b>
                    <code>{v}</code>
                    <p className="tw-meta">{d}</p>
                  </div>
                ))}
              </div>
              <div className="ds-row">
                <Button variant="outline" onClick={() => toast({ message: "Toast แจ้งผลสำเร็จ", action: { label: "เลิกทำ", onClick: () => {} } })}>
                  แสดง Toast
                </Button>
                <Button variant="outline" onClick={() => toast({ message: "Toast แจ้งข้อผิดพลาด", tone: "danger" })}>
                  Toast แบบ error
                </Button>
              </div>
            </Block>
          </motion.div>
        </div>
      </div>
    </WorkPage>
  );
}
