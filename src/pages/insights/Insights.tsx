import { useMemo, useState } from "react";
import { FileSpreadsheet, Lightbulb, Mic, ThumbsDown, ThumbsUp, TrendingDown } from "lucide-react";
import { useStore } from "../../store/store";
import { Button, Segmented } from "../../design-system";
import { WorkPage } from "../../layout/WorkPage";
import { downloadCsv } from "../../features/ReportDialog";
import { ElementIcon } from "../../features/ElementIcon";
import { ELEMENT_INFO } from "../../data/elements";
import { ELEMENTS } from "../../data/samuthan";
import { COMPLAINT_GROUPS, MCID, findings, groupLabel, groupRows, outcomeRows, sessionCurve, summarize, type Summary } from "../../data/outcomes";
import { addISODays, todayISO } from "../../data/thaiDate";
import "./insights.css";

type Range = "7" | "14" | "all";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const f1 = (x: number) => x.toFixed(1);

/** horizontal bar of mean Δ with its 95% CI whisker, on a shared 0..max scale */
function Effect({ s, max, color = "var(--color-brand)" }: { s: Summary; max: number; color?: string }) {
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <span className="ins-eff" style={{ ["--ec" as string]: color }}>
      <i className="ins-eff__bar" style={{ width: at(s.mean) }} />
      <i className="ins-eff__ci" style={{ left: at(s.lo), width: `calc(${at(s.hi)} - ${at(s.lo)})` }} />
    </span>
  );
}

