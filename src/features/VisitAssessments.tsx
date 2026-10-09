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


/**
 * การประเมินรายครั้ง — แต่ละครั้งที่มารักษา (ตามวัน) ผู้ป่วยประเมินอะไรมา: ปวดก่อนนวด (จากแอป/เคาน์เตอร์) · แจ้งเพิ่มหลังเช็กอิน · ปวดหลังนวด
 * ครั้งที่ของคอร์สนับตามบริการของคอร์สตั้งแต่วันเปิดคอร์ส
 */
export function VisitAssessments({ p, onOpen }: { p: Patient; onOpen?: (id: string) => void }) {
  const store = useStore();
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  // เฉพาะครั้งที่มาแล้ว (นัดล่วงหน้าอยู่ในการ์ด "นัดที่จะถึง")
  const all = store.appointments
    .filter((a) => a.patientId === p.id && a.status !== "cancelled" && a.status !== "absent")
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const c = p.course;
  const inCourse = c ? all.filter((a) => a.serviceId === c.serviceId && a.date >= c.startedOn) : [];
  const no = (a: Appointment) => {
    const i = inCourse.findIndex((x) => x.id === a.id);
    return i < 0 ? null : i + 1;
  };
  const rows = all.filter((a) => a.date <= today && (a.status === "done" || !!a.startedAt || !!a.endedAt)).slice(-10).reverse();
  if (!rows.length) return <p className="vas__empty">ยังไม่มีครั้งที่มารักษา</p>;
  return (
    <ol className="vas">
      {rows.map((a) => {
        const b = before(a, p);
        const n = no(a);
        const done = !!a.endedAt || a.status === "done";
        const d = a.painAfter !== undefined ? b.pain - a.painAfter : undefined;
        const svc = store.serviceById(a.serviceId);
        return (
          <li key={a.id}>
            <button type="button" className="vas__row" onClick={() => onOpen?.(a.id)}>
              <span className="vas__date">
                <small>{thaiDateShort(a.date).split(" ")[1]}</small>
                <b>{Number(a.date.slice(8))}</b>
              </span>
              <span className="vas__body">
                <b>
                  {a.start} น. · {svc.short || svc.name}
                  {n && c && <em>ครั้งที่ {n}/{c.total}</em>}
                </b>
                <small>
                  {b.app ? <Smartphone size={11} /> : <ClipboardCheck size={11} />} ประเมิน{b.from}
                  {a.addenda?.length ? (
                    <i>
                      <MessageSquareWarning size={11} /> แจ้งเพิ่ม {a.addenda.length}
                    </i>
                  ) : null}
                </small>
              </span>
              <span className="vas__pain">
                <span className="vas__nums">
                  <b style={{ color: painTone(b.pain) }}>{b.pain}</b>
                  <i>→</i>
                  <b style={{ color: a.painAfter !== undefined ? painTone(a.painAfter) : undefined }}>{a.painAfter ?? "—"}</b>
                </span>
                {d !== undefined ? (
                  <em className={clsx(d > 0 ? "is-good" : d < 0 ? "is-bad" : undefined)}>{d > 0 ? `ลด ${d}` : d < 0 ? `เพิ่ม ${-d}` : "เท่าเดิม"}</em>
                ) : (
                  <em className="is-info">{done ? "ไม่ได้ประเมิน" : "กำลังรักษา"}</em>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const painTone = (v: number) => (v >= 7 ? "#d8392a" : v >= 4 ? "#e08a1e" : "#2f9a5b");
