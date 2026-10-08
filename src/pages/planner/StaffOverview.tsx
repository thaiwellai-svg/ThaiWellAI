import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck2, ChevronLeft, ChevronRight, Footprints, HandHeart, Leaf, Sparkles, Stethoscope, UsersRound, UserRoundSearch, CalendarCog, CalendarX2, ArrowLeft } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, Button, EmptyState, IconButton, SearchField, Segmented, ease } from "../../design-system";
import { FilterMenu } from "../../features/FilterMenu";
import { WorkPage } from "../../layout/WorkPage";
import { ShiftEditor } from "../../features/ShiftEditor";
import { DayEditor, type DayTarget } from "../../features/DayEditor";
import { blocksOn } from "../../data/domain";
import { slotTimes } from "../../data/seed";
import { therapistPhoto } from "../../data/avatars";
import type { Therapist } from "../../data/types";
import { TH_WEEKDAYS, TH_WEEKDAYS_SHORT, addDays, fromISODate, startOfWeek, thaiDateLong, thaiDateShort, toISODate, toMinutes, todayISO } from "../../data/thaiDate";
import "../appointments/appointments.css";
import "./staff.css";

type View = "day" | "week";

/** Weekly working hours (the 12:00 lunch hour is not a working slot). */
function weeklyHours(t: Therapist) {
  return t.shifts.reduce((h, s) => h + hoursOf(s) * s.days.length, 0);
}
const shiftsOnDay = (t: Therapist, d: string) => blocksOn(t, d);
/** "ลาป่วย" / "ปรับเวลา" when the date has a one-off change */
const exLabel = (t: Therapist, d: string) => {
  const ex = t.exceptions?.[d];
  return ex ? (ex.kind === "leave" ? ex.reason ?? "ลา" : "ปรับเวลา") : null;
};
const short = (h: string) => h.replace(/:00/g, "");
const hoursOf = (s: { start: string; end: string }) => (toMinutes(s.end) - toMinutes(s.start) - (s.start < "12:00" && s.end > "12:00" ? 60 : 0)) / 60;

