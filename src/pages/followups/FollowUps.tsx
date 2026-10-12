import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, HeartPulse, Phone } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Badge, EmptyState, Segmented, useToast } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { BackLead } from "../../layout/BackLead";
import { patientPhoto } from "../../data/avatars";
import { thaiDateShort } from "../../data/thaiDate";
import { FOLLOW_META, followRows, needsCall, type FollowRow } from "../../data/followups";
import "../patients/patients.css";
import "./followups.css";

type View = "call" | "all";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/** ติดตามผลหลังนวด: ผลที่ผู้ป่วยตอบในแอป (แจ้งเตือน 48 ชม.) · ใครต้องโทร (แย่ลง / ไม่ตอบ / ไม่ใช้แอป) · บันทึกว่าโทรแล้ว */
export default function FollowUps() {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("call");
  const rows = useMemo(() => followRows(store.appointments, store.patientById, store.settings.followUpHours ?? 48), [store.appointments, store.patientById, store.settings.followUpHours]);
  const toCall = rows.filter(needsCall);
  const shown = view === "call" ? toCall : rows;

  const markCalled = (r: FollowRow) => {
    const prev = r.a;
    store.dispatch({ type: "updateAppointment", id: r.a.id, patch: { followCall: { at: new Date().toISOString(), by: store.settings.staffName } }, log: "โทรติดตามผลหลังนวดแล้ว" });
    toast({ message: `บันทึกว่าโทรติดตาม ${r.p.name} แล้ว`, action: { label: "เลิกทำ", onClick: () => store.dispatch({ type: "restoreAppointment", appointment: prev }) } });
  };

  return (
    <WorkPage
      eyebrow="ผู้ป่วย"
      title="ติดตามผลหลังนวด"
      bell={false}
      lead={<BackLead eyebrow="ผู้ป่วย" title="ติดตามผลหลังนวด" onBack={() => navigate(-1)} />}
      actions={
        <Segmented
          label="แสดง"
          value={view}
          onChange={setView}
          options={[
            { value: "call", label: `ต้องโทร (${toCall.length})` },
            { value: "all", label: `ทั้งหมด 14 วัน (${rows.length})` },
          ]}
        />
      }
    >
      <div className="fu">
        <p className="fu__hint">
          ผู้ป่วยที่ใช้แอปจะได้รับแจ้งเตือนให้ประเมินหลังนวด {store.settings.followUpHours ?? 48} ชม. · คนที่อาการแย่ลง ไม่ตอบเกิน 1 วัน หรือไม่ได้ใช้แอป จะขึ้นในรายการ “ต้องโทร”
        </p>
        <div className="fu__list">
          {shown.map((r, i) => {
            const m = FOLLOW_META[r.state];
            const fu = r.a.followUp;
            return (
              <motion.div key={r.a.id} className={clsx("prow fu__row", `is-${r.state}`)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.25) }}>
                <Avatar name={r.p.name} src={patientPhoto(r.p)} shape="squircle" />
                <span className="prow__id">
                  <b>{r.p.name}</b>
                  <small>
                    {store.serviceById(r.a.serviceId).short} · นวด {thaiDateShort(r.a.date)} · {r.p.phone || "ไม่มีเบอร์"}
                  </small>
                  <span className="prow__chips">
                    <Badge tone={m.tone} compact>
                      {m.label}
                    </Badge>
                    {r.a.followCall && (
                      <Badge tone="neutral" compact>
                        <Check size={11} /> โทรแล้ว {thaiDateShort(r.a.followCall.at.slice(0, 10))} {clock(r.a.followCall.at)}
                      </Badge>
                    )}
                  </span>
                </span>
                {/* ปวด: ก่อนนวด → หลังนวด → ตอนนี้ (ติดตามผล) */}
                <span className="fu__pain" aria-label="ความปวด ก่อนนวด หลังนวด และตอนติดตามผล">
                  <i>
                    <small>ก่อน</small>
                    {r.a.painBefore ?? "–"}
                  </i>
                  <i>
                    <small>หลัง</small>
                    {r.a.painAfter ?? "–"}
                  </i>
                  <i className={clsx(fu && "is-now", r.state === "worse" && "is-bad")}>
                    <small>ตอนนี้</small>
                    {fu ? fu.pain : "?"}
                  </i>
                </span>
                {fu?.issues.length ? <em className="fu__issues">{fu.issues.join(" · ")}</em> : null}
                <span className="fu__acts">
                  {r.p.phone && (
                    <a className="pd__ib" href={`tel:${r.p.phone.replace(/-/g, "")}`} aria-label={`โทร ${r.p.phone}`} title={`โทร ${r.p.phone}`}>
                      <Phone size={17} />
                    </a>
                  )}
                  {m.call && !r.a.followCall && (
                    <button type="button" className="fu__done" onClick={() => markCalled(r)} aria-label="บันทึกว่าโทรแล้ว" title="บันทึกว่าโทรติดตามแล้ว">
                      <Check size={15} strokeWidth={2.6} /> โทรแล้ว
                    </button>
                  )}
                </span>
              </motion.div>
            );
          })}
          {shown.length === 0 && (
            <EmptyState onGlass icon={<HeartPulse size={24} />} title={view === "call" ? "ไม่มีใครต้องโทรตอนนี้" : "ยังไม่มีการรักษาใน 14 วัน"} description={view === "call" ? "ผู้ป่วยตอบในแอปแล้วและไม่มีใครอาการแย่ลง" : "นัดที่บันทึกการรักษาแล้วจะขึ้นที่นี่"} />
          )}
        </div>
      </div>
    </WorkPage>
  );
}
