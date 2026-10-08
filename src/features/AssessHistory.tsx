import { useState } from "react";
import { ChevronDown, History, MessageSquareWarning } from "lucide-react";
import { clsx } from "clsx";
import type { Addendum, AssessRound } from "../data/types";
import { thaiDateLong } from "../data/thaiDate";
import "./assess-history.css";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => {
  const d = iso.slice(0, 10);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  return d === today ? `วันนี้ ${hm(iso)} น.` : `${thaiDateLong(d)} ${hm(iso)} น.`;
};

/** เปลี่ยนจากรอบก่อนตรงไหน (ความปวด · ตำแหน่ง · ข้อห้าม) */
function diffOf(cur: AssessRound, prev?: AssessRound): string[] {
  if (!prev) return [];
  const out: string[] = [];
  if (cur.pain !== prev.pain) out.push(`ปวด ${prev.pain} → ${cur.pain}`);
  const add = cur.focusAreas.filter((a) => !prev.focusAreas.includes(a));
  const gone = prev.focusAreas.filter((a) => !cur.focusAreas.includes(a));
  if (add.length) out.push(`เพิ่ม ${add.join(", ")}`);
  if (gone.length) out.push(`ไม่ปวดแล้ว ${gone.join(", ")}`);
  const flagNew = (cur.flags ?? []).filter((f) => !(prev.flags ?? []).includes(f));
  if (flagNew.length) out.push(`ข้อห้ามใหม่ ${flagNew.join(", ")}`);
  if (cur.complaint && cur.complaint !== prev.complaint) out.push("อาการที่เล่าเปลี่ยน");
  return out;
}

/**
 * แจ้งอาการเพิ่มหลังเช็กอิน (แสดงเด่น · ไม่แก้ผลประเมินที่ใช้) + ประวัติการประเมินในแอปหลายรอบ (ใช้รอบล่าสุดก่อนเช็กอิน)
 * ไม่มีอะไรให้แสดง (ประเมินรอบเดียว ไม่มีแจ้งเพิ่ม) = ไม่แสดง
 */
export function AssessHistory({ rounds = [], addenda = [] }: { rounds?: AssessRound[]; addenda?: Addendum[] }) {
  const [open, setOpen] = useState(false);
  // ประเมินรอบเดียว = อยู่ในการ์ดอาการสำคัญแล้ว (ไม่ต้องแสดงซ้ำ) · แสดงเมื่อประเมินหลายรอบ หรือมีแจ้งเพิ่ม
  if (rounds.length < 2 && !addenda.length) return null;
  const latest = rounds[rounds.length - 1];
  const list = [...rounds].reverse();
  return (
    <div className="ah">
      {addenda.length > 0 && (
        <div className="ah-add" role="status">
          <span className="ah-add__ico">
            <MessageSquareWarning size={16} />
          </span>
          <div>
            <b>แจ้งอาการเพิ่มหลังเช็กอิน</b>
            {addenda.map((a, i) => (
              <p key={`${a.at}${i}`}>
                <small>{hm(a.at)} น.</small> {a.text}
              </p>
            ))}
            <em>ตรวจอาการนี้ก่อนเริ่มนวด</em>
          </div>
        </div>
      )}
      {rounds.length > 1 && latest && (
        <div className="ah-rounds">
          <button type="button" className="ah-rounds__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <History size={15} />
            <span>
              <b>ประเมินในแอป {rounds.length} รอบ</b>
              <small>ใช้รอบล่าสุด {when(latest.at)}{diffOf(latest, rounds[rounds.length - 2]).length ? ` · ${diffOf(latest, rounds[rounds.length - 2]).join(", ")}` : ""}</small>
            </span>
            <ChevronDown size={16} className={clsx("ah-chev", open && "is-open")} />
          </button>
          {open && (
            <ol className="ah-list">
              {list.map((r, i) => {
                const n = rounds.length - i;
                const d = diffOf(r, rounds[n - 2]);
                return (
                  <li key={`${r.at}${n}`} className={clsx(i === 0 && "is-latest")}>
                    <div className="ah-list__top">
                      <b>รอบที่ {n}</b>
                      {i === 0 && <em>ใช้รอบนี้</em>}
                      <small>{when(r.at)}</small>
                    </div>
                    <p>
                      ปวด <b>{r.pain}/10</b>
                      {r.focusAreas.length ? ` · ${r.focusAreas.join(", ")}` : ""}
                      {r.avoidAreas.length ? ` (ไม่นวด ${r.avoidAreas.join(", ")})` : ""}
                    </p>
                    {r.complaint && <p className="ah-list__text">“{r.complaint}”</p>}
                    {(r.flags ?? []).length > 0 && <p className="ah-list__flag">ข้อห้าม: {r.flags!.join(", ")}</p>}
                    {d.length > 0 && <p className="ah-list__diff">เปลี่ยนจากรอบก่อน: {d.join(", ")}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
