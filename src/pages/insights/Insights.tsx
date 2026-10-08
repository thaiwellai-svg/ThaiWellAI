import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, FileSpreadsheet, Info, Lightbulb, Mic, ThumbsDown, ThumbsUp, TrendingDown, Users } from "lucide-react";
import { clsx } from "clsx";
import { useStore } from "../../store/store";
import { Button, Segmented } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { downloadCsv } from "../../features/ReportDialog";
import { ElementIcon } from "../../features/ElementIcon";
import { ELEMENT_INFO, type Element } from "../../data/elements";
import { ELEMENTS } from "../../data/samuthan";
import { COMPLAINT_GROUPS, MCID, findings, groupLabel, groupRows, outcomeRows, sessionCurve, summarize, type Summary } from "../../data/outcomes";
import { addISODays, todayISO } from "../../data/thaiDate";
import "../appointments/appointments.css";
import "../billing/billing.css";
import "./insights.css";

type Range = "7" | "14" | "all";
type Tab = "overview" | "element" | "service" | "complaint";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => x.toFixed(1);

/** ring gauge 0..1 */
function Ring({ value, color }: { value: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className="in-ring" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r={r} />
      <circle cx="32" cy="32" r={r} style={{ stroke: color, strokeDasharray: c, strokeDashoffset: c * (1 - value) }} />
      <text x="32" y="37">
        {pct(value)}
      </text>
    </svg>
  );
}

/** before ● ── ● after on a shared 0–10 pain scale */
function Dumbbell({ s, color = "var(--color-brand)" }: { s: Pick<Summary, "before" | "after">; color?: string }) {
  const x = (v: number) => `${(v / 10) * 100}%`;
  return (
    <span className="in-db" style={{ ["--dc" as string]: color }}>
      {[0, 2.5, 5, 7.5, 10].map((t) => (
        <i key={t} className="in-db__tick" style={{ left: x(t) }} />
      ))}
      <i className="in-db__line" style={{ left: x(s.after), width: `${((s.before - s.after) / 10) * 100}%` }} />
      <i className="in-db__dot is-before" style={{ left: x(s.before) }} />
      <i className="in-db__dot is-after" style={{ left: x(s.after) }} />
    </span>
  );
}

function Rows({ items }: { items: { key: string; label: string; sub?: string; s: Summary; color?: string }[] }) {
  return (
    <div className="in-rows">
      <div className="in-rows__head">
        <span />
        <span className="in-db-scale">
          <i>0</i>
          <i>
            <u className="is-after">●</u> หลังนวด ── <u className="is-before">●</u> ก่อนนวด
          </i>
          <i>10</i>
        </span>
        <span>ลดลง</span>
        <span>ดีขึ้น</span>
      </div>
      {items.map((x, i) => (
        <div key={x.key} className={clsx("in-row", i === 0 && "is-top")}>
          <span className="in-row__name">
            <b>{x.label}</b>
            <small>{x.sub ?? `${x.s.n} ครั้ง`}</small>
          </span>
          <Dumbbell s={x.s} color={x.color} />
          <span className="in-row__d">
            <b>−{f1(x.s.mean)}</b>
            <small>
              {f1(x.s.lo)}–{f1(x.s.hi)}
            </small>
          </span>
          <span className={clsx("in-pill", x.s.improved >= 0.85 ? "is-hi" : x.s.improved < 0.65 ? "is-lo" : undefined)}>{pct(x.s.improved)}</span>
        </div>
      ))}
    </div>
  );
}

