import { ShieldAlert, ShieldCheck, ClipboardCheck } from "lucide-react";
import { useStore } from "../store/store";
import { screeningFlags } from "../data/counterScreening";
import { diffDays, thaiDateShort, todayISO } from "../data/thaiDate";
import type { Patient, Screening } from "../data/types";
import { evaluateScreening } from "../data/domain";
import { clsx } from "clsx";
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
          {stop ? "พบข้อห้าม" : "ข้อควรระวัง"}
          <small>
            {" "}
            · คัดกรอง {thaiDateShort(day)}
            {old ? " (เกิน 30 วัน ควรคัดกรองใหม่)" : ""}
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
export function VisitScreening({
  p,
  onScreen,
  app,
  assessedAt,
  pending,
  date,
}: {
  p: Patient;
  onScreen: () => void;
  /** แบบคัดกรองจากแอปของนัดนี้ */
  app?: Screening;
  /** เวลาที่ผู้ป่วยประเมินสำหรับนัดนี้ */
  assessedAt?: string;
  /** นัดจากแอป/ตามคอร์ส แต่ผู้ป่วยยังไม่ได้ประเมินสำหรับนัดนี้ */
  pending?: boolean;
  /** วันนัด (คัดกรองที่เคาน์เตอร์ต้องเป็นของวันนั้น) */
  date?: string;
}) {
  const { settings } = useStore();
  const s = p.screening;
  const today = !!s && s.at.slice(0, 10) === (date ?? todayISO());
  const when = assessedAt ? new Date(assessedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  // ยังไม่ได้วัดที่คลินิกวันนี้ แต่ผู้ป่วยตอบแบบคัดกรองในแอปแล้ว → บอกผลจากแอป + เหลือวัดความดัน/ชีพจร
  if (!today && app) {
    const flags = evaluateScreening(app, settings);
    const stop = flags.filter((f) => f.level === "stop");
    const warn = flags.filter((f) => f.level !== "stop");
    return (
      <div className={clsx("vscr", stop.length ? "is-stop" : "is-app")}>
        {stop.length ? <ShieldAlert size={18} /> : <ClipboardCheck size={18} />}
        <div>
          <b>{stop.length ? `ข้อห้ามจากแอป: ${stop.map((f) => f.label).join(", ")}` : "คัดกรองในแอปแล้ว · ผ่าน"}</b>
          <small>
            {stop.length ? `${stop[0].advice} · ` : warn.length ? `ระวัง ${warn.map((f) => f.label).join(", ")} · ` : when ? `ประเมิน ${when} น. · ` : ""}
            เหลือวัดความดันและชีพจร
          </small>
        </div>
        <button type="button" onClick={onScreen}>
          <span>วัดความดัน ชีพจร</span>
        </button>
      </div>
    );
  }
  if (!today)
    return (
      <div className={clsx("vscr", pending && "is-pending")}>
        <ClipboardCheck size={18} />
        <div>
          <b>ยังไม่ได้คัดกรองวันนี้</b>
          <small>{pending ? "ผู้ป่วยยังไม่ประเมินในแอป · วัดความดันก่อนนวด" : "วัดความดัน ชีพจร และถามอาการก่อนนวด"}</small>
        </div>
        <button type="button" onClick={onScreen}>
          <span>คัดกรองก่อนนวด</span>
        </button>
      </div>
    );
  if (screeningFlags(s, settings.bpThreshold).length) return <ScreeningAlert p={p} onAgain={onScreen} />;
  const t = new Date(s.at);
  const vit = [s.bpSys ? `ความดัน ${s.bpSys}/${s.bpDia ?? "—"}` : "", s.pulse ? `ชีพจร ${s.pulse}` : "", s.pain != null ? `ปวด ${s.pain}/10` : ""].filter(Boolean).join(", ");
  return (
    <div className="vscr is-ok">
      <ShieldCheck size={18} />
      <div>
        <b>ผ่านการคัดกรองวันนี้</b>
        <small>
          {String(t.getHours()).padStart(2, "0")}:{String(t.getMinutes()).padStart(2, "0")} น.{vit ? ` · ${vit}` : ""}
        </small>
      </div>
      <button type="button" onClick={onScreen}>
        <span>คัดกรองใหม่</span>
      </button>
    </div>
  );
}
