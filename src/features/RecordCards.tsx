import { forwardRef } from "react";
import { TriangleAlert } from "lucide-react";
import type { HTMLMotionProps } from "framer-motion";
import type { Appointment, BookingRequest } from "../data/types";
import { Avatar, Badge, Button, Card } from "../design-system";
import { CalendarSmallIcon, ClockIcon, LeafIcon, ShieldCheckIcon } from "../design-system/icons";
import { useStore } from "../store/store";
import { evaluateScreening, isOverdue, painTone, stageMeta, stageOf } from "../data/domain";
import { patientPhoto, therapistPhoto } from "../data/avatars";
import { fromMinutes, thaiDateShort, timeAgo, toMinutes } from "../data/thaiDate";
import "./cards.css";

export function PainBadge({ score }: { score: number }) {
  return <Badge tone={painTone(score)}>Pain Score: {score}/10</Badge>;
}

/** Compact pain read-out: 5 pips (2 points each) + number, coloured by severity. */
export function PainMini({ score, label = "Pain" }: { score: number; label?: string }) {
  const tone = painTone(score);
  return (
    <span className={`pain-mini pain-mini--${tone}`} title={`Pain Score ${score}/10`}>
      <span className="pain-mini__label">{label}</span>
      <span className="pain-mini__pips" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} data-on={score > i * 2 || undefined} />
        ))}
      </span>
      <b>{score}</b>
    </span>
  );
}

type CardMotion = Omit<HTMLMotionProps<"div">, "children">;

/** Today's job — who, when, what, with whom, how much pain, where they are in the flow. */
export const AppointmentCard = forwardRef<HTMLDivElement, CardMotion & { appt: Appointment; showDate?: boolean }>(
  function AppointmentCard({ appt, showDate, ...rest }, ref) {
    const { patientById, serviceById, therapistById, dispatch } = useStore();
    const p = patientById(appt.patientId);
    const s = serviceById(appt.serviceId);
    const t = therapistById(appt.therapistId);
    const st = isOverdue(appt) ? { label: "เกินเวลา", tone: "danger" as const, color: "var(--status-absent)", next: "เรียกคิว" } : stageMeta(appt);
    const stage = stageOf(appt);
    // one-tap next step straight from the card; steps that need input open the drawer instead
    const quick = (e: React.MouseEvent) => {
      const now = new Date().toISOString();
      if (stage === "waiting") dispatch({ type: "updateAppointment", id: appt.id, patch: { calledAt: now }, log: "เรียกคิว" });
      else if (stage === "treating") dispatch({ type: "updateAppointment", id: appt.id, patch: { endedAt: now }, log: "จบการรักษา" });
      else return; // called (pick a bed) / assess / billing → let the click open the visit page
      e.stopPropagation();
    };
    const end = fromMinutes(toMinutes(appt.start) + s.minutes);
    const pain = appt.status === "done" && appt.painAfter !== undefined ? appt.painAfter : appt.painBefore;
    return (
      <Card
        ref={ref}
        interactive
        className={`pcard pcard--${appt.status}`}
        role="button"
        tabIndex={0}
        aria-label={`${p.name} ${appt.start}–${end} ${st.label}`}
        {...rest}
      >
        <div className="pcard__head">
          <Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" ring={st.color} pulse={stage === "treating"} />
          <div className="pcard__id">
            <p className="pcard__name">{p.name}</p>
            <p className="pcard__sub">
              {p.hn} · {p.gender} {p.age} ปี
            </p>
          </div>
          <div className="pcard__time">
            {showDate && <small>{thaiDateShort(appt.date)}</small>}
            <b>{appt.start}</b>
            <small>ถึง {end}</small>
          </div>
        </div>

        <div className="pcard__strip">
          <span className="pcard__svc">
            <LeafIcon />
            <span>
              {s.name} · {s.minutes} นาที
            </span>
          </span>
          <PainMini score={pain} label={appt.status === "done" && appt.painAfter !== undefined ? "หลังนวด" : "Pain"} />
        </div>

        <div className="pcard__foot">
          <span className="pcard__staff">
            <Avatar name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
            <span>{t.name}</span>
          </span>
          {appt.bedId && stage !== "done" && (
            <Badge tone="info" compact>
              {appt.bedId}
            </Badge>
          )}
          {appt.type === "walkin" && (
            <Badge tone="neutral" compact>
              Walk-in
            </Badge>
          )}
          <Badge tone={st.tone} compact dot className="pcard__status">
            {st.label}
          </Badge>
          {"next" in st && st.next && appt.date === new Date().toISOString().slice(0, 10) && (
            <button type="button" className="pcard__next" onClick={quick} onKeyDown={(e) => e.stopPropagation()}>
              {st.next} →
            </button>
          )}
        </div>
      </Card>
    );
  },
);

/** Booking request from the ThaiWell AI app awaiting staff approval. */
export const RequestCard = forwardRef<
  HTMLDivElement,
  CardMotion & { req: BookingRequest; onApprove: () => void; onReject: () => void; inert?: boolean; elevated?: boolean }
>(function RequestCard({ req, onApprove, onReject, inert, elevated, ...rest }, ref) {
  const { patientById, serviceById, therapistById, settings } = useStore();
  const p = patientById(req.patientId);
  const s = serviceById(req.serviceId);
  const t = therapistById(req.therapistId);
  const flags = evaluateScreening(req.screening, settings);
  const stop = flags.some((f) => f.level === "stop");
  const end = fromMinutes(toMinutes(req.start) + s.minutes);
  return (
    <Card ref={ref} elevated={elevated} className="pcard pcard--request" aria-hidden={inert || undefined} {...rest}>
      <div className="pcard__head">
        <Avatar name={p.name} src={patientPhoto(p)} size="card" shape="squircle" />
        <div className="pcard__id">
          <p className="pcard__name">{p.name}</p>
          <p className="pcard__sub">ส่งผ่านแอป ThaiWell AI · {timeAgo(req.submittedAt)}</p>
        </div>
        {flags.length > 0 ? (
          <Badge tone={stop ? "danger" : "warning"} compact>
            <TriangleAlert size={10} strokeWidth={2.6} />
            {flags.length === 1 ? flags[0].label : `ข้อควรระวัง ${flags.length}`}
          </Badge>
        ) : (
          <Badge tone="success" compact>
            <ShieldCheckIcon />
            ผ่านคัดกรอง
          </Badge>
        )}
      </div>

      <div className="pcard__strip">
        <span className="pcard__when">
          <CalendarSmallIcon />
          <b>{thaiDateShort(req.date, true)}</b>
          <ClockIcon />
          <b>
            {req.start}–{end}
          </b>
        </span>
        <PainMini score={req.painScore} />
      </div>

      <p className="pcard__line">
        {s.name} · {s.minutes} นาที · {t.name}
      </p>

      <div className="pcard__actions">
        <Button variant="outline" size="md" fill onClick={onReject} tabIndex={inert ? -1 : undefined}>
          ปฏิเสธ
        </Button>
        <Button variant="primary" size="md" fill onClick={onApprove} tabIndex={inert ? -1 : undefined}>
          อนุมัติและจัดคิว
        </Button>
      </div>
    </Card>
  );
});
