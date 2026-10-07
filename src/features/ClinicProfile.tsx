import { useEffect, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  Building2,
  Camera,
  Check,
  Clock3,
  Copy,
  Droplets,
  Flame,
  Flower2,
  Footprints,
  Hand,
  HandHeart,
  HeartPulse,
  Hospital,
  Leaf,
  MapPin,
  Navigation,
  PenLine,
  Phone,
  QrCode,
  Search,
  Sparkles,
  Sprout,
  Stethoscope,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Button, Dialog, Field, Input, useToast } from "../design-system";
import { TH_WEEKDAYS_SHORT } from "../data/thaiDate";
import type { ClinicSettings } from "../data/types";
import { fileToPortrait } from "./photo";
import { LocationPicker } from "./LocationPicker";
import { WipeDataDialog } from "./WipeDataDialog";
import "./reset-patient.css";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import "./clinic-profile.css";

/* ---------- โลโก้คลินิก: ไอคอนที่เกี่ยวกับคลินิกแพทย์แผนไทย หรือรูปถ่ายคลินิก ---------- */
export const LOGO_ICONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "leaf", label: "ใบไม้", icon: Leaf },
  { key: "sprout", label: "สมุนไพร", icon: Sprout },
  { key: "flower", label: "ดอกไม้", icon: Flower2 },
  { key: "handheart", label: "มือดูแล", icon: HandHeart },
  { key: "hand", label: "การนวด", icon: Hand },
  { key: "flame", label: "ลูกประคบ", icon: Flame },
  { key: "droplets", label: "น้ำมันนวด", icon: Droplets },
  { key: "bath", label: "อบสมุนไพร", icon: Bath },
  { key: "foot", label: "นวดเท้า", icon: Footprints },
  { key: "stethoscope", label: "แพทย์", icon: Stethoscope },
  { key: "heart", label: "สุขภาพ", icon: HeartPulse },
  { key: "hospital", label: "คลินิก", icon: Hospital },
  { key: "building", label: "อาคาร", icon: Building2 },
  { key: "sun", label: "ธาตุไฟ", icon: Sun },
  { key: "sparkles", label: "ผ่อนคลาย", icon: Sparkles },
];
export const LOGO_COLORS = ["#4c845a", "#2f8f9a", "#5b7fa6", "#7c5cc4", "#b0739a", "#c0614f", "#d08a3c", "#8a6d3b"];
const parseLogo = (v?: string) => {
  if (v?.startsWith("icon:")) {
    const [, key, color] = v.split(":");
    return { kind: "icon" as const, icon: LOGO_ICONS.find((x) => x.key === key) ?? LOGO_ICONS[0], color: color || LOGO_COLORS[0] };
  }
  if (v) return { kind: "photo" as const, src: v };
  return { kind: "icon" as const, icon: LOGO_ICONS.find((x) => x.key === "building")!, color: LOGO_COLORS[0] };
};

/** โลโก้คลินิก (ไอคอนบนพื้นสี หรือรูปคลินิก) */
export function ClinicLogo({ value, size = 64 }: { value?: string; size?: number }) {
  const l = parseLogo(value);
  if (l.kind === "photo") return <img className="cp-logo" src={l.src} alt="โลโก้คลินิก" style={{ width: size, height: size }} />;
  const Ic = l.icon.icon;
  return (
    <span className="cp-logo" style={{ width: size, height: size, background: l.color }}>
      <Ic size={Math.round(size * 0.45)} strokeWidth={1.8} />
    </span>
  );
}