/** /insights — real-world evidence from the clinic's own records */
export default function Insights() {
  const store = useStore();
  const [range, setRange] = useState<Range>("all");
  const [tab, setTab] = useState<Tab>("overview");
  const [el, setEl] = useState<Element>("ไฟ");
  const from = range === "all" ? undefined : addISODays(todayISO(), -Number(range));
  const rows = useMemo(() => outcomeRows(store.appointments, store.patients, from), [store.appointments, store.patients, from]);
  const all = summarize(rows);
  const patients = new Set(rows.map((r) => r.p.id)).size;
  const bySvc = store.services.map((s) => ({ key: s.id, label: s.name, s: summarize(rows.filter((r) => r.a.serviceId === s.id)) })).filter((x) => x.s.n).sort((a, b) => b.s.mean - a.s.mean);
  const byGroup = [...COMPLAINT_GROUPS.map((g) => g.key), "other"].map((k) => ({ key: k, label: groupLabel(k), s: summarize(rows.filter((r) => r.group === k)) })).filter((x) => x.s.n).sort((a, b) => b.s.mean - a.s.mean);
  const cells = groupRows(rows, (r) => `${r.element}|${r.a.serviceId}`);
  const cell = (e: Element, sid: string) => summarize(cells.get(`${e}|${sid}`) ?? []);
  const byEl = ELEMENTS.map((e) => ({ e, s: summarize(rows.filter((r) => r.element === e)) }));
  const elSvc = store.services.map((s) => ({ key: s.id, label: s.name, s: cell(el, s.id) })).filter((x) => x.s.n).sort((a, b) => b.s.mean - a.s.mean);
  const elOk = elSvc.filter((x) => x.s.n >= 3);
  const finds = findings(rows, store.services);
  const curve = sessionCurve(rows);
  const voice = store.appointments.filter((a) => a.log?.some((l) => l.label.startsWith("บันทึกด้วยเสียง"))).length;

  const exportCsv = () => {
    // de-identified: patients become P001, P002 … (no name / HN / ID number)
    const code = new Map<string, string>();
    for (const r of rows) if (!code.has(r.p.id)) code.set(r.p.id, `P${String(code.size + 1).padStart(3, "0")}`);
    downloadCsv(`thaiwell-outcomes-${todayISO()}.csv`, [
      ["visit_id", "date", "patient_code", "sex", "age", "element", "complaint_group", "service", "therapist_id", "pain_before", "pain_after", "delta", "diagnosis", "procedures"],
      ...rows.map((r) => [r.a.id, r.a.date, code.get(r.p.id)!, r.p.gender === "ชาย" ? "M" : "F", r.p.age, r.element, groupLabel(r.group), store.serviceById(r.a.serviceId).name, r.a.therapistId, r.before, r.after, r.delta, r.a.diagnoses?.[0]?.name ?? "", (r.a.procedures ?? []).map((x) => x.name).join("; ")]),
    ]);
  };

  // session chart geometry
  const W = 720;
  const H = 230;
  const cx = (i: number) => 40 + (i * (W - 70)) / Math.max(1, curve.length - 1);
  const cy = (v: number) => 16 + ((10 - v) / 10) * (H - 50);

  return (
    <WorkPage
      eyebrow="ข้อมูลเชิงลึก"
      title="ผลการรักษา"
      bell={false}
      actions={
        <>
          <Segmented
            label="ช่วงเวลา"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 วัน" },
              { value: "14", label: "14 วัน" },
              { value: "all", label: "ทั้งหมด" },
            ]}
          />
          <Button variant="white" size="md" leading={<FileSpreadsheet size={16} />} onClick={exportCsv}>
            ส่งออกข้อมูลวิจัย
          </Button>
        </>
      }
    >
      <div className="appt">
        <aside className="appt__rail scroll-y in-rail">
          <section className="bl2-card in-hero">
            <header>
              <b>ปวดเฉลี่ย</b>
            </header>
            <div className="in-hero__nums">
              <span>
                <small>ก่อนนวด</small>
                <b>{f1(all.before)}</b>
              </span>
              <ArrowRight size={22} />
              <span className="is-after">
                <small>หลังนวด</small>
                <b>{f1(all.after)}</b>
              </span>
            </div>
            <Dumbbell s={all} />
            <p>
              ลดลงเฉลี่ย <b>{f1(all.mean)}</b> คะแนน
              <br />
              <small>
                95% CI {f1(all.lo)}–{f1(all.hi)}
              </small>
            </p>
            <div className="in-hero__n">
              <span>
                <TrendingDown size={14} /> {all.n.toLocaleString("th-TH")} ครั้ง
              </span>
              <span>
                <Users size={14} /> {patients} คน
              </span>
            </div>
          </section>

          <section className="bl2-card">
            <header>
              <b>สัดส่วนที่ดีขึ้น</b>
            </header>
            <div className="in-rings">
              <div>
                <Ring value={all.improved} color="#2f8a52" />
                <small>ปวดลด ≥ {MCID} คะแนน</small>
              </div>
              <div>
                <Ring value={all.pct30} color="#3b82c4" />
                <small>ปวดลด ≥ 30%</small>
              </div>
            </div>
          </section>

          <section className="bl2-card in-voice">
            <span>
              <Mic size={18} />
            </span>
            <div>
              <b>{voice} ครั้ง</b>
              <small>บันทึกด้วยเสียง{voice ? ` (ประหยัด ~${voice * 3} นาที)` : ""}</small>
            </div>
          </section>

          <section className="bl2-card in-method">
            <header>
              <b>
                <Info size={14} /> วิธีคำนวณ
              </b>
            </header>
            <p>จากทุกนัดที่บันทึกปวดก่อน/หลังนวด (0–10)<br />“ดีขึ้น” = ปวดลด ≥ {MCID} คะแนน<br />95% CI = ค่าเฉลี่ย ± 1.96·SD/√n<br />ข้อมูลจากการบริการจริง ไม่ใช่การทดลองแบบสุ่ม</p>
          </section>
        </aside>

        <div className="panel appt__main">
          <div className="sheet">
            <div className="appt__bar">
              <Segmented
                tone="light"
                label="มุมมอง"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "overview", label: "ภาพรวม" },
                  { value: "element", label: "ตามธาตุ" },
                  { value: "service", label: "ตามบริการ" },
                  { value: "complaint", label: "ตามอาการ" },
                ]}
              />
            </div>
            <div className="in-body scroll-y scroll-y--light">
              {tab === "overview" && (
                <>
                  <h3 className="in-h">
                    <Lightbulb size={16} /> ข้อค้นพบ
                  </h3>
                  {finds.length ? (
                    <div className="in-finds">
                      {finds.map((x, i) => {
                        const c = ELEMENT_INFO[x.element];
                        return (
                          <button key={i} type="button" className={`in-find is-${x.tone}`} onClick={() => (setEl(x.element), setTab("element"))}>
                            <span className="in-find__tag" style={{ ["--c" as string]: c.color, ["--t" as string]: c.tint }}>
                              <ElementIcon element={x.element} size={13} /> ธาตุ{x.element}
                            </span>
                            <b className="in-find__svc">{store.serviceById(x.serviceId).name}</b>
                            <span className="in-find__num">
                              <b>−{f1(x.mean)}</b>
                              <em>
                                {x.tone === "good" ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />} {x.diff > 0 ? "+" : "−"}
                                {f1(Math.abs(x.diff))} จากเฉลี่ย
                              </em>
                            </span>
                            <small>
                              {x.tone === "good" ? "ได้ผลดีกว่าเฉลี่ย" : "ได้ผลน้อย ลองบริการอื่น"} · {x.n} ครั้ง
                              <ChevronRight size={13} />
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="in-muted">ยังไม่มีข้อค้นพบ (ต้องมีอย่างน้อย 6 ครั้งต่อกลุ่ม)</p>
                  )}

                  <h3 className="in-h">
                    <TrendingDown size={16} /> ปวดตามครั้งที่มา
                  </h3>
                  {curve.length > 1 ? (
                    <div className="in-chart">
                      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ความปวดเฉลี่ยตามจำนวนครั้ง">
                        {[0, 2, 4, 6, 8, 10].map((v) => (
                          <g key={v}>
                            <line x1={30} x2={W - 16} y1={cy(v)} y2={cy(v)} />
                            <text className="in-chart__y" x={18} y={cy(v) + 4}>
                              {v}
                            </text>
                          </g>
                        ))}
                        <path className="in-chart__gap" d={`M${curve.map((p, i) => `${cx(i)},${cy(p.mean)}`).join(" L")} L${[...curve].reverse().map((p) => `${cx(curve.indexOf(p))},${cy(p.after)}`).join(" L")} Z`} />
                        <path className="in-chart__before" d={curve.map((p, i) => `${i ? "L" : "M"}${cx(i)},${cy(p.mean)}`).join(" ")} />
                        <path className="in-chart__after" d={curve.map((p, i) => `${i ? "L" : "M"}${cx(i)},${cy(p.after)}`).join(" ")} />
                        {curve.map((p, i) => (
                          <g key={p.n}>
                            <circle className="is-before" cx={cx(i)} cy={cy(p.mean)} r={4.5} />
                            <circle className="is-after" cx={cx(i)} cy={cy(p.after)} r={4.5} />
                            <text className="in-chart__v" x={cx(i)} y={cy(p.mean) - 10}>
                              {f1(p.mean)}
                            </text>
                            <text className="in-chart__v is-after" x={cx(i)} y={cy(p.after) + 18}>
                              {f1(p.after)}
                            </text>
                            <text className="in-chart__x" x={cx(i)} y={H - 8}>
                              ครั้งที่ {p.n}
                            </text>
                          </g>
                        ))}
                      </svg>
                      <div className="in-chart__legend">
                        <span>
                          <i className="is-before" /> ปวดก่อนนวด
                        </span>
                        <span>
                          <i className="is-after" /> ปวดหลังนวด
                        </span>
                        <em>
                          ปวดก่อนนวดลดจาก {f1(curve[0].mean)} เหลือ {f1(curve[curve.length - 1].mean)} ใน {curve[curve.length - 1].n} ครั้ง
                        </em>
                      </div>
                    </div>
                  ) : (
                    <p className="in-muted">ยังมีผู้ป่วยที่มาหลายครั้งไม่พอ</p>
                  )}
                </>
              )}

              {tab === "element" && (
                <>
                  <div className="in-els">
                    {byEl.map(({ e, s }) => {
                      const c = ELEMENT_INFO[e];
                      return (
                        <button key={e} type="button" aria-pressed={e === el} onClick={() => setEl(e)} style={{ ["--c" as string]: c.color, ["--t" as string]: c.tint }}>
                          <span>
                            <ElementIcon element={e} size={18} strokeWidth={2} />
                          </span>
                          <b>ธาตุ{e}</b>
                          <small>
                            ลดเฉลี่ย {f1(s.mean)} · {s.n} ครั้ง
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  {elOk.length > 1 && (
                    <div className="in-reco" style={{ ["--c" as string]: ELEMENT_INFO[el].color, ["--t" as string]: ELEMENT_INFO[el].tint }}>
                      <div>
                        <small>แนะนำสำหรับธาตุ{el}</small>
                        <b>{elOk[0].label}</b>
                        <em>ปวดลดเฉลี่ย {f1(elOk[0].s.mean)} คะแนน</em>
                      </div>
                      <div className="is-avoid">
                        <small>ได้ผลน้อยที่สุด</small>
                        <b>{elOk[elOk.length - 1].label}</b>
                        <em>ปวดลดเฉลี่ย {f1(elOk[elOk.length - 1].s.mean)} คะแนน</em>
                      </div>
                    </div>
                  )}
                  <Rows items={elSvc.map((x) => ({ ...x, sub: `${x.s.n} ครั้ง${x.s.n < 3 ? " · ข้อมูลน้อย" : ""}` }))} />

                  <h3 className="in-h">ปวดลดเฉลี่ย: ธาตุ × บริการ</h3>
                  <div className="in-heat" style={{ gridTemplateColumns: `92px repeat(${store.services.length}, minmax(0, 1fr))` }}>
                    <span />
                    {store.services.map((s) => (
                      <b key={s.id} className="in-heat__col">
                        {s.short}
                      </b>
                    ))}
                    {ELEMENTS.map((e) => {
                      const best = Math.max(...store.services.map((s) => cell(e, s.id)).filter((x) => x.n >= 3).map((x) => x.mean));
                      return (
                        <div key={e} className={clsx("in-heat__row", e === el && "is-sel")} onClick={() => setEl(e)}>
                          <b className="in-heat__el" style={{ color: ELEMENT_INFO[e].color }}>
                            <ElementIcon element={e} size={14} /> {e}
                          </b>
                          {store.services.map((s) => {
                            const x = cell(e, s.id);
                            return (
                              <span key={s.id} className={clsx("in-heat__cell", x.n >= 3 && x.mean === best && "is-best", x.n < 3 && "is-few")} style={{ ["--h" as string]: x.n ? Math.max(0, Math.min(1, x.mean / 4.5)) : 0 }}>
                                {x.n ? f1(x.mean) : "—"}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {tab === "service" && (
                <>
                  <h3 className="in-h">ผลตามบริการ</h3>
                  <Rows items={bySvc} />
                </>
              )}
              {tab === "complaint" && (
                <>
                  <h3 className="in-h">ผลตามอาการ</h3>
                  <Rows items={byGroup} />
                </>
              )}
              {(tab === "service" || tab === "complaint") && <p className="in-muted">ตัวเลขเล็ก = ช่วงเชื่อมั่น 95% · “ดีขึ้น” = ปวดลด ≥ {MCID} คะแนน</p>}
            </div>
          </div>
        </div>
      </div>
    </WorkPage>
  );
}
