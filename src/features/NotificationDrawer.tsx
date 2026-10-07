import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, ClipboardList, Phone, TriangleAlert, Trash2, UserRoundX, UsersRound } from "lucide-react";
import { useStore } from "../store/store";
import { Avatar, Badge, Button } from "../design-system";
import { creditInfo, evaluateScreening, stageMeta } from "../data/domain";
import { patientPhoto, therapistPhoto } from "../data/avatars";
import { thaiDate, thaiDateLong, timeAgo, timeRange, todayISO } from "../data/thaiDate";
import type { Appointment, BookingRequest, Notification, Patient } from "../data/types";
import { ApproveDialog, RejectDialog } from "./RequestDialogs";
import "./notifications.css";

const KIND: Record<Notification["kind"], { icon: typeof Phone; label: string; go: string }> = {
  request: { icon: CalendarClock, label: "คำขอจอง", go: "ไปหน้าคำขอ" },
  alert: { icon: TriangleAlert, label: "คัดกรอง", go: "ไปหน้าคำขอ" },
  noshow: { icon: UserRoundX, label: "ไม่มาตามนัด", go: "ไปตารางนัด" },
  staff: { icon: UsersRound, label: "เจ้าหน้าที่", go: "ไปจัดตารางงาน" },
  info: { icon: ClipboardList, label: "ติดตามผล", go: "ไปหน้าผู้มารับบริการ" },
};

export interface DetailView {
  leading: React.ReactNode;
  title: string;
  subtitle: string;
  body: React.ReactNode;
  footer: React.ReactNode;
  dialogs: React.ReactNode;
}

