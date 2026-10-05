import { ShieldAlert } from "lucide-react";
import { useStore } from "../store/store";
import { screeningFlags } from "../data/counterScreening";
import { diffDays, thaiDateShort, todayISO } from "../data/thaiDate";
import type { Patient } from "../data/types";
import "./screening-alert.css";

/** Warns about contraindications found at the counter screening (registration / edit). Nothing when all clear. */
export function ScreeningAlert({ p }: { p: Patient }) {
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
    </div>
  );
}
