import { useEffect, useState } from "react";
import { BedDouble, Building2, Check, Clock3, Copy, MapPin, Navigation, PenLine, Phone, QrCode, Sparkles, Stethoscope } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { Button, useToast } from "../design-system";
import { TH_WEEKDAYS_SHORT } from "../data/thaiDate";
import "./clinic-profile.css";

/** เปิดอยู่ตอนนี้ไหม (เวลาทำการ + วันหยุดประจำสัปดาห์) */
function openNow(open: string, close: string, closed: number[], now: Date) {
  if (closed.includes(now.getDay())) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hm >= open && hm < close;
}

/**
 * หน้าข้อมูลคลินิก — ชื่อ เวลาทำการ ติดต่อ ตำแหน่ง (แผนที่จริง) + ตัวอย่างที่ผู้ใช้เห็นในแอป + ความพร้อมของข้อมูล
 * ข้อมูลชุดนี้ไปแสดงในหน้า "สถานที่" ของแอป ThaiWell AI (โทร · นำทาง · ระยะทาง)
 */
export function ClinicProfile({ onEdit, onGo }: { onEdit: () => void; onGo: (section: "hours" | "payment" | "staff" | "services") => void }) {
  const { settings: s, therapists, services } = useStore();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const hasLoc = s.clinicLat !== undefined && s.clinicLng !== undefined;
  const isOpen = openNow(s.openTime, s.closeTime, s.closedWeekdays, now);
  const beds = (s.rooms ?? []).reduce((n, r) => n + r.beds.length, 0) || s.bedsPerSlot;
  const closedDays = [...s.closedWeekdays].sort().map((d) => TH_WEEKDAYS_SHORT[d]).join(" ");
  const mapUrl = hasLoc ? `https://www.google.com/maps?q=${s.clinicLat},${s.clinicLng}` : undefined;
  const embed = hasLoc
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${s.clinicLng! - 0.004},${s.clinicLat! - 0.0025},${s.clinicLng! + 0.004},${s.clinicLat! + 0.0025}&layer=mapnik&marker=${s.clinicLat},${s.clinicLng}`
    : undefined;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ message: "คัดลอกที่อยู่แล้ว" }),
      () => toast({ message: "คัดลอกไม่ได้" }),
    );
  };

  // ข้อมูลที่ผู้ใช้แอปต้องใช้ — ครบแล้วติ๊กเขียว · ยังไม่ครบ = ปุ่มไปตั้ง
  const checks: { label: string; ok: boolean; go: () => void }[] = [
    { label: "ชื่อคลินิก", ok: !!s.clinicName.trim(), go: onEdit },
    { label: "ที่อยู่", ok: !!s.clinicAddress, go: onEdit },
    { label: "เบอร์โทร", ok: !!s.clinicPhone, go: onEdit },
    { label: "ตำแหน่งบนแผนที่", ok: hasLoc, go: onEdit },
    { label: "เลขพร้อมเพย์", ok: !!s.promptpayId, go: () => onGo("payment") },
    { label: "ผู้บำบัด", ok: therapists.length > 0, go: () => onGo("staff") },
  ];
  const done = checks.filter((c) => c.ok).length;

  return (
    <div className="cp">
      {/* ── ส่วนหัว: ชื่อ สถานะ เวลาทำการ ── */}
      <section className="cp-hero">
        <span className="cp-hero__logo">
          <Building2 size={28} strokeWidth={1.7} />
        </span>
        <div className="cp-hero__main">
          <span className={clsx("cp-hero__status", isOpen && "is-open")}>
            <i /> {isOpen ? "เปิดอยู่ตอนนี้" : "ปิดอยู่ตอนนี้"}
          </span>
          <h2>{s.clinicName || "ยังไม่ได้ตั้งชื่อคลินิก"}</h2>
          <button type="button" className="cp-hero__hours" onClick={() => onGo("hours")}>
            <Clock3 size={14} /> เปิด {s.openTime}–{s.closeTime} น.{closedDays ? ` · หยุด ${closedDays}` : " · ทุกวัน"}
          </button>
        </div>
        <Button size="md" leading={<PenLine size={15} />} onClick={onEdit}>
          แก้ไขข้อมูล
        </Button>
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
        {/* ── ติดต่อและที่ตั้ง ── */}
        <section className="cp-card">
          <header>
            <MapPin size={15} /> ติดต่อและที่ตั้ง
          </header>
          <div className="cp-map">
            {embed ? (
              <iframe title="แผนที่คลินิก" src={embed} loading="lazy" />
            ) : (
              <button type="button" className="cp-map__empty" onClick={onEdit}>
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
                <button type="button" aria-label="คัดลอกที่อยู่" onClick={() => copy(s.clinicAddress!)}>
                  <Copy size={15} />
                </button>
              )}
            </div>
            <div className="cp-row">
              <Phone size={16} />
              <span>
                <small>เบอร์โทร</small>
                <b className={clsx(!s.clinicPhone && "is-empty")}>{s.clinicPhone || "ยังไม่ได้ระบุ"}</b>
              </span>
              {s.clinicPhone && (
                <a href={`tel:${s.clinicPhone.replace(/[^\d+]/g, "")}`} aria-label="โทร">
                  <Phone size={15} />
                </a>
              )}
            </div>
            <div className="cp-row">
              <Navigation size={16} />
              <span>
                <small>พิกัด</small>
                <b className={clsx(!hasLoc && "is-empty")}>{hasLoc ? `${s.clinicLat!.toFixed(5)}, ${s.clinicLng!.toFixed(5)}` : "ยังไม่ได้ปักตำแหน่ง"}</b>
              </span>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer" aria-label="เปิดใน Google Maps">
                  <Navigation size={15} />
                </a>
              )}
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
                <span className="cp-app__ico">
                  <Building2 size={18} />
                </span>
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
    </div>
  );
}
