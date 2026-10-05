import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, CircleAlert, Footprints, Phone, UserPlus } from "lucide-react";
import { useStore } from "../store/store";
import { Avatar, Badge, Button, Dialog, Field, Input, SearchField, Segmented, Select, useToast } from "../design-system";
import { creditInfo, requestConflicts, shiftsOn, staffState, type StaffState } from "../data/domain";
import { patientPhoto, therapistPhoto } from "../data/avatars";
import { addISODays, fromISODate, thaiDate, thaiDateLong, timeRange, toMinutes, todayISO } from "../data/thaiDate";
import type { VisitType } from "../data/types";
import { slotLoad } from "./slotLoad";
import { CalendarPicker } from "./CalendarPicker";
import { slotTimes } from "../data/seed";
import "./book-dialog.css";

export interface BookSlot {
  date: string;
  start: string;
}

export interface BookPreset {
  /** fixed slot from the calendar (date/time pickers hidden) */
  slot?: BookSlot;
  type?: VisitType;
  patientId?: string;
  serviceId?: string;
  therapistId?: string;
  /** rescheduling a booking request: approve it into the chosen slot */
  requestId?: string;
}

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Add an appointment: walk-in, staff-booked, or a request moved to a new time after calling the patient. */
export function BookDialog({ preset, onClose }: { preset: BookPreset | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [shown, setShown] = useState<BookPreset | null>(preset);
  if (preset && preset !== shown) setShown(preset);
  const p0 = preset ?? shown;

  const [type, setType] = useState<VisitType>("booked");
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("");
  const [query, setQuery] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("s1");
  const [therapistId, setTherapistId] = useState("");
  // quick registration for a first-time visitor, without leaving the booking
  const blank = { title: "นาย", first: "", last: "", age: "", phone: "" };
  const [reg, setReg] = useState<typeof blank | null>(null);

  const today = todayISO();
  const staff = { therapists: store.therapists, serviceId };
  const slots = useMemo(
    () => slotLoad(store.appointments, date, store.settings, { therapists: store.therapists, serviceId }),
    [store.appointments, store.settings, store.therapists, date, serviceId],
  );
  const isPastSlot = (d: string, t: string) => d < today || (d === today && toMinutes(t) + store.settings.slotMinutes <= nowMinutes());
  const capacity = slotTimes(store.settings.openTime, store.settings.closeTime, store.settings.slotMinutes).length * store.settings.bedsPerSlot;
  const dayLoad = (d: string) =>
    store.appointments.filter((a) => a.date === d && a.status !== "cancelled" && a.status !== "absent").length / capacity;
  const firstOpen = (d: string) => slots.find((s) => s.free > 0 && !isPastSlot(d, s.time))?.time ?? "";

  /** first day on/after `from` (max 21 days) that still has a bookable slot */
  const firstOpenDate = (from: string) => {
    for (let i = 0; i < 21; i++) {
      const d = addISODays(from < today ? today : from, i);
      if (store.settings.closedWeekdays.includes(fromISODate(d).getDay())) continue;
      if (slotLoad(store.appointments, d, store.settings, staff).some((s) => s.free > 0 && !isPastSlot(d, s.time))) return d;
    }
    return from;
  };

  useEffect(() => {
    if (!preset) return;
    const t = preset.type ?? "booked";
    const req = preset.requestId ? store.requests.find((r) => r.id === preset.requestId) : undefined;
    const d = preset.slot?.date ?? (t === "walkin" ? today : firstOpenDate(req?.date ?? today));
    setType(t);
    setDate(d);
    setStart(preset.slot?.start ?? "");
    setQuery("");
    setPatientId(preset.patientId ?? null);
    setServiceId(preset.serviceId ?? (preset.patientId ? store.patientById(preset.patientId).course?.serviceId : undefined) ?? "s1");
    setTherapistId(preset.therapistId ?? "");
    setReg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // pick the first open slot when none is chosen (or the chosen one became invalid)
  useEffect(() => {
    if (!p0 || p0.slot) return;
    const cur = slots.find((s) => s.time === start);
    if (!cur || cur.free === 0 || isPastSlot(date, start)) setStart(firstOpen(date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, slots, p0]);

  /** every therapist with whether they can take this service in this slot — free ones first */
  const roster = useMemo(() => {
    const rank: Record<StaffState, number> = { free: 0, busy: 1, service: 2, off: 3 };
    return store.therapists
      .map((t) => ({ t, state: start ? staffState(t, { date, start, serviceId }, store.appointments) : ("off" as StaffState) }))
      .sort((a, b) => rank[a.state] - rank[b.state]);
  }, [store.therapists, store.appointments, date, start, serviceId]);
  const freeTherapists = roster.filter((r) => r.state === "free").map((r) => r.t);
  // keep the choice only while that therapist can still take this slot — staff pick explicitly
  useEffect(() => {
    if (therapistId && !freeTherapists.some((t) => t.id === therapistId)) setTherapistId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.patients.filter((p) => !q || `${p.name} ${p.hn} ${p.phone}`.toLowerCase().includes(q)).slice(0, 30);
  }, [store.patients, query]);

  if (!p0) return null;
  const request = p0.requestId ? store.requests.find((r) => r.id === p0.requestId) : undefined;
  const patient = patientId ? store.patientById(patientId) : null;
  const credits = patient ? creditInfo(patient, store.appointments) : null;
  const service = store.serviceById(serviceId);
  const clash = patient ? store.appointments.some((a) => a.patientId === patient.id && a.date === date && (a.status === "waiting" || a.status === "active")) : false;
  const full = !!start && freeTherapists.length === 0;
  const therapist = therapistId ? store.therapistById(therapistId) : null;
  const canSave = !!patient && !!start && !!therapistId && !full && !isPastSlot(date, start);

  const regValid = !!reg && !!reg.first.trim() && !!reg.last.trim() && Number(reg.age) > 0 && /^[0-9-]{9,12}$/.test(reg.phone);
  const startReg = () => {
    const [first = "", ...rest] = query.trim().split(/\s+/);
    const digits = /^[0-9-]+$/.test(first);
    setReg({ ...blank, first: digits ? "" : first, last: digits ? "" : rest.join(" "), phone: digits ? first : "" });
  };
  const register = () => {
    if (!reg || !regValid) return;
    const id = store.nextId("p");
    const name = `${reg.title} ${reg.first.trim()} ${reg.last.trim()}`;
    store.dispatch({
      type: "addPatient",
      patient: {
        id,
        hn: `HN${String(641_000 + store.patients.length).padStart(7, "0")}`,
        name,
        gender: reg.title === "นาย" ? "ชาย" : "หญิง",
        age: Number(reg.age),
        phone: reg.phone,
        complaint: "ต้องการนวดผ่อนคลาย",
        conditions: [],
        painHistory: [],
        registeredOn: today,
      },
    });
    toast({ message: `ลงทะเบียน ${name} แล้ว` });
    setReg(null);
    setQuery(name);
    setPatientId(id);
  };

  const pick = (id: string) => {
    setPatientId(id);
    const p = store.patientById(id);
    if (p.course) setServiceId(p.course.serviceId);
  };

  const save = () => {
    if (!patient) return;
    if (request) {
      store.dispatch({ type: "approve", id: request.id, patch: { date, start, therapistId, serviceId } });
      toast({ message: `ยืนยันนัดใหม่ ${patient.name} · ${thaiDate(date)} ${start} น.` });
    } else {
      store.dispatch({
        type: "schedule",
        items: [
          {
            patientId: patient.id,
            serviceId,
            therapistId,
            date,
            start,
            status: "waiting",
            type,
            painBefore: [...patient.painHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.score ?? 5,
            paid: false,
          },
        ],
      });
      toast({ message: `เพิ่มคิว${type === "walkin" ? " Walk-in" : ""} ${patient.name} · ${start} น.` });
    }
    onClose();
  };

  const title = request ? "เลื่อนนัด / จัดคิวใหม่" : "เพิ่มคิวนัด";
  const subtitle = request
    ? `ขอไว้ ${thaiDate(request.date)} ${request.start} น. · เลือกเวลาใหม่หลังโทรยืนยันกับผู้ป่วย`
    : p0.slot
      ? `${thaiDateLong(date)} · ${timeRange(start, service.minutes)} น.`
      : "ลงคิว Walk-in หรือนัดล่วงหน้าให้ผู้มารับบริการ";

  return (
    <Dialog
      open={preset !== null}
      wide
      className="book-dialog"
      onClose={onClose}
      leading={
        <span className="tw-avatar tw-avatar--lg" style={{ background: "var(--color-brand)" }}>
          {type === "walkin" ? <Footprints size={22} /> : <CalendarPlus size={22} />}
        </span>
      }
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button size="lg" disabled={!canSave} leading={<Check size={16} />} onClick={save}>
            {request ? "ยืนยันนัดใหม่" : "บันทึกคิว"}
          </Button>
        </>
      }
    >
      <div className="book">
        <section className="book__pick">
          <h3 className="book__h">1 · ผู้รับบริการ</h3>
          {patient && p0.patientId ? (
            <>
            <div className="book__fixed">
              <Avatar name={patient.name} src={patientPhoto(patient)} size="lg" shape="squircle" />
              <span className="book__name">
                {patient.name}
                <small>
                  {patient.hn} · {patient.phone}
                </small>
              </span>
              <Button variant="outline" size="md" leading={<Phone size={14} />} onClick={() => (window.location.href = `tel:${patient.phone.replace(/-/g, "")}`)}>
                โทร
              </Button>
            </div>
            {request && (
              <div className="book__req">
                <span className="tw-caption">คำขอเดิมจากแอป ThaiWell AI</span>
                <b>
                  {thaiDateLong(request.date)} · {request.start} น.
                </b>
                <span className="tw-meta">
                  {store.serviceById(request.serviceId).name} · {store.therapistById(request.therapistId).name}
                </span>
                <div className="tags">
                  {requestConflicts(request, store.appointments, store.settings, store.therapists).map((x) => (
                    <Badge key={x.kind} tone={x.kind === "double" ? "warning" : "danger"} compact>
                      {x.label}
                    </Badge>
                  ))}
                </div>
                <ol className="book__steps">
                  <li>โทรแจ้งผู้ป่วยว่าเวลาที่ขอไม่ว่าง</li>
                  <li>เสนอเวลาใหม่จากรอบที่ว่างด้านขวา</li>
                  <li>กด "ยืนยันนัดใหม่" — ระบบแจ้งผู้ป่วยผ่านแอป ThaiWell AI</li>
                </ol>
              </div>
            )}
            </>
          ) : (
            reg ? (
              <div className="book__reg">
                <div className="book__reg-head">
                  <span className="book__reg-icon">
                    <UserPlus size={18} strokeWidth={1.9} />
                  </span>
                  <span>
                    <b>ผู้รับบริการใหม่</b>
                    <small>กรอกข้อมูลพื้นฐาน · เพิ่มรูปและประวัติได้ภายหลัง</small>
                  </span>
                </div>
                <div className="book__reg-grid">
                  <Field label="คำนำหน้า">
                    <Select value={reg.title} onChange={(e) => setReg({ ...reg, title: e.target.value })}>
                      <option>นาย</option>
                      <option>นาง</option>
                      <option>นางสาว</option>
                    </Select>
                  </Field>
                  <Field label="อายุ">
                    <Input type="number" inputMode="numeric" min={1} max={120} value={reg.age} onChange={(e) => setReg({ ...reg, age: e.target.value })} />
                  </Field>
                  <Field label="ชื่อ" className="span-2">
                    <Input value={reg.first} onChange={(e) => setReg({ ...reg, first: e.target.value })} autoFocus />
                  </Field>
                  <Field label="นามสกุล" className="span-2">
                    <Input value={reg.last} onChange={(e) => setReg({ ...reg, last: e.target.value })} />
                  </Field>
                  <Field label="เบอร์โทรศัพท์" className="span-2" hint="ใช้ส่งแจ้งเตือนนัดผ่านแอป ThaiWell AI">
                    <Input inputMode="tel" placeholder="081-234-5678" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
                  </Field>
                </div>
                <div className="book__reg-actions">
                  <Button variant="outline" size="md" onClick={() => setReg(null)}>
                    กลับ
                  </Button>
                  <Button size="md" fill disabled={!regValid} leading={<Check size={16} />} onClick={register}>
                    ลงทะเบียนและเลือก
                  </Button>
                </div>
              </div>
            ) : (
            <>
              <SearchField tone="light" value={query} onChange={setQuery} placeholder="ค้นหาชื่อ HN หรือเบอร์โทร" shortcut={false} />
              <div className="book__list scroll-y scroll-y--light">
                <button type="button" className="book__person book__new" onClick={startReg}>
                  <span className="book__new-icon">
                    <UserPlus size={18} strokeWidth={1.9} />
                  </span>
                  <span className="book__name">
                    {query.trim() && people.length === 0 ? `ลงทะเบียน “${query.trim()}”` : "ผู้รับบริการใหม่"}
                    <small>{people.length === 0 && query.trim() ? "ไม่พบในระบบ · ลงทะเบียนแล้วจองต่อได้ทันที" : "ยังไม่เคยมารับบริการ · ลงทะเบียนด่วน"}</small>
                  </span>
                </button>
                {people.map((p) => {
                  const c = creditInfo(p, store.appointments);
                  return (
                    <button key={p.id} type="button" className="book__person" aria-pressed={p.id === patientId} onClick={() => pick(p.id)}>
                      <Avatar name={p.name} src={patientPhoto(p)} size="md" shape="squircle" />
                      <span className="book__name">
                        {p.name}
                        <small>{p.hn}</small>
                      </span>
                      {c ? (
                        <span className={"book__credit" + (c.remaining === 0 ? " book__credit--out" : "")}>
                          <span>
                            เครดิต <b>{c.remaining}</b>/{c.total}
                          </span>
                          <i>
                            <i style={{ width: `${(c.remaining / c.total) * 100}%` }} />
                          </i>
                        </span>
                      ) : (
                        <span className="book__credit book__credit--none">รายครั้ง</span>
                      )}
                      <span className="book__radio" aria-hidden>
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
            )
          )}
        </section>

        <section className="book__when">
          <h3 className="book__h">2 · วันและเวลา</h3>
          {!request && !p0.slot && (
            <Segmented
              tone="light"
              label="ประเภทคิว"
              value={type}
              onChange={(t) => {
                setType(t);
                if (t === "walkin") setDate(today);
                else if (date === today && !firstOpen(today)) setDate(firstOpenDate(today));
              }}
              options={[
                { value: "booked", label: "นัดล่วงหน้า" },
                { value: "walkin", label: "Walk-in" },
              ]}
            />
          )}
          {!p0.slot && (
            <>
              <CalendarPicker
                value={date}
                onChange={setDate}
                blocked={(d) =>
                  type === "walkin" && d !== today
                    ? "Walk-in รับเฉพาะวันนี้"
                    : d < today
                      ? "วันที่ผ่านมาแล้ว"
                      : store.settings.closedWeekdays.includes(fromISODate(d).getDay())
                        ? "คลินิกปิดทำการ"
                        : null
                }
                load={(d) => dayLoad(d)}
              />
              <div className="tw-field">
                <span className="tw-field__label">รอบเวลา</span>
                <div className="book__slots">
                  {slots.map((s) => {
                    const past = isPastSlot(date, s.time);
                    return (
                      <button
                        key={s.time}
                        type="button"
                        className="tchip"
                        aria-pressed={start === s.time}
                        disabled={s.free === 0 || past}
                        title={past ? "เลยเวลาแล้ว" : s.free === 0 ? "เต็ม" : `ว่าง ${s.free} เตียง`}
                        onClick={() => setStart(s.time)}
                      >
                        {s.time}
                        <small>{past ? "ผ่านแล้ว" : s.free === 0 ? "เต็ม" : `ว่าง ${s.free}`}</small>
                      </button>
                    );
                  })}
                </div>
                {!start &&
                  (type === "walkin" ? (
                    <div className="alert alert--caution" style={{ marginTop: 4 }}>
                      <CircleAlert size={16} />
                      <div>
                        <b>วันนี้คิวเต็มทุกรอบแล้ว</b>
                        รับ Walk-in ไม่ได้ ·{" "}
                        <button
                          type="button"
                          className="book__link"
                          onClick={() => {
                            setType("booked");
                            setDate(firstOpenDate(addISODays(today, 1)));
                          }}
                        >
                          นัดล่วงหน้าแทน
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="tw-field__hint" style={{ color: "var(--color-danger)" }}>ไม่มีรอบว่างในวันนี้ — เลือกวันอื่น</span>
                  ))}
              </div>
            </>
          )}
          {p0.slot && (
            <div className="book__fixed-slot">
              <b>{thaiDateLong(date)}</b>
              <span>{timeRange(start, service.minutes)} น.</span>
            </div>
          )}
        </section>

        <section className="book__form">
          <h3 className="book__h">3 · รายละเอียด</h3>

          <Field label="บริการ">
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {store.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.minutes} นาที
                </option>
              ))}
            </Select>
          </Field>
          <div className="tw-field book__staff-field">
            <span className="tw-field__label book__staff-head">
              ผู้บำบัด
              {start && <small>{full ? "ไม่มีคนว่าง" : `ว่าง ${freeTherapists.length} คน · ${start} น.`}</small>}
            </span>
            {!start ? (
              <p className="tw-meta">เลือกวันและรอบเวลาก่อน</p>
            ) : (
              <div className="book__staff scroll-y scroll-y--light">
                {roster.map(({ t, state }) => {
                  const hours = shiftsOn(t, date);
                  const why =
                    state === "free"
                      ? `เวร ${hours.join(", ")}`
                      : state === "busy"
                        ? `ติดคิวรอบ ${start} น.`
                        : state === "service"
                          ? `ไม่รับ${service.short}`
                          : hours.length
                            ? `เข้าเวร ${hours.join(", ")}`
                            : t.exceptions?.[date]?.kind === "leave"
                              ? t.exceptions[date].reason ?? "ลา"
                              : "วันหยุด";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={"book__tp book__tp--" + state}
                      aria-pressed={t.id === therapistId}
                      disabled={state !== "free"}
                      onClick={() => setTherapistId(t.id)}
                    >
                      <Avatar name={t.name} src={therapistPhoto(t)} size="sm" color={t.color} />
                      <span className="book__name">
                        {t.name}
                        <small>{why}</small>
                      </span>
                      {state === "free" ? (
                        <span className="book__radio" aria-hidden>
                          <Check size={12} strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="book__tp-tag">{state === "busy" ? "ไม่ว่าง" : state === "service" ? "ไม่รับบริการนี้" : "ไม่เข้าเวร"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {full && (
            <div className="alert alert--stop">
              <CircleAlert size={16} />
              <div>
                <b>ไม่มีผู้บำบัดที่ว่างและรับบริการนี้</b>
                เปลี่ยนรอบเวลาหรือบริการ
              </div>
            </div>
          )}
          {patient && credits && credits.remaining === 0 && (
            <div className="alert alert--caution">
              <CircleAlert size={16} />
              <div>
                <b>เครดิตในแผนการรักษาหมดแล้ว</b>
                คิวนี้จะเป็นการรับบริการแบบชำระเงินเอง หรือให้พบแพทย์เพื่อต่อแผนก่อน
              </div>
            </div>
          )}
          {clash && (
            <div className="alert alert--caution">
              <CircleAlert size={16} />
              <div>
                <b>ผู้ป่วยมีนัดในวันนี้อยู่แล้ว</b>
                ตรวจสอบก่อนว่าไม่ได้จองซ้ำ
              </div>
            </div>
          )}
          {!patient && <p className="tw-meta">เลือกผู้รับบริการจากรายการด้านซ้าย</p>}
          {patient && start && therapist && (
            <div className="book__summary">
              <b>
                {thaiDate(date)} · {timeRange(start, service.minutes)} น.
              </b>
              <span>
                {patient.name} · {service.short} · {therapist.name}
              </span>
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}