/** "13.73, 100.57" · ลิงก์ Google Maps (@lat,lng / q=lat,lng / !3dlat!4dlng) → [lat, lng] */
function parseLatLng(text: string): [number, number] | null {
  const t = text.trim();
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) ?? /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t) ?? /(?:q|ll|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(t) ?? /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
/** ลิงก์ย่อจากปุ่มแชร์ของ Google Maps (maps.app.goo.gl / goo.gl/maps) */
const isShortLink = (t: string) => /(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(t);
/** ลิงก์ย่อ → ลิงก์เต็ม (มีพิกัด) · ทำได้ในแอป iPad (เบราว์เซอร์ถูกบล็อกข้ามโดเมน) */
async function expandShortLink(url: string): Promise<[number, number] | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const r = await CapacitorHttp.get({ url: url.trim() });
  const body = typeof r.data === "string" ? r.data : "";
  return parseLatLng(r.url ?? "") ?? parseLatLng(body.match(/https:\/\/www\.google\.[^"']*@-?\d[^"']*/)?.[0] ?? "") ?? parseLatLng(body.match(/!3d-?\d+(\.\d+)?!4d-?\d+(\.\d+)?/)?.[0] ?? "");
}
type Place = { name: string; lat: number; lng: number };
/** ค้นหาสถานที่/ที่อยู่ (OpenStreetMap) */
async function searchPlaces(q: string): Promise<Place[]> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=th&accept-language=th&q=${encodeURIComponent(q)}`);
  const list = (await r.json()) as { display_name: string; lat: string; lon: string }[];
  return list.map((x) => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
}
const osm = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.004},${lat - 0.0025},${lng + 0.004},${lat + 0.0025}&layer=mapnik&marker=${lat},${lng}`;

/** เปิดอยู่ตอนนี้ไหม (เวลาทำการ + วันหยุดประจำสัปดาห์) */
function openNow(open: string, close: string, closed: number[], now: Date) {
  if (closed.includes(now.getDay())) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hm >= open && hm < close;
}

type EditKind = "logo" | "name" | "address" | "phone" | "location";

/**
 * หน้าข้อมูลคลินิก — โลโก้ ชื่อ เวลาทำการ ติดต่อ ตำแหน่ง (แผนที่จริง) + ตัวอย่างที่ผู้ใช้เห็นในแอป + ความพร้อมของข้อมูล
 * แก้ทีละหัวข้อ (แต่ละหัวข้อมีปุ่มแก้ของตัวเอง) · ข้อมูลไปแสดงในหน้า "สถานที่" ของแอป ThaiWell AI
 */
export function ClinicProfile({ onGo }: { onGo: (section: "hours" | "payment" | "staff" | "services") => void }) {
  const store = useStore();
  const { settings: s, therapists, services } = store;
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  const [edit, setEdit] = useState<EditKind | null>(null);
  const [wiping, setWiping] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const hasLoc = s.clinicLat !== undefined && s.clinicLng !== undefined;
  const isOpen = openNow(s.openTime, s.closeTime, s.closedWeekdays, now);
  const beds = (s.rooms ?? []).reduce((n, r) => n + r.beds.length, 0) || s.bedsPerSlot;
  const closedDays = [...s.closedWeekdays].sort().map((d) => TH_WEEKDAYS_SHORT[d]).join(" ");
  const mapUrl = hasLoc ? `https://www.google.com/maps?q=${s.clinicLat},${s.clinicLng}` : undefined;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ message: "คัดลอกที่อยู่แล้ว" }),
      () => toast({ message: "คัดลอกไม่ได้" }),
    );
  };

  // ข้อมูลที่ผู้ใช้แอปต้องใช้ — ครบแล้วติ๊กเขียว · ยังไม่ครบ = ปุ่มไปตั้ง
  const checks: { label: string; ok: boolean; go: () => void }[] = [
    { label: "โลโก้คลินิก", ok: !!s.clinicLogo, go: () => setEdit("logo") },
    { label: "ชื่อคลินิก", ok: !!s.clinicName.trim(), go: () => setEdit("name") },
    { label: "ที่อยู่", ok: !!s.clinicAddress, go: () => setEdit("address") },
    { label: "เบอร์โทร", ok: !!s.clinicPhone, go: () => setEdit("phone") },
    { label: "ตำแหน่งบนแผนที่", ok: hasLoc, go: () => setEdit("location") },
    { label: "เลขพร้อมเพย์", ok: !!s.promptpayId, go: () => onGo("payment") },
    { label: "ผู้บำบัด", ok: therapists.length > 0, go: () => onGo("staff") },
  ];
  const done = checks.filter((c) => c.ok).length;

  return (
    <div className="cp">
      {/* ── ส่วนหัว: โลโก้ ชื่อ สถานะ เวลาทำการ ── */}
      <section className="cp-hero">
        <button type="button" className="cp-hero__logo" aria-label="เปลี่ยนโลโก้คลินิก" onClick={() => setEdit("logo")}>
          <ClinicLogo value={s.clinicLogo} size={72} />
          <span className="cp-hero__badge">
            <Camera size={13} />
          </span>
        </button>
        <div className="cp-hero__main">
          <span className={clsx("cp-hero__status", isOpen && "is-open")}>
            <i /> {isOpen ? "เปิดอยู่ตอนนี้" : "ปิดอยู่ตอนนี้"}
          </span>
          <button type="button" className="cp-hero__name" onClick={() => setEdit("name")}>
            <h2>{s.clinicName || "ยังไม่ได้ตั้งชื่อคลินิก"}</h2>
            <PenLine size={15} />
          </button>
          <button type="button" className="cp-hero__hours" onClick={() => onGo("hours")}>
            <Clock3 size={14} /> เปิด {s.openTime}–{s.closeTime} น.{closedDays ? ` · หยุด ${closedDays}` : " · ทุกวัน"}
          </button>
        </div>
        <div className="cp-hero__stats">
          <button type="button" onClick={() => onGo("staff")}>
            <Stethoscope size={15} />
            <b>{therapists.length}</b> ผู้บำบัด
          </button>
          <button type="button" onClick={() => onGo("services")}>
            <Sparkles size={15} />
            <b>{services.length}</b> บริการ
          </button>
          <button type="button" onClick={() => onGo("hours")}>
            <BedDouble size={15} />
            <b>{beds}</b> เตียง
          </button>
        </div>
      </section>

      <div className="cp-grid">
        {/* ── ติดต่อและที่ตั้ง: แก้ได้ทีละหัวข้อ ── */}
        <section className="cp-card">
          <header>
            <MapPin size={15} /> ติดต่อและที่ตั้ง
          </header>
          <div className="cp-map">
            {hasLoc ? (
              <>
                <iframe title="แผนที่คลินิก" src={osm(s.clinicLat!, s.clinicLng!)} loading="lazy" />
                <button type="button" className="cp-map__edit" onClick={() => setEdit("location")}>
                  <MapPin size={14} /> ปรับตำแหน่ง
                </button>
              </>
            ) : (
              <button type="button" className="cp-map__empty" onClick={() => setEdit("location")}>
                <MapPin size={22} />
                <b>ยังไม่ได้ปักตำแหน่งคลินิก</b>
                <small>ผู้ใช้แอปจะยังไม่เห็นระยะทางและนำทางมาไม่ได้ · แตะเพื่อปักตำแหน่ง</small>
              </button>
            )}
          </div>
          <div className="cp-rows">
            <div className="cp-row">
              <MapPin size={16} />
              <span>
                <small>ที่อยู่</small>
                <b className={clsx(!s.clinicAddress && "is-empty")}>{s.clinicAddress || "ยังไม่ได้ระบุ"}</b>
              </span>
              {s.clinicAddress && (
                <button type="button" aria-label="คัดลอกที่อยู่" title="คัดลอกที่อยู่" onClick={() => copy(s.clinicAddress!)}>
                  <Copy size={15} />
                </button>
              )}
              <button type="button" className="cp-row__edit" onClick={() => setEdit("address")}>
                <PenLine size={14} /> แก้ไข
              </button>
            </div>
            <div className="cp-row">
              <Phone size={16} />
              <span>
                <small>เบอร์โทร</small>
                <b className={clsx(!s.clinicPhone && "is-empty")}>{s.clinicPhone || "ยังไม่ได้ระบุ"}</b>
              </span>
              {s.clinicPhone && (
                <a href={`tel:${s.clinicPhone.replace(/[^\d+]/g, "")}`} aria-label="โทร" title="โทร">
                  <Phone size={15} />
                </a>
              )}
              <button type="button" className="cp-row__edit" onClick={() => setEdit("phone")}>
                <PenLine size={14} /> แก้ไข
              </button>
            </div>
            <div className="cp-row">
              <Navigation size={16} />
              <span>
                <small>ตำแหน่ง</small>
                <b className={clsx(!hasLoc && "is-empty")}>{hasLoc ? `${s.clinicLat!.toFixed(5)}, ${s.clinicLng!.toFixed(5)}` : "ยังไม่ได้ปักตำแหน่ง"}</b>
              </span>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" aria-label="เปิดใน Google Maps" title="เปิดใน Google Maps">
                  <Navigation size={15} />
                </a>
              )}
              <button type="button" className="cp-row__edit" onClick={() => setEdit("location")}>
                <PenLine size={14} /> แก้ไข
              </button>
            </div>
          </div>
        </section>

        <div className="cp-side">
          {/* ── ตัวอย่างในแอปผู้ใช้ ── */}
          <section className="cp-card">
            <header>
              <Sparkles size={15} /> ผู้ใช้เห็นในแอป ThaiWell AI
            </header>
            <div className="cp-app">
              <div className="cp-app__card">
                <ClinicLogo value={s.clinicLogo} size={40} />
                <span className="cp-app__text">
                  <b>{s.clinicName || "ชื่อคลินิก"}</b>
                  <small>{s.clinicAddress || "ที่อยู่คลินิก"}</small>
                  <em>{hasLoc ? "ระยะทางจากผู้ใช้ เช่น 1.2 กม." : "คลินิกยังไม่ได้ปักตำแหน่ง"}</em>
                </span>
              </div>
              <div className="cp-app__acts">
                <span className={clsx(!s.clinicPhone && "is-off")}>
                  <Phone size={14} /> โทร
                </span>
                <span className={clsx(!hasLoc && "is-off")}>
                  <Navigation size={14} /> นำทาง
                </span>
                <span>
                  <Clock3 size={14} /> จองคิว
                </span>
              </div>
            </div>
          </section>

          {/* ── ความพร้อมของข้อมูล ── */}
          <section className="cp-card">
            <header>
              <Check size={15} /> ความพร้อมของข้อมูล
              <em className={clsx(done === checks.length && "is-done")}>
                {done}/{checks.length}
              </em>
            </header>
            <span className="cp-bar">
              <i style={{ width: `${(done / checks.length) * 100}%` }} />
            </span>
            <ul className="cp-checks">
              {checks.map((c) => (
                <li key={c.label} className={clsx(c.ok && "is-ok")}>
                  <i>{c.ok ? <Check size={12} strokeWidth={3} /> : null}</i>
                  <span>{c.label}</span>
                  {!c.ok && (
                    <button type="button" onClick={c.go}>
                      {c.label === "เลขพร้อมเพย์" ? <QrCode size={13} /> : null} ตั้งค่า
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* ลบข้อมูลทดสอบทั้งหมด (ก่อนใช้งานจริง / ทดสอบรอบใหม่) */}
      <section className="cp-danger">
        <span>
          <b>ลบข้อมูลทดสอบทั้งหมด</b>
          <small>ล้างผู้รับบริการ นัด ใบเสร็จ คำขอจอง แจ้งเตือน และประวัติ ทั้งในคลินิกและแอปผู้ใช้ · ข้อมูลคลินิก ผู้บำบัด บริการ ยังอยู่</small>
        </span>
        <Button variant="danger" size="md" leading={<Trash2 size={15} />} onClick={() => setWiping(true)}>
          ลบข้อมูลทั้งหมด
        </Button>
      </section>
      <WipeDataDialog open={wiping} onClose={() => setWiping(false)} />
      <ClinicEditDialog kind={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

const TITLES: Record<EditKind, { title: string; subtitle: string; icon: LucideIcon }> = {
  logo: { title: "โลโก้คลินิก", subtitle: "เลือกไอคอนที่เข้ากับคลินิก หรือใช้รูปคลินิกของคุณ", icon: Camera },
  name: { title: "ชื่อคลินิก", subtitle: "แสดงบนหน้าหลัก ใบเสร็จ ข้อความถึงผู้ป่วย และในแอปผู้ใช้", icon: Building2 },
  address: { title: "ที่อยู่คลินิก", subtitle: "ผู้ใช้แอปเห็นในหน้า “สถานที่” · พิมพ์บนใบเสร็จ", icon: MapPin },
  phone: { title: "เบอร์โทรคลินิก", subtitle: "ผู้ใช้แอปกดโทรหาคลินิกได้จากหน้า “สถานที่”", icon: Phone },
  location: { title: "ตำแหน่งคลินิก", subtitle: "ใช้คำนวณระยะทางและนำทางในแอปผู้ใช้", icon: Navigation },
};

/** แก้ข้อมูลคลินิกทีละหัวข้อ */
function ClinicEditDialog({ kind, onClose }: { kind: EditKind | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const s = store.settings;
  const [shown, setShown] = useState<EditKind | null>(kind);
  const [text, setText] = useState("");
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // เปิดหัวข้อใหม่ → ตั้งค่าเริ่มจากข้อมูลปัจจุบัน
  if (kind && kind !== shown) {
    setShown(kind);
    setText(
      kind === "name" ? s.clinicName : kind === "address" ? (s.clinicAddress ?? "") : kind === "phone" ? (s.clinicPhone ?? "") : kind === "location" && s.clinicLat !== undefined && s.clinicLng !== undefined ? `${s.clinicLat}, ${s.clinicLng}` : "",
    );
    setLogo(s.clinicLogo);
    setPos(s.clinicLat !== undefined && s.clinicLng !== undefined ? [s.clinicLat, s.clinicLng] : null);
    setQ(s.clinicAddress ?? "");
    setFound(null);
    if (kind === "location") setText("");
  }
  if (!kind && shown) setShown(null);
  const k = kind ?? shown;
  if (!k) return null;
  const meta = TITLES[k];
  const ll = k === "location" ? pos : null;
  const phoneOk = !text.trim() || /^[0-9+\-\s]{9,15}$/.test(text.trim());
  const valid = k === "name" ? !!text.trim() : k === "phone" ? phoneOk : true;
  /** วางลิงก์ / พิมพ์พิกัด → ปักหมุด (ลิงก์ย่อจากปุ่มแชร์ → อ่านลิงก์เต็มก่อน) */
  const usePasted = async (t: string) => {
    setText(t);
    const direct = parseLatLng(t);
    if (direct) return setPos(direct);
    if (!isShortLink(t)) return;
    setBusy(true);
    try {
      const v = await expandShortLink(t);
      if (v) setPos(v);
      else toast({ message: "อ่านพิกัดจากลิงก์นี้ไม่ได้ · ค้นหาจากที่อยู่ หรือแตะบนแผนที่แทน" });
    } catch {
      toast({ message: "เปิดลิงก์ไม่ได้ · ตรวจอินเทอร์เน็ต หรือแตะบนแผนที่แทน" });
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await searchPlaces(q.trim());
      setFound(r);
      if (r[0]) setPos([r[0].lat, r[0].lng]);
    } catch {
      toast({ message: "ค้นหาไม่ได้ · ตรวจอินเทอร์เน็ต" });
    } finally {
      setSearching(false);
    }
  };
  const cur = parseLogo(logo);

  const save = () => {
    const patch: Partial<ClinicSettings> =
      k === "logo"
        ? { clinicLogo: logo }
        : k === "name"
          ? { clinicName: text.trim() }
          : k === "address"
            ? { clinicAddress: text.trim() || undefined }
            : k === "phone"
              ? { clinicPhone: text.trim() || undefined }
              : { clinicLat: ll?.[0], clinicLng: ll?.[1] };
    store.dispatch({ type: "updateSettings", patch });
    toast({ message: `บันทึก${meta.title}แล้ว` });
    onClose();
  };

  return (
    <Dialog
      open={!!kind}
      onClose={onClose}
      className="svc-dialog cp-edit"
      leading={
        <span className="st-head__icon">
          <meta.icon size={20} strokeWidth={1.9} />
        </span>
      }
      title={meta.title}
      subtitle={meta.subtitle}
      footer={
        <>
          <Button variant="outline" size="lg" fill onClick={onClose}>
            ปิด
          </Button>
          <Button size="lg" fill disabled={!valid || busy} leading={<Check size={16} />} onClick={save}>
            บันทึก
          </Button>
        </>
      }
    >
      {k === "name" && (
        <Field label="ชื่อหน่วยบริการ">
          <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="เช่น คลินิกแพทย์แผนไทย สาขาสุขุมวิท" />
        </Field>
      )}
      {k === "address" && (
        <Field label="ที่อยู่">
          <textarea className="tw-input clinic-form__addr" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" />
        </Field>
      )}
      {k === "phone" && (
        <Field label="เบอร์โทรคลินิก" hint={phoneOk ? undefined : "เบอร์โทรไม่ถูกต้อง เช่น 02-123-4567"}>
          <Input inputMode="tel" value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="02-123-4567" />
        </Field>
      )}
      {k === "location" && (
        <div className="cp-edit__loc">
          {/* 1) ค้นหาจากชื่อสถานที่ / ที่อยู่ */}
          <div className="cp-loc__search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} placeholder="ค้นหาชื่อสถานที่หรือที่อยู่ เช่น ซอยสุขุมวิท 39" aria-label="ค้นหาสถานที่" />
            <Button variant="outline" size="md" leading={<Search size={15} />} disabled={searching || !q.trim()} onClick={() => void search()}>
              {searching ? "กำลังค้นหา…" : "ค้นหา"}
            </Button>
          </div>
          {found && (
            <div className="cp-loc__found">
              {found.length ? (
                found.map((f) => (
                  <button key={`${f.lat},${f.lng}`} type="button" aria-pressed={!!pos && pos[0] === f.lat && pos[1] === f.lng} onClick={() => setPos([f.lat, f.lng])}>
                    <MapPin size={14} />
                    <span>{f.name}</span>
                  </button>
                ))
              ) : (
                <small>ไม่พบสถานที่นี้ · ลองพิมพ์ชื่อถนน/ซอย/เขต หรือแตะบนแผนที่</small>
              )}
            </div>
          )}
          {/* 2) แตะบนแผนที่ / ลากหมุด */}
          <LocationPicker value={pos} onChange={setPos} />
          <p className="cp-loc__hint">
            {pos ? `หมุดอยู่ที่ ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)} · แตะบนแผนที่หรือลากหมุดเพื่อปรับ` : "แตะบนแผนที่ตรงตำแหน่งคลินิกเพื่อปักหมุด"}
          </p>
          {/* 3) ตำแหน่งปัจจุบัน / วางลิงก์ Google Maps */}
          <div className="clinic-form__loc">
            <Input value={text} onChange={(e) => void usePasted(e.target.value)} placeholder="หรือวางลิงก์ Google Maps / พิกัด 13.7337, 100.5717" aria-label="ลิงก์ Google Maps หรือพิกัด" />
            <Button
              variant="outline"
              size="md"
              leading={<Navigation size={15} />}
              disabled={locating}
              onClick={() => {
                if (!navigator.geolocation) return toast({ message: "อุปกรณ์นี้หาตำแหน่งไม่ได้" });
                setLocating(true);
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    setLocating(false);
                    setPos([p.coords.latitude, p.coords.longitude]);
                  },
                  (err) => {
                    setLocating(false);
                    toast({ message: err.code === 1 ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง · เปิดที่ การตั้งค่า › ThaiWell › ตำแหน่ง หรือแตะบนแผนที่แทน" : "หาตำแหน่งไม่ได้ · ลองค้นหาจากที่อยู่ หรือแตะบนแผนที่แทน" });
                  },
                  { enableHighAccuracy: true, timeout: 15000 },
                );
              }}
            >
              {locating ? "กำลังหา…" : "ใช้ตำแหน่งปัจจุบัน"}
            </Button>
          </div>
          {text.trim() && !parseLatLng(text) && !busy && (
            <small className="cp-loc__warn">{isShortLink(text) ? (Capacitor.isNativePlatform() ? "อ่านพิกัดจากลิงก์นี้ไม่ได้" : "ลิงก์ย่อเปิดได้ในแอป iPad เท่านั้น · บนเว็บให้แตะบนแผนที่หรือค้นหาแทน") : "อ่านพิกัดไม่ได้ · วางลิงก์ Google Maps หรือพิมพ์ เช่น 13.7337, 100.5717"}</small>
          )}
          {pos && (
            <button type="button" className="cp-loc__clear" onClick={() => setPos(null)}>
              ลบตำแหน่ง
            </button>
          )}
        </div>
      )}
      {k === "logo" && (
        <div className="cp-edit__logo">
          <div className="cp-edit__preview">
            <ClinicLogo value={logo} size={88} />
            <div>
              <b>{s.clinicName}</b>
              <small>{cur.kind === "photo" ? "รูปคลินิก" : `ไอคอน “${cur.icon.label}”`}</small>
            </div>
          </div>
          <div className="cp-edit__sec">
            <small>ไอคอน</small>
            <div className="cp-edit__icons" role="radiogroup" aria-label="ไอคอนคลินิก">
              {LOGO_ICONS.map((x) => {
                const on = cur.kind === "icon" && cur.icon.key === x.key && !!logo;
                return (
                  <button key={x.key} type="button" role="radio" aria-checked={on} title={x.label} onClick={() => setLogo(`icon:${x.key}:${cur.kind === "icon" ? cur.color : LOGO_COLORS[0]}`)}>
                    <x.icon size={22} strokeWidth={1.8} />
                    <span>{x.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="cp-edit__sec">
            <small>สีพื้น</small>
            <div className="cp-edit__colors" role="radiogroup" aria-label="สีโลโก้">
              {LOGO_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-label={c}
                  aria-checked={cur.kind === "icon" && cur.color === c}
                  disabled={cur.kind === "photo"}
                  style={{ background: c }}
                  onClick={() => setLogo(`icon:${cur.kind === "icon" ? cur.icon.key : "building"}:${c}`)}
                >
                  {cur.kind === "icon" && cur.color === c ? <Check size={14} strokeWidth={3} /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="cp-edit__sec">
            <small>หรือใช้รูปคลินิก</small>
            <div className="cp-edit__photo">
              <Button variant="outline" size="md" leading={<Camera size={15} />} disabled={busy} onClick={() => file.current?.click()}>
                {busy ? "กำลังโหลดรูป…" : cur.kind === "photo" ? "เปลี่ยนรูป" : "ถ่าย / เลือกรูป"}
              </Button>
              {cur.kind === "photo" && (
                <Button variant="outline" size="md" leading={<Trash2 size={15} />} onClick={() => setLogo(`icon:building:${LOGO_COLORS[0]}`)}>
                  ใช้ไอคอนแทน
                </Button>
              )}
              <input
                ref={file}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  try {
                    setLogo(await fileToPortrait(f, 400));
                  } catch {
                    toast({ message: "ใช้รูปนี้ไม่ได้ ลองเลือกรูปอื่น", tone: "danger" });
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