/** Detail of one notification + the actions that resolve it — rendered inside the notifications drawer. */
export function useNotificationDetail(id: string | null, onDone: () => void): DetailView | null {
  const store = useStore();
  const navigate = useNavigate();
  const [approve, setApprove] = useState<BookingRequest | null>(null);
  const [reject, setReject] = useState<BookingRequest | null>(null);
  const n = id ? store.notifications.find((x) => x.id === id) : undefined;
  if (!n) return null;
  const K = KIND[n.kind] ?? KIND.info;

  const request = n.ref ? store.requests.find((r) => r.id === n.ref) : undefined;
  const appt = n.ref ? store.appointments.find((a) => a.id === n.ref) : undefined;
  const therapist = n.ref ? store.therapists.find((t) => t.id === n.ref) : undefined;
  const person = n.ref ? store.patients.find((p) => p.id === n.ref) : undefined;
  const patient = request ? store.patientById(request.patientId) : appt ? store.patientById(appt.patientId) : person;

  const leave = therapist ? Object.entries(therapist.exceptions ?? {}).filter(([d, e]) => d >= todayISO() && e.kind === "leave") : [];
  const affected = therapist
    ? store.appointments.filter((a) => a.therapistId === therapist.id && a.status === "waiting" && leave.some(([d]) => d === a.date))
    : [];
  const followUp = n.ref === "followup" ? store.appointments.filter((a) => a.status === "done" && a.date >= thaiDateMinus(2)).slice(0, 6) : [];
  const lowCredit =
    n.ref === "credits"
      ? store.patients
          .map((p) => ({ p, c: creditInfo(p, store.appointments) }))
          .filter((x) => x.c && x.c.remaining <= 1)
          .slice(0, 6)
      : [];

  const close = () => {
    setApprove(null);
    setReject(null);
    onDone();
  };
  const goPage = () => {
    close();
    if (n.link) navigate(n.link);
  };

  const leading = (
    <span className={`notif__icon notif__icon--${n.kind} notif__icon--lg`}>
      <K.icon size={20} strokeWidth={1.9} />
    </span>
  );
  const footer = (
          <>
            <button
              type="button"
              className="nd-del"
              onClick={() => {
                store.dispatch({ type: "dismissNotification", id: n.id });
                close();
              }}
            >
              <Trash2 size={15} /> ลบ
            </button>
            {request ? (
              <>
                <Button variant="outline" size="lg" onClick={() => setReject(request)}>
                  ปฏิเสธ
                </Button>
                <Button size="lg" onClick={() => setApprove(request)}>
                  อนุมัติและจัดคิว
                </Button>
              </>
            ) : (
              n.link && (
                <Button size="lg" trailing={<ArrowRight size={16} />} onClick={goPage}>
                  {K.go}
                </Button>
              )
            )}
          </>
  );
  const body = (
        <div className="nd">
          <p className="nd__body">{n.body}</p>

          {patient && <PatientCard p={patient} />}

          {request && (
            <section className="nd__card">
              <h3>คำขอที่ส่งมา</h3>
              <Row label="วันเวลา" value={`${thaiDateLong(request.date)} · ${timeRange(request.start, store.serviceById(request.serviceId).minutes)} น.`} />
              <Row label="บริการ" value={store.serviceById(request.serviceId).name} />
              <Row label="ผู้บำบัดที่ขอ" value={store.therapistById(request.therapistId).name} />
              <Row label="Pain Score" value={`${request.painScore}/10`} />
              {request.note && <Row label="หมายเหตุ" value={request.note} />}
              <div className="nd__flags">
                {evaluateScreening(request.screening, store.settings).map((f) => (
                  <div key={f.key} className={`alert alert--${f.level === "stop" ? "stop" : "caution"}`}>
                    <TriangleAlert size={16} />
                    <div>
                      <b>{f.label}</b>
                      {f.advice}
                    </div>
                  </div>
                ))}
                {evaluateScreening(request.screening, store.settings).length === 0 && <Badge tone="success">ผ่านแบบคัดกรอง</Badge>}
              </div>
            </section>
          )}
          {!request && n.ref && (n.kind === "request" || n.kind === "alert") && !person && (
            <p className="tw-meta">คำขอนี้ถูกพิจารณาไปแล้ว</p>
          )}

          {appt && <ApptCard a={appt} />}
          {appt && appt.status === "waiting" && (
            <div className="nd__actions">
              <Button variant="outline" size="md" onClick={() => store.dispatch({ type: "setStatus", id: appt.id, status: "active" })}>
                ผู้ป่วยมาแล้ว
              </Button>
              <Button variant="outline" size="md" className="nd-danger" onClick={() => store.dispatch({ type: "setStatus", id: appt.id, status: "absent" })}>
                บันทึกว่าไม่มา
              </Button>
            </div>
          )}

          {therapist && (
            <section className="nd__card">
              <h3>ผู้บำบัด</h3>
              <div className="nd__person">
                <Avatar name={therapist.name} src={therapistPhoto(therapist)} size="md" color={therapist.color} />
                <span>
                  <b>{therapist.name}</b>
                  <small>{therapist.role}</small>
                </span>
              </div>
              {leave.map(([d, e]) => (
                <Row key={d} label={e.reason ?? "ลา"} value={thaiDateLong(d)} />
              ))}
              <h3 className="nd__sub">คิวที่ต้องย้าย ({affected.length})</h3>
              {affected.length ? affected.map((a) => <MiniAppt key={a.id} a={a} />) : <p className="tw-meta">ไม่มีคิวค้าง</p>}
            </section>
          )}

          {followUp.length > 0 && (
            <section className="nd__card">
              <h3>รอส่งแบบประเมินหลังนวด</h3>
              {followUp.map((a) => (
                <MiniAppt key={a.id} a={a} />
              ))}
            </section>
          )}
          {lowCredit.length > 0 && (
            <section className="nd__card">
              <h3>เครดิตใกล้หมด</h3>
              {lowCredit.map(({ p, c }) => (
                <div key={p.id} className="nd__mini">
                  <Avatar name={p.name} src={patientPhoto(p)} size="sm" shape="squircle" />
                  <span>
                    <b>{p.name}</b>
                    <small>{p.course?.name}</small>
                  </span>
                  <Badge tone={c!.remaining === 0 ? "danger" : "warning"} compact>
                    เหลือ {c!.remaining}/{c!.total}
                  </Badge>
                </div>
              ))}
            </section>
          )}
        </div>
  );
  return {
    leading,
    title: n.title,
    subtitle: `${K.label} · ${timeAgo(n.at)}`,
    body,
    footer,
    dialogs: (
      <>
        <ApproveDialog request={approve} onClose={() => setApprove(null)} />
        <RejectDialog request={reject} onClose={() => setReject(null)} />
      </>
    ),
  };

  function PatientCard({ p }: { p: Patient }) {
    return (
      <section className="nd__card nd__patient">
        <Avatar name={p.name} src={patientPhoto(p)} size="lg" shape="squircle" />
        <span>
          <b>{p.name}</b>
          <small>
            {p.hn} · {p.gender} {p.age} ปี
          </small>
        </span>
        {p.phone && (
          <a className="nd__call" href={`tel:${p.phone}`} aria-label={`โทร ${p.phone}`}>
            <Phone size={16} />
          </a>
        )}
      </section>
    );
  }
}

function thaiDateMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="nd__row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ApptCard({ a }: { a: Appointment }) {
  const store = useStore();
  const s = store.serviceById(a.serviceId);
  const meta = stageMeta(a);
  return (
    <section className="nd__card">
      <h3>
        คิวนัด <Badge tone={meta.tone} compact>{meta.label}</Badge>
      </h3>
      <Row label="วันเวลา" value={`${thaiDateLong(a.date)} · ${timeRange(a.start, s.minutes)} น.`} />
      <Row label="บริการ" value={s.name} />
      <Row label="ผู้บำบัด" value={store.therapistById(a.therapistId).name} />
    </section>
  );
}

function MiniAppt({ a }: { a: Appointment }) {
  const store = useStore();
  const p = store.patientById(a.patientId);
  return (
    <div className="nd__mini">
      <Avatar name={p.name} src={patientPhoto(p)} size="sm" shape="squircle" />
      <span>
        <b>{p.name}</b>
        <small>
          {thaiDate(a.date)} · {a.start} น. · {store.serviceById(a.serviceId).short}
        </small>
      </span>
    </div>
  );
}
