import { ShieldAlert, ShieldCheck, ClipboardCheck } from "lucide-react";
import { useStore } from "../store/store";
import { screeningFlags } from "../data/counterScreening";
import { diffDays, thaiDateShort, todayISO } from "../data/thaiDate";
import type { Patient } from "../data/types";
import "./screening-alert.css";
import "./screening-dialog.css";

/** Warns about contraindications found at the counter screening (registration / edit). Nothing when all clear. */
export function ScreeningAlert({ p, onAgain }: { p: Patient; /** shows a "คัดกรองใหม่" button */ onAgain?: () => void }) {
  const { settings } = useStore();
  const s = p.screening;
  if (!s) return null;
  const flags = screeningFlags(s, settings.bpThreshold);
  if (!flags.length) return null;
  const stop = flags.some((f) => f.level === "stop");
  const day = s.at.slice(0, 10);
  const old = diffDays(todayISO(), day) > 30;
  return (
    <div className={stop ? "scr-alert is-stop" : "scr-alert"}>
      <ShieldAlert size={18} />
      <div>
        <b>
          {stop ? "พบข้อห้ามจากการคัดกรอง" : "ข้อควรระวังจากการคัดกรอง"}
          <small>
            {" "}
            · {thaiDateShort(day)}
            {old ? " · เกิน 30 วัน ควรคัดกรองใหม่" : ""}
          </small>
        </b>
        <span>{flags.map((f) => f.label).join(" · ")}</span>
      </div>
      {onAgain && (
        <button type="button" className="vscr__again" onClick={onAgain}>
          <span>คัดกรองใหม่</span>
        </button>
      )}
    </div>
  );
}

/** Visit page: has the patient been screened today? Prompts a re-screen before every massage. */
export function VisitScreening({ p, onScreen }: { p: Patient; onScreen: () => void }) {
  const { settings } = useStore();
  const s = p.screening;
  const today = !!s && s.at.slice(0, 10) === todayISO();
  if (!today)
    return (
      <div className="vscr">
        <ClipboardCheck size={18} />
        <div>
          <b>ยังไม่ได้คัดกรองวันนี้</b>
          <small>วัดความดัน ชีพจร และถามอาการก่อนเริ่มนวด</small>
        </div>
        <button type="button" onClick={onScreen}>
          <span>คัดกรองก่อนนวด</span>
        </button>
      </div>
    );
  if (screeningFlags(s, settings.bpThreshold).length) return <ScreeningAlert p={p} onAgain={onScreen} />;
  const t = new Date(s.at);
  return (
    <div className="vscr is-ok">
      <ShieldCheck size={18} />
      <div>
        <b>ผ่านการคัดกรองวันนี้</b>
        <small>
          {String(t.getHours()).padStart(2, "0")}:{String(t.getMinutes()).padStart(2, "0")} น.{s.bpSys ? ` · ความดัน ${s.bpSys}/${s.bpDia ?? "—"}` : ""}
          {s.pulse ? ` · ชีพจร ${s.pulse}` : ""}
          {s.pain != null ? ` · ปวด ${s.pain}/10` : ""}
        </small>
      </div>
      <button type="button" onClick={onScreen}>
        <span>คัดกรองใหม่</span>
      </button>
    </div>
  );
}
