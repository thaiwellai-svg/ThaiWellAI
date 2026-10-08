import { ClipboardCheck, MessageSquareWarning, Smartphone } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../store/store";
import { thaiDateShort } from "../data/thaiDate";
import type { Appointment, Patient } from "../data/types";
import "./visit-assessments.css";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** ปวดก่อนนวดของครั้งนั้น มาจากไหน: แอป (ประเมินก่อนมา) · เคาน์เตอร์ (คัดกรองวันนั้น) · นัด (ตอนจอง) */
function before(a: Appointment, p: Patient) {
  const r = a.assessRounds?.[a.assessRounds.length - 1];
  if (r) return { pain: r.pain, from: `แอป ${hm(r.at)} น.${a.assessRounds!.length > 1 ? ` (${a.assessRounds!.length} รอบ)` : ""}`, app: true };
  if (p.screening?.at?.slice(0, 10) === a.date && p.screening.pain != null) return { pain: p.screening.pain, from: "เคาน์เตอร์", app: false };
  return { pain: a.painBefore, from: a.date >= new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) && !a.endedAt ? "ยังไม่ได้ประเมิน" : "ตอนจอง", app: false };
}

const STATUS: Record<string, [string, string]> = {
  done: ["รักษาแล้ว", "is-done"],
  active: ["กำลังรักษา", "is-active"],
  waiting: ["นัดไว้", "is-wait"],
};

/**
 * การประเมินรายครั้ง — แต่ละครั้งที่มารักษา (ตามวัน) ผู้ป่วยประเมินอะไรมา: ปวดก่อนนวด (จากแอป/เคาน์เตอร์) · แจ้งเพิ่มหลังเช็กอิน · ปวดหลังนวด
 * ครั้งที่ของคอร์สนับตามบริการของคอร์สตั้งแต่วันเปิดคอร์ส
 */
export function VisitAssessments({ p, onOpen }: { p: Patient; onOpen?: (id: string) => void }) {
  const store = useStore();
  const list = store.appointments
    .filter((a) => a.patientId === p.id && a.status !== "cancelled" && a.status !== "absent")
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  if (!list.length) return null;
  const c = p.course;
  const inCourse = c ? list.filter((a) => a.serviceId === c.serviceId && a.date >= c.startedOn) : [];
  const no = (a: Appointment) => {
    const i = inCourse.findIndex((x) => x.id === a.id);
    return i < 0 ? null : i + 1;
  };
  const rows = list.slice(-10).reverse();
  return (
    <div className="vas">
      <div className="vas__head">
        <span>ครั้งที่</span>
        <span>วันที่</span>
        <span>ปวดก่อนนวด</span>
        <span>ปวดหลังนวด</span>
        <span>สถานะ</span>
      </div>
      {rows.map((a) => {
        const b = before(a, p);
        const n = no(a);
        const st = a.endedAt || a.status === "done" ? STATUS.done : a.startedAt ? STATUS.active : STATUS.waiting;
        return (
          <button key={a.id} type="button" className="vas__row" onClick={() => onOpen?.(a.id)}>
            <span className="vas__no">
              {n ? (
                <>
                  <b>{n}</b>
                  <small>/{c!.total}</small>
                </>
              ) : (
                <small>—</small>
              )}
            </span>
            <span className="vas__date">
              <b>{thaiDateShort(a.date)}</b>
              <small>
                {a.start} · {store.serviceById(a.serviceId).short || store.serviceById(a.serviceId).name}
              </small>
            </span>
            <span className={clsx("vas__pain", b.app && "is-app")}>
              <b>{b.from === "ยังไม่ได้ประเมิน" ? "—" : `${b.pain}/10`}</b>
              <small>
                {b.app ? <Smartphone size={11} /> : <ClipboardCheck size={11} />} {b.from}
              </small>
              {a.addenda?.length ? (
                <em>
                  <MessageSquareWarning size={11} /> แจ้งเพิ่ม {a.addenda.length}
                </em>
              ) : null}
            </span>
            <span className="vas__after">{a.painAfter !== undefined ? <b>{a.painAfter}/10</b> : <small>—</small>}</span>
            <span className={clsx("vas__st", st[1])}>{st[0]}</span>
          </button>
        );
      })}
    </div>
  );
}
