import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Workspace } from "../../features/Workspace";
import { X, AudioLines, Maximize2, Minimize2, ClipboardList, Hourglass, ListFilter, Play, ReceiptText, UserX, CircleCheck } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Avatar, EmptyState, IconButton, SearchField, spring } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { ListModeMenu } from "../../features/ListModeMenu";
import { FilterMenu } from "../../features/FilterMenu";
import { AppointmentDrawer, queueNumber, stageOf as visitStage } from "../../features/AppointmentDrawer";
import { VoiceNote } from "../../features/VoiceNote";
import { tuckDock } from "../../layout/Dock";
import { PatientDrawer, PatientHealth } from "../../features/PatientDrawer";
import { isOverdue, jobRank, stageMeta, stageOf, type Stage } from "../../data/domain";
import { patientPhoto } from "../../data/avatars";
import { thaiDate, todayISO } from "../../data/thaiDate";
import "../appointments/appointments.css";
import "./visits.css";

type F = "all" | "waiting" | "progress" | "billing" | "done";
const GROUP: Record<Stage, F> = { waiting: "waiting", called: "progress", treating: "progress", assess: "progress", billing: "billing", done: "done", absent: "done", cancelled: "done" };

/** รับบริการ — today's visits on the left, the full visit record (flow · วินิจฉัย · หัตถการ · payment) on the right. */
export default function Visits() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [f, setF] = useState<F>("all");
  const [patient, setPatient] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  // voice-summary side panel (treatment-record step)
  const [voice, setVoice] = useState(false);
  // record fills the screen (list + health box hidden) — toggled from the record's ••• toolbar
  const [solo, setSolo] = useState(false);
  // narrow list: photo + name only
  // narrow screens (iPad portrait): the list always shows photo + name so the record gets the room
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1000px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 1000px)");
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const [slimPref, setSlim] = useState(() => {
    try {
      return localStorage.getItem("thaiwell.visits.slim") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("thaiwell.visits.slim", slimPref ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [slimPref]);
  const slim = slimPref || narrow;
  const selected = params.get("id");
  const assistantOpen = (() => {
    const a = store.appointments.find((x) => x.id === selected);
    return voice && !solo && !!a && visitStage(a) === "assess";
  })();
  // the assistant gets the room: tuck the dock away (an arrow brings it back)
  useEffect(() => {
    tuckDock(assistantOpen);
  }, [assistantOpen]);
  useEffect(() => () => void tuckDock(false), []);
  // the list follows the opened visit's day (today by default)
  const today = store.appointments.find((a) => a.id === selected)?.date ?? todayISO();
  const isToday = today === todayISO();

  const todays = useMemo(() => store.appointments.filter((a) => a.date === today), [store.appointments, today]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todays
      .filter((a) => f === "all" || GROUP[stageOf(a)] === f)
      .filter((a) => {
        if (!q) return true;
        const p = store.patientById(a.patientId);
        return `${p.name} ${p.hn} ${queueNumber(store.appointments, a)}`.toLowerCase().includes(q);
      })
      .sort((a, b) => jobRank(a) - jobRank(b) || a.start.localeCompare(b.start));
  }, [todays, f, query, store]);
  const sel = store.appointments.find((a) => a.id === selected);
  const count = (g: F) => (g === "all" ? todays.length : todays.filter((a) => GROUP[stageOf(a)] === g).length);

  useEffect(() => {
    if (!selected || !list.some((a) => a.id === selected)) {
      const first = list[0]?.id;
      if (first) setParams({ id: first }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((a) => a.id).join(",")]);

  return (
    <WorkPage
      eyebrow="รับบริการ"
      title={isToday ? "รับบริการวันนี้" : `รับบริการ ${thaiDate(today)}`}
      bell={false}
      actions={
        <>
          <SearchField className="phead-search" value={query} onChange={setQuery} placeholder="ค้นหาชื่อ HN หรือเลขคิว" shortcut={false} />
          <FilterMenu
            label="สถานะ"
            value={f}
            onChange={setF}
            options={[
              { value: "all", label: "ทั้งหมด", count: count("all"), icon: ListFilter },
              { value: "waiting", label: "รอรับบริการ", count: count("waiting"), icon: Hourglass },
              { value: "progress", label: "กำลังดำเนินการ", count: count("progress"), icon: Play },
              { value: "billing", label: "รอชำระเงิน", count: count("billing"), icon: ReceiptText },
              { value: "done", label: "เสร็จแล้ว / ไม่มา", count: count("done"), icon: CircleCheck },
            ]}
          />
        </>
      }
    >
      <Workspace
        storageKey="thaiwell.visits.layout"
        className={clsx("vp", history && sel && !solo && "has-history")}
        panes={[
          ...(solo ? [] : [{ id: "list", collapsible: true, width: slim ? 96 : 300, min: slim ? 96 : undefined, fixed: true, menu: <ListModeMenu slim={slim} setSlim={setSlim} />, node: (
        <aside className={clsx("vp__side", slim && "is-slim")}>
          <div className="vp__list scroll-y">
            {list.map((a) => {
              const p = store.patientById(a.patientId);
              const st = isOverdue(a) ? { label: "เกินเวลา", tone: "danger", color: "var(--status-absent)" } : stageMeta(a);
              const sel = a.id === selected;
              return (
                <button key={a.id} type="button" className="vp__row" aria-pressed={sel} title={slim ? `${p.name} · ${st.label}` : undefined} onClick={() => setParams({ id: a.id })}>
                  {sel && <motion.span layoutId="vp-sel" className="vp__sel" transition={spring.snappy} />}
                  <Avatar name={p.name} src={patientPhoto(p)} shape="squircle" ring={st.color} pulse={stageOf(a) === "treating"} />
                  <span className="vp__who">
                    <b>{p.name}</b>
                    <small>
                      {store.serviceById(a.serviceId).short}
                      {a.bedId && stageOf(a) !== "done" ? ` · เตียง ${a.bedId}` : ""}
                    </small>
                    <span className="vp__chips">
                      <i className={clsx("vp__tag", `is-${st.tone}`)}>{st.label}</i>
                      {(a.diagnoses?.length ?? 0) > 0 && (
                        <span className="vp__dx" title="ลงวินิจฉัยแล้ว">
                          <ClipboardList size={13} />
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="vp__q">
                    <b>{a.start}</b>
                    <small>คิว {queueNumber(store.appointments, a)}</small>
                  </span>
                  {slim && (
                    <span className="vp__slim">
                      <b>{firstName(p.name)}</b>
                      <small style={{ color: st.color }}>{a.start}</small>
                    </span>
                  )}
                </button>
              );
            })}
            {list.length === 0 && <EmptyState onGlass icon={<UserX size={24} />} title="ไม่มีรายการ" description={`วันนี้ ${thaiDate(today)}`} />}
          </div>
        </aside>
          ) }]),
          { id: "record", actions: (
            <button type="button" className="ws__icon" onClick={() => setSolo((v) => !v)} aria-label={solo ? "แสดงรายการ" : "ขยายเต็มจอ"} title={solo ? "แสดงรายการ" : "ขยายเต็มจอ"}>
              {solo ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          ), node: (
        <div className="panel appt__main">
          <div className="sheet vp__pane">
            {selected ? (
              <AppointmentDrawer
                key={selected}
                inline
                id={selected}
                onClose={() => setParams({})}
                onOpenPatient={setPatient}
                onNext={(n) => setParams({ id: n })}
                onHistory={() => {
                  // opening the health box leaves full-screen mode
                  setVoice(false);
                  if (solo) {
                    setSolo(false);
                    setHistory(true);
                  } else setHistory((v) => !v);
                }}
                historyOpen={history && !solo}
                onVoice={(open) => {
                  setSolo(false);
                  setHistory(false);
                  setVoice((v) => open ?? !v);
                }}
                voiceOpen={voice && !solo}
              />
            ) : (
              <div className="vp__none">
                <EmptyState icon={<ClipboardList size={24} />} title="เลือกผู้รับบริการจากรายการ" description="บันทึกขั้นตอน วินิจฉัย หัตถการ และชำระเงินได้ที่นี่" />
              </div>
            )}
          </div>
        </div>
          ) },
          ...(voice && sel && !solo && visitStage(sel) === "assess"
            ? [{ id: "voice", width: 360, min: 300, max: 520, collapsible: true, node: (
            <div className="panel vp__hist vp__voice">
              <div className="sheet">
                <div className="vp__hist-head">
                  <div>
                    <b>
                      <AudioLines size={15} /> ผู้ช่วยบันทึกการรักษา
                    </b>
                    <small>{store.patientById(sel.patientId).name} · คุยกับ AI แล้วเติมบันทึกให้</small>
                  </div>
                  <IconButton label="ปิด" variant="soft" size="sm" onClick={() => setVoice(false)}>
                    <X size={15} />
                  </IconButton>
                </div>
                <div className="vp__hist-body vp__voice-body">
                  <VoiceNote appt={sel} bare />
                </div>
              </div>
            </div>
            ) }]
            : []),
          ...(history && sel && !solo
            ? [{ id: "health", width: 340, min: 280, max: 520, collapsible: true, node: (
            <div className="panel vp__hist">
              <div className="sheet">
                <div className="vp__hist-head">
                  <div>
                    <b>ข้อมูลสุขภาพ</b>
                    <small>{store.patientById(sel.patientId).name}</small>
                  </div>
                  <IconButton label="ปิด" variant="soft" size="sm" onClick={() => setHistory(false)}>
                    <X size={15} />
                  </IconButton>
                </div>
                <div className="vp__hist-body scroll-y scroll-y--light">
                  <PatientHealth id={sel.patientId} />
                </div>
              </div>
            </div>
            ) }]
            : []),
        ]}
      />
      <PatientDrawer id={patient} onClose={() => setPatient(null)} />
    </WorkPage>
  );
}

/** "นางสาว พิมพ์ชนก วงศ์ใหญ่" → "พิมพ์ชนก" */
const firstName = (full: string) => full.replace(/^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.)\s*/, "").split(/\s+/)[0];