/** /insights — real-world evidence from the clinic's own records */
export default function Insights() {
  const store = useStore();
  const [range, setRange] = useState<Range>("all");
  const from = range === "all" ? undefined : addISODays(todayISO(), -Number(range));
  const rows = useMemo(() => outcomeRows(store.appointments, store.patients, from), [store.appointments, store.patients, from]);
  const all = summarize(rows);
  const bySvc = store.services.map((s) => ({ s, ...summarize(rows.filter((r) => r.a.serviceId === s.id)) })).filter((x) => x.n).sort((a, b) => b.mean - a.mean);
  const byGroup = [...COMPLAINT_GROUPS.map((g) => g.key), "other"].map((k) => ({ k, ...summarize(rows.filter((r) => r.group === k)) })).filter((x) => x.n).sort((a, b) => b.mean - a.mean);
  const cells = groupRows(rows, (r) => `${r.element}|${r.a.serviceId}`);
  const max = Math.max(4, ...bySvc.map((x) => x.hi), ...byGroup.map((x) => x.hi));
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

  // session curve chart geometry
  const W = 440;
  const H = 170;
  const cx = (i: number) => 30 + (i * (W - 50)) / Math.max(1, curve.length - 1);
  const cy = (v: number) => 14 + ((10 - v) / 10) * (H - 40);

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
      <div className="ins scroll-y scroll-y--light">
        <section className="ins-hero">
          <div className="ins-hero__lead">
            <small>ปวดเฉลี่ยก่อน → หลังนวด</small>
            <b>
              {f1(all.before)}
              <TrendingDown size={26} />
              {f1(all.after)}
            </b>
            <p>
              ลดลงเฉลี่ย <strong>{f1(all.mean)}</strong> คะแนน (95% CI {f1(all.lo)}–{f1(all.hi)}) จากการรักษา {all.n.toLocaleString("th-TH")} ครั้ง
            </p>
          </div>
          <div className="ins-kpi">
            <small>ดีขึ้นอย่างมีนัยสำคัญทางคลินิก</small>
            <b>{pct(all.improved)}</b>
            <em>ปวดลด ≥ {MCID} คะแนน</em>
          </div>
          <div className="ins-kpi">
            <small>ปวดลดลง ≥ 30%</small>
            <b>{pct(all.pct30)}</b>
            <em>เกณฑ์ที่ใช้ในงานวิจัยด้านความปวด</em>
          </div>
          <div className="ins-kpi">
            <small>
              <Mic size={12} /> บันทึกด้วยเสียง
            </small>
            <b>{voice} ครั้ง</b>
            <em>ประหยัดเวลาเขียนบันทึก ~{voice * 3} นาที</em>
          </div>
        </section>

        <div className="ins-grid">
          <section className="ins-card">
            <header>
              <Lightbulb size={15} /> ข้อค้นพบจากข้อมูลของคลินิก
            </header>
            {finds.length ? (
              <ul className="ins-finds">
                {finds.map((x, i) => (
                  <li key={i} className={`is-${x.tone}`}>
                    {x.tone === "good" ? <ThumbsUp size={15} /> : <ThumbsDown size={15} />}
                    <span>
                      {x.text}
                      <small>จาก {x.n} ครั้ง</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ins-muted">ยังไม่มีข้อค้นพบที่ชัดเจน · ต้องมีข้อมูลอย่างน้อย 6 ครั้งต่อกลุ่ม</p>
            )}
          </section>

          <section className="ins-card">
            <header>
              <TrendingDown size={15} /> ความปวดก่อนนวด ตามจำนวนครั้งที่มา
            </header>
            {curve.length > 1 ? (
              <svg className="ins-curve" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ความปวดเฉลี่ยตามจำนวนครั้ง">
                {[0, 2, 4, 6, 8, 10].map((v) => (
                  <g key={v}>
                    <line x1={24} x2={W - 10} y1={cy(v)} y2={cy(v)} />
                    <text x={16} y={cy(v) + 4}>
                      {v}
                    </text>
                  </g>
                ))}
                <path className="ins-curve__area" d={`M${cx(0)},${cy(0)} ${curve.map((p, i) => `L${cx(i)},${cy(p.mean)}`).join(" ")} L${cx(curve.length - 1)},${cy(0)} Z`} />
                <path className="ins-curve__line" d={curve.map((p, i) => `${i ? "L" : "M"}${cx(i)},${cy(p.mean)}`).join(" ")} />
                {curve.map((p, i) => (
                  <g key={p.n}>
                    <circle cx={cx(i)} cy={cy(p.mean)} r={4} />
                    <text className="ins-curve__v" x={cx(i)} y={cy(p.mean) - 9}>
                      {f1(p.mean)}
                    </text>
                    <text className="ins-curve__x" x={cx(i)} y={H - 6}>
                      ครั้งที่ {p.n}
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <p className="ins-muted">ยังมีผู้ป่วยที่มาหลายครั้งไม่พอ</p>
            )}
            {curve.length > 1 && (
              <p className="ins-muted">
                ผู้ป่วยที่มารักษาต่อเนื่อง ปวดตั้งต้นลดจาก {f1(curve[0].mean)} เหลือ {f1(curve[curve.length - 1].mean)} ภายใน {curve[curve.length - 1].n} ครั้ง
              </p>
            )}
          </section>

          <section className="ins-card">
            <header>ประสิทธิผลตามบริการ</header>
            <div className="ins-forest">
              {bySvc.map((x) => (
                <div key={x.s.id}>
                  <span>
                    <b>{x.s.name}</b>
                    <small>
                      {x.n} ครั้ง · ดีขึ้น {pct(x.improved)}
                    </small>
                  </span>
                  <Effect s={x} max={max} />
                  <b className="ins-forest__v">−{f1(x.mean)}</b>
                </div>
              ))}
            </div>
            <p className="ins-muted">แท่ง = ปวดลดลงเฉลี่ย · เส้นบาง = ช่วงความเชื่อมั่น 95%</p>
          </section>

          <section className="ins-card">
            <header>ประสิทธิผลตามอาการ</header>
            <div className="ins-forest">
              {byGroup.map((x) => (
                <div key={x.k}>
                  <span>
                    <b>{groupLabel(x.k)}</b>
                    <small>
                      {x.n} ครั้ง · ดีขึ้น {pct(x.improved)}
                    </small>
                  </span>
                  <Effect s={x} max={max} color="#3b82c4" />
                  <b className="ins-forest__v">−{f1(x.mean)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="ins-card ins-card--wide">
            <header>ธาตุเจ้าเรือน × บริการ · ปวดลดลงเฉลี่ย (คะแนน)</header>
            <div className="ins-heat" style={{ gridTemplateColumns: `120px repeat(${store.services.length}, minmax(0, 1fr))` }}>
              <span />
              {store.services.map((s) => (
                <b key={s.id} className="ins-heat__col">
                  {s.short}
                </b>
              ))}
              {ELEMENTS.map((e) => {
                const best = store.services.map((s) => summarize(cells.get(`${e}|${s.id}`) ?? [])).reduce((m, x) => (x.n >= 3 && x.mean > m ? x.mean : m), -1);
                return (
                  <div key={e} className="ins-heat__row">
                    <b className="ins-heat__el" style={{ color: ELEMENT_INFO[e].color }}>
                      <ElementIcon element={e} size={15} /> ธาตุ{e}
                    </b>
                    {store.services.map((s) => {
                      const x = summarize(cells.get(`${e}|${s.id}`) ?? []);
                      const t = x.n ? Math.max(0, Math.min(1, x.mean / 4.5)) : 0;
                      return (
                        <span key={s.id} className={`ins-heat__cell${x.n >= 3 && x.mean === best ? " is-best" : ""}${x.n < 3 ? " is-few" : ""}`} style={{ ["--h" as string]: t }}>
                          {x.n ? (
                            <>
                              <b>{f1(x.mean)}</b>
                              <small>n={x.n}</small>
                            </>
                          ) : (
                            <small>—</small>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="ins-muted">ช่องที่มีกรอบ = บริการที่ได้ผลดีที่สุดของธาตุนั้น · ใช้ประกอบการวางแผนการรักษาโดย AI · n &lt; 3 แสดงจาง</p>
          </section>
        </div>

        <p className="ins-foot">
          วิธีคำนวณ: ใช้ทุกการรักษาที่บันทึก Pain ก่อนและหลังนวด (0–10) · ความต่าง ≥ {MCID} คะแนนถือว่ามีนัยสำคัญทางคลินิก · ช่วงความเชื่อมั่น 95% = ค่าเฉลี่ย ± 1.96 × SD/√n · เป็นข้อมูลสังเกตจากการให้บริการจริง ไม่ใช่การทดลองแบบสุ่ม · ไฟล์ส่งออกไม่มีชื่อและเลขบัตรผู้ป่วย
        </p>
      </div>
    </WorkPage>
  );
}