/** Work-slot planner: each therapist's hours and the services they open in each block. */
export function StaffOverview() {
  const store = useStore();
  const { settings } = store;
  const today = todayISO();
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(today);
  const [dir, setDir] = useState(0);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [dayTarget, setDayTarget] = useState<DayTarget | null>(null);
  const [person, setPerson] = useState<string | null>(null);

  const times = slotTimes(settings.openTime, settings.closeTime, settings.slotMinutes);
  const weekFrom = toISODate(startOfWeek(fromISODate(date)));
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(fromISODate(weekFrom), i)));
  const [service, setService] = useState("all");
  // search matches the therapist's name, role or any service they open
  const staff = store.therapists.filter((t) => {
    const q = query.trim().toLowerCase();
    const offers = [...new Set(t.shifts.flatMap((s) => s.services))];
    if (service !== "all" && !offers.includes(service)) return false;
    if (!q) return true;
    const hay = `${t.name} ${t.role} ${offers.map((id) => `${store.serviceById(id).name} ${store.serviceById(id).short}`).join(" ")}`;
    return hay.toLowerCase().includes(q);
  });
  const SERVICE_ICON: Record<string, typeof UsersRound> = { s1: HandHeart, s2: Stethoscope, s3: Leaf, s4: Footprints, s5: Sparkles };
  const hit = (id: string) =>
    (service !== "all" && id === service) ||
    (!!query.trim() && `${store.serviceById(id).name} ${store.serviceById(id).short}`.includes(query.trim()));
  const svc = (id: string) => store.serviceById(id).short;

  const go = (d: string, step: number) => {
    setDir(step);
    setDate(d);
  };
  const shift = (n: number) => go(toISODate(addDays(fromISODate(date), n * (view === "week" ? 7 : 1))), n);
  const title = view === "week" ? `${thaiDateShort(days[0])} – ${thaiDateShort(days[6], true)}` : thaiDateLong(date);
  const isThisRange = view === "week" ? days.includes(today) : date === today;
  const closedOn = (d: string) => settings.closedWeekdays.includes(fromISODate(d).getDay());

  /** the grid columns a shift covers in the day view (column 1 is the name) */
  const span = (s: { start: string; end: string }) => {
    const idx = times.map((t, i) => (t >= s.start && t < s.end ? i : -1)).filter((i) => i >= 0);
    return idx.length ? { from: idx[0] + 2, to: idx[idx.length - 1] + 3 } : null;
  };

  const who = (t: Therapist, sub: string) => (
    <button type="button" className="so-who" onClick={() => setPerson(t.id)} title="ดูตารางรายคน">
      <Avatar name={t.name} src={therapistPhoto(t)} size="sm" color={t.color} />
      <span className="so-who__text">
        <b>{t.name}</b>
        <small>{sub}</small>
      </span>
    </button>
  );

  return (
    <WorkPage
      eyebrow="จัดตารางงาน"
      title="จัดตารางงาน"
      bell={false}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรือบริการ" shortcut={false} />
          <FilterMenu
            label="บริการ"
            value={service}
            onChange={setService}
            options={[
              { value: "all", label: "ทุกบริการ", count: store.therapists.length, icon: UsersRound },
              ...store.services.map((x) => ({
                value: x.id,
                label: x.name,
                count: store.therapists.filter((t) => t.shifts.some((sh) => sh.services.includes(x.id))).length,
                icon: SERVICE_ICON[x.id] ?? Sparkles,
              })),
            ]}
          />
        </>
      }
    >
      <div className="appt">
        {/* rail: who offers each service */}
        <aside className="appt__rail scroll-y">
          <div className="rail-card">
            <div className="rail-card__head">
              <b>บริการที่เปิดรับ</b>
            </div>
            <div className="so-services">
              {store.services.map((s) => {
                const by = store.therapists.filter((t) => t.shifts.some((x) => x.services.includes(s.id)));
                return (
                  <div key={s.id} className="so-service">
                    <span>
                      <b>{s.name}</b>
                      <small>ผู้บำบัด {by.length} คน</small>
                    </span>
                    <span className="so-faces">
                      {by.map((t) => (
                        <Avatar key={t.id} name={t.name} src={therapistPhoto(t)} size="xs" color={t.color} />
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rail-card">
            <div className="rail-card__head">
              <b>ผู้บำบัด</b>
              {person ? (
                <button className="rail-clear" onClick={() => setPerson(null)}>
                  ดูทั้งหมด
                </button>
              ) : (
                <span className="tw-meta">{store.therapists.length} คน</span>
              )}
            </div>
            <div className="rail-people">
              {store.therapists.map((t) => {
                const workDays = new Set(t.shifts.flatMap((x) => x.days)).size;
                return (
                  <button key={t.id} type="button" className="rail-person" aria-pressed={person === t.id} onClick={() => setPerson(person === t.id ? null : t.id)}>
                    <Avatar name={t.name} src={therapistPhoto(t)} size="sm" color={t.color} />
                    <span className="rail-person__name">
                      {t.name}
                      <small>
                        {workDays} วัน · {weeklyHours(t)} ชม./สัปดาห์
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="panel appt__main">
          <div className="sheet">
            {person ? (
              <PersonView
                t={store.therapistById(person)}
                times={times}
                onBack={() => setPerson(null)}
                onEdit={() => setEditing(person)}
                onDay={(d) => setDayTarget({ therapistId: person, date: d })}
              />
            ) : (
            <>
            <div className="appt__bar">
              <div className="appt__nav">
                <IconButton label="ก่อนหน้า" variant="soft" size="sm" onClick={() => shift(-1)}>
                  <ChevronLeft size={16} />
                </IconButton>
                <IconButton label="ถัดไป" variant="soft" size="sm" onClick={() => shift(1)}>
                  <ChevronRight size={16} />
                </IconButton>
                <h2 className="appt__title">{title}</h2>
                {!isThisRange && (
                  <Button variant="outline" size="sm" leading={<CalendarCheck2 size={14} />} onClick={() => go(today, 0)}>
                    วันนี้
                  </Button>
                )}
              </div>
              <Segmented
                tone="light"
                label="มุมมอง"
                value={view}
                onChange={(v) => {
                  setDir(0);
                  setView(v);
                }}
                options={[
                  { value: "day", label: "วัน" },
                  { value: "week", label: "สัปดาห์" },
                ]}
              />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${view}-${view === "week" ? weekFrom : date}`}
                className="cal scroll-y scroll-y--light"
                initial={{ opacity: 0, x: dir * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -28 }}
                transition={{ duration: 0.3, ease: ease.out }}
              >
                {view === "day" ? (
                  /* ── Day: shift blocks laid across the time slots ── */
                  <div
                    className="so-grid so-grid--day"
                    style={{
                      gridTemplateColumns: `var(--so-name-col) repeat(${times.length}, minmax(84px, 1fr))`,
                      gridTemplateRows: `auto repeat(${staff.length}, minmax(84px, auto))`,
                    }}
                  >
                    <div className="cal-corner so-corner">ผู้บำบัด</div>
                    {times.map((s) => (
                      <div key={s} className="cal-head so-time">
                        <span className="cal-head__date">{s}</span>
                      </div>
                    ))}
                    {staff.map((t, ri) => {
                      const row = ri + 2;
                      const list = closedOn(date) ? [] : shiftsOnDay(t, date);
                      return (
                        <div key={t.id} style={{ display: "contents" }}>
                          <div className="so-who-cell" style={{ gridRow: row, gridColumn: 1 }}>
                            {who(t, list.length ? `${list.reduce((h, s) => h + hoursOf(s), 0)} ชม.${date === today ? " วันนี้" : ""}` : exLabel(t, date) ?? "หยุด")}
                          </div>
                          <button
                            type="button"
                            className={clsx("so-track", t.exceptions?.[date]?.kind === "leave" && "so-track--leave")}
                            style={{ gridRow: row, gridColumn: "2 / -1" }}
                            disabled={closedOn(date)}
                            onClick={() => setDayTarget({ therapistId: t.id, date })}
                          >
                            {!list.length && (
                              <span>
                                {closedOn(date) ? "คลินิกปิด" : exLabel(t, date) ? `${exLabel(t, date)}${t.exceptions?.[date]?.note ? ` · ${t.exceptions[date].note}` : ""}` : "หยุด"}
                              </span>
                            )}
                            {list.length > 0 && exLabel(t, date) && <em className="so-ex">{exLabel(t, date)}</em>}
                          </button>
                          {list.map((s) => {
                            const c = span(s);
                            if (!c) return null;
                            return (
                              <button
                                key={s.start}
                                type="button"
                                className="so-block"
                                style={{ gridRow: row, gridColumn: `${c.from} / ${c.to}`, ["--c" as string]: t.color }}
                                onClick={() => setDayTarget({ therapistId: t.id, date })}
                              >
                                <b>{c.to - c.from === 1 ? `${short(s.start)}–${short(s.end)}` : `${s.start}–${s.end}`}</b>
                                <span className="so-tags">
                                  {s.services.map((id) => (
                                    <i key={id} className={clsx(hit(id) && "is-hit")}>
                                      {svc(id)}
                                    </i>
                                  ))}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── Week: hours + services per day ── */
                  <div
                    className="so-grid"
                    style={{ gridTemplateColumns: `var(--so-name-col) ${days.map((d) => (closedOn(d) ? "56px" : "minmax(96px, 1fr)")).join(" ")}` }}
                  >
                    <div className="cal-corner so-corner">ผู้บำบัด</div>
                    {days.map((d) => {
                      const dt = fromISODate(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          className={clsx("cal-head", d === today && "cal-head--today", closedOn(d) && "cal-head--closed")}
                          onClick={() => {
                            go(d, 0);
                            setView("day");
                          }}
                        >
                          <span className="cal-head__dow">{TH_WEEKDAYS_SHORT[dt.getDay()]}</span>
                          <span className="cal-head__date">
                            <span>{dt.getDate()}</span>
                          </span>
                        </button>
                      );
                    })}
                    {staff.map((t) => (
                      <div key={t.id} style={{ display: "contents" }}>
                        {who(t, `${weeklyHours(t)} ชม./สัปดาห์`)}
                        {days.map((d) => {
                          const list = closedOn(d) ? [] : shiftsOnDay(t, d);
                          return (
                            <button
                              key={d}
                              type="button"
                              className={clsx("so-cell", !list.length && "so-cell--off", d === today && "so-cell--today", t.exceptions?.[d] && "so-cell--ex")}
                              disabled={closedOn(d)}
                              onClick={() => setDayTarget({ therapistId: t.id, date: d })}
                            >
                              {!list.length ? (
                                <span className={clsx("so-off", t.exceptions?.[d]?.kind === "leave" && "so-off--leave")}>{closedOn(d) ? "ปิด" : exLabel(t, d) ?? "หยุด"}</span>
                              ) : (
                                <span className="so-day">
                                  {exLabel(t, d) && <em className="so-ex">{exLabel(t, d)}</em>}
                                  {list.map((s) => (
                                    <span key={s.start} className="so-shift" style={{ ["--c" as string]: t.color }}>
                                      <b>
                                        {short(s.start)}–{short(s.end)}
                                      </b>
                                      <small>
                                        {s.services.map((id, i) => (
                                          <span key={id} className={clsx(hit(id) && "is-hit")}>
                                            {i > 0 && ", "}
                                            {svc(id)}
                                          </span>
                                        ))}
                                      </small>
                                    </span>
                                  ))}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
                {staff.length === 0 && (
                  <div className="so-empty">
                    <EmptyState icon={<UserRoundSearch size={24} />} title="ไม่พบผู้บำบัด" description="ลองคำอื่น หรือเปลี่ยนตัวกรอง" />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            </>
            )}
          </div>
        </div>
      </div>
      <ShiftEditor id={editing} onClose={() => setEditing(null)} />
      <DayEditor target={dayTarget} onClose={() => setDayTarget(null)} />
    </WorkPage>
  );
}

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

/** One therapist at a glance: weekly hours, services and a Mon–Sun timeline of their blocks. */
function PersonView({ t, times, onBack, onEdit, onDay }: { t: Therapist; times: string[]; onBack: () => void; onEdit: () => void; onDay: (d: string) => void }) {
  const store = useStore();
  const closed = store.settings.closedWeekdays;
  const offers = [...new Set(t.shifts.flatMap((s) => s.services))];
  const workDays = new Set(t.shifts.flatMap((s) => s.days)).size;
  const today = todayISO();
  const upcoming = Object.entries(t.exceptions ?? {})
    .filter(([d]) => d >= today)
    .sort(([a], [b]) => a.localeCompare(b));
  let nextOpen = today;
  while (closed.includes(fromISODate(nextOpen).getDay())) nextOpen = toISODate(addDays(fromISODate(nextOpen), 1));
  const weekBlocks = (d: number) => t.shifts.filter((s) => s.days.includes(d)).sort((a, b) => a.start.localeCompare(b.start));
  // เส้นเวลาของคลินิก: เปิดรอบแรก – ปิดหลังรอบสุดท้าย
  const dayStart = toMinutes(times[0] ?? "08:00");
  const dayEnd = toMinutes(times[times.length - 1] ?? "21:00") + 60;
  const pos = (hhmm: string) => Math.max(0, Math.min(100, ((toMinutes(hhmm) - dayStart) / (dayEnd - dayStart)) * 100));
  const ticks: string[] = [];
  for (let m = dayStart; m <= dayEnd; m += 120) ticks.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:00`);

  return (
    <motion.div className="so-person" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: ease.out }} key={t.id}>
      <div className="appt__bar">
        <div className="appt__nav">
          <IconButton label="กลับภาพรวม" variant="soft" size="sm" onClick={onBack}>
            <ArrowLeft size={16} />
          </IconButton>
          <h2 className="appt__title">ตารางรายคน</h2>
        </div>
        <Button size="md" className="so-define" leading={<CalendarCog size={16} />} onClick={onEdit}>
          แก้ตารางประจำ
        </Button>
      </div>
      <div className="so-person__body scroll-y scroll-y--light">
        {/* หัว: รูป ชื่อ ตำแหน่ง + สรุปเป็นป้าย */}
        <div className="pv-head">
          <Avatar name={t.name} src={therapistPhoto(t)} size="lg" color={t.color} />
          <div className="pv-head__who">
            <h3>{t.name}</h3>
            <p>{t.role}</p>
          </div>
          <div className="pv-head__stats">
            <span>
              <b>{workDays}</b> วัน/สัปดาห์
            </span>
            <span>
              <b>{weeklyHours(t)}</b> ชม./สัปดาห์
            </span>
            <span>
              <b>{offers.length}</b> บริการ
            </span>
          </div>
        </div>

        <section className="pv-card">
          <h4>บริการที่รับ</h4>
          <div className="pv-svcs">
            {store.services.map((s) => (
              <span key={s.id} className={clsx("pv-svc", !offers.includes(s.id) && "is-off")}>
                {s.name}
              </span>
            ))}
          </div>
        </section>

        {/* ตารางประจำสัปดาห์: แถบเวลาบนเส้นเวลาของคลินิก */}
        <section className="pv-card">
          <div className="pv-card__head">
            <h4>ตารางประจำสัปดาห์</h4>
            <button type="button" className="pv-link" onClick={onEdit}>
              แก้ไข
            </button>
          </div>
          <div className="pv-week">
            <div className="pv-axis">
              <span />
              <div className="pv-axis__ticks">
                {ticks.map((h) => (
                  <i key={h} style={{ left: `${pos(h)}%` }}>
                    {h}
                  </i>
                ))}
              </div>
            </div>
            {ORDER.map((d) => {
              const list = closed.includes(d) ? [] : weekBlocks(d);
              const isToday = fromISODate(today).getDay() === d;
              const hrs = list.reduce((n, x) => n + hoursOf(x), 0);
              const svc = [...new Set(list.flatMap((x) => x.services))];
              const partial = list.length > 0 && svc.length < offers.length;
              return (
                <div key={d} className={clsx("pv-row", isToday && "is-today")}>
                  <span className="pv-row__day">
                    {TH_WEEKDAYS[d]}
                    {isToday && <em>วันนี้</em>}
                  </span>
                  <div className={clsx("pv-track", !list.length && "is-off")}>
                    {!list.length && <span className="pv-track__off">{closed.includes(d) ? "คลินิกปิด" : "หยุด"}</span>}
                    {list.map((x) => (
                      <button key={x.start} type="button" className="pv-bar" style={{ left: `${pos(x.start)}%`, width: `calc(${pos(x.end) - pos(x.start)}% - 3px)`, ["--c" as string]: t.color }} onClick={onEdit} title={`${x.start}–${x.end}`}>
                        {x.start}–{x.end}
                      </button>
                    ))}
                  </div>
                  <span className="pv-row__sum">
                    {list.length ? `${hrs} ชม.` : "—"}
                    {partial && <small>{svc.map((id) => store.serviceById(id).short).join(" · ")}</small>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pv-card">
          <div className="pv-card__head">
            <h4>วันลา / ปรับเวลา</h4>
            <Button variant="outline" size="sm" leading={<CalendarX2 size={14} />} onClick={() => onDay(nextOpen)}>
              เพิ่ม
            </Button>
          </div>
          {upcoming.length ? (
            upcoming.map(([d, ex]) => (
              <button key={d} type="button" className="so-exrow" onClick={() => onDay(d)}>
                <span className="so-exrow__date">{thaiDateLong(d)}</span>
                <em className={clsx("so-ex", ex.kind === "leave" && "so-ex--leave")}>{ex.kind === "leave" ? ex.reason ?? "ลา" : "ปรับเวลา"}</em>
                <span className="so-exrow__what">
                  {ex.kind === "leave" ? "ไม่เปิดให้จองทั้งวัน" : ex.blocks.map((b) => `${b.start}–${b.end}`).join(", ")}
                  {ex.note && ` · ${ex.note}`}
                </span>
              </button>
            ))
          ) : (
            <p className="pv-empty">ไม่มีวันลา · ใช้ตารางประจำ</p>
          )}
        </section>
      </div>
    </motion.div>
  );
}
