import { useState } from "react";
import { FileHeart, Printer } from "lucide-react";
import { useStore } from "../store/store";
import { Button, Dialog, Field, Input, Textarea, useToast } from "../design-system";
import { runNo, type IssuedDoc } from "../data/biz";
import { thaiDateLong, thaiDateShort, todayISO, addISODays } from "../data/thaiDate";
import { PrintHead, usePrintSheet } from "./usePrintSheet";
import type { ClinicSettings, Patient } from "../data/types";
import "../pages/biz/biz.css";

export type DocKind = IssuedDoc["kind"];
const TITLE: Record<DocKind, string> = { cert: "ใบรับรองแพทย์", refer: "ใบส่งตัวผู้ป่วย" };

function DocSheet({ d, p, settings }: { d: IssuedDoc; p: Patient; settings: ClinicSettings }) {
  return (
    <div className="pps">
      <PrintHead clinic={settings.clinicName} title={TITLE[d.kind]} no={d.no} date={thaiDateLong(d.at.slice(0, 10))} />
      <section>
        <table>
          <tbody>
            <tr>
              <th>ผู้ป่วย</th>
              <td>
                {p.name} · {p.gender} {p.age} ปี · {p.hn}
                {p.citizenId ? ` · เลขบัตร ${p.citizenId}` : ""}
              </td>
            </tr>
            <tr>
              <th>การวินิจฉัย</th>
              <td>{d.diagnosis}</td>
            </tr>
            {d.kind === "cert" ? (
              <>
                <tr>
                  <th>ความเห็นแพทย์</th>
                  <td>{d.opinion || "—"}</td>
                </tr>
                {!!d.restDays && d.restFrom && (
                  <tr>
                    <th>ควรพักรักษาตัว</th>
                    <td>
                      {d.restDays} วัน ตั้งแต่ {thaiDateShort(d.restFrom, true)} ถึง {thaiDateShort(addISODays(d.restFrom, d.restDays - 1), true)}
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <>
                <tr>
                  <th>ส่งต่อไปยัง</th>
                  <td>{d.referTo}</td>
                </tr>
                <tr>
                  <th>เหตุผลการส่งต่อ</th>
                  <td>{d.reason}</td>
                </tr>
                <tr>
                  <th>การรักษาที่ให้แล้ว</th>
                  <td>{d.treatment || "—"}</td>
                </tr>
                {(p.allergies?.length ?? 0) > 0 && (
                  <tr>
                    <th>ประวัติแพ้</th>
                    <td>{p.allergies!.join(", ")}</td>
                  </tr>
                )}
                {p.conditions.length > 0 && (
                  <tr>
                    <th>โรคประจำตัว</th>
                    <td>{p.conditions.join(", ")}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </section>
      <p className="pps__muted">ข้าพเจ้าได้ตรวจร่างกายผู้ป่วยรายนี้จริง ณ วันที่ {thaiDateLong(d.at.slice(0, 10))}</p>
      <footer className="pps__sign">
        <div>
          <span />
          {d.doctor}
          {d.license ? ` · ใบอนุญาต ${d.license}` : ""}
          <br />
          แพทย์แผนไทยผู้ตรวจ
        </div>
      </footer>
    </div>
  );
}

/** Medical certificate / referral letter — fill, save (numbered), print; earlier documents can be reprinted */
export function DocDialog({ patientId, kind, onClose }: { patientId: string | null; kind: DocKind; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [print, portal] = usePrintSheet();
  const p = patientId ? store.patients.find((x) => x.id === patientId) : undefined;
  const last = p ? store.appointments.filter((a) => a.patientId === p.id && a.status === "done").sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))[0] : undefined;
  const blank = (): Partial<IssuedDoc> => ({
    doctor: store.settings.staffName,
    license: "",
    diagnosis: last?.diagnoses?.map((d) => `${d.name}${d.code ? ` (${d.code})` : ""}`).join(", ") || p?.complaint || "",
    opinion: "",
    restFrom: todayISO(),
    restDays: 0,
    referTo: "",
    reason: "",
    treatment: last?.procedures?.map((x) => x.name).join(", ") || (last ? store.serviceById(last.serviceId).name : ""),
  });
  const [f, setF] = useState<Partial<IssuedDoc> | null>(null);
  const v = f ?? blank();
  const set = (patch: Partial<IssuedDoc>) => setF({ ...v, ...patch });
  if (!p) return portal;
  const history = store.biz.docs.filter((d) => d.patientId === p.id && d.kind === kind);
  const ok = !!v.doctor?.trim() && !!v.diagnosis?.trim() && (kind === "cert" ? !!v.opinion?.trim() : !!v.referTo?.trim() && !!v.reason?.trim());
  const close = () => {
    setF(null);
    onClose();
  };
  const issue = () => {
    const n = (kind === "cert" ? store.biz.seq.cert : store.biz.seq.refer) + 1;
    const d: IssuedDoc = { ...(v as IssuedDoc), id: `doc${Date.now().toString(36)}`, no: runNo(kind === "cert" ? "MC" : "RF", n), kind, at: new Date().toISOString(), patientId: p.id, apptId: last?.id, restDays: kind === "cert" ? v.restDays || 0 : undefined };
    store.dispatch({
      type: "biz",
      cat: "เวชระเบียน",
      patientId: p.id,
      log: `ออก${TITLE[kind]} ${d.no} · ${p.name} · โดย ${d.doctor}${kind === "refer" ? ` · ส่งต่อ ${d.referTo}` : d.restDays ? ` · พัก ${d.restDays} วัน` : ""}`,
      update: (b) => ({ ...b, docs: [d, ...b.docs], seq: { ...b.seq, [kind]: n } }),
    });
    toast({ message: `ออก${TITLE[kind]} ${d.no} แล้ว` });
    print(<DocSheet d={d} p={p} settings={store.settings} />);
    close();
  };
  return (
    <>
      <Dialog
        open={!!patientId}
        onClose={close}
        title={TITLE[kind]}
        subtitle={`${p.name} · ${p.hn}`}
        className="md-dlg"
        footer={
          <>
            <Button variant="outline" size="md" onClick={close}>
              ยกเลิก
            </Button>
            <Button size="md" leading={<Printer size={16} />} disabled={!ok} onClick={issue}>
              ออกเอกสารและพิมพ์
            </Button>
          </>
        }
      >
        <div className="bz-form">
          <Field label="แพทย์แผนไทยผู้ตรวจ">
            <Input value={v.doctor} onChange={(e) => set({ doctor: e.target.value })} />
          </Field>
          <Field label="เลขที่ใบอนุญาต">
            <Input value={v.license} onChange={(e) => set({ license: e.target.value })} placeholder="เช่น พท.12345" />
          </Field>
          <Field label="การวินิจฉัย" className="span-2">
            <Textarea rows={2} value={v.diagnosis} onChange={(e) => set({ diagnosis: e.target.value })} />
          </Field>
          {kind === "cert" ? (
            <>
              <Field label="ความเห็นแพทย์" className="span-2">
                <Textarea rows={2} value={v.opinion} onChange={(e) => set({ opinion: e.target.value })} placeholder="เช่น ได้รับการรักษาด้วยการนวดไทยและประคบสมุนไพร ควรหลีกเลี่ยงการยกของหนัก" />
              </Field>
              <Field label="ควรพัก (วัน)">
                <Input inputMode="numeric" value={v.restDays || ""} placeholder="0 = ไม่ต้องพัก" onChange={(e) => set({ restDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              </Field>
              <Field label="ตั้งแต่วันที่">
                <Input type="date" value={v.restFrom} disabled={!v.restDays} onChange={(e) => set({ restFrom: e.target.value })} />
              </Field>
            </>
          ) : (
            <>
              <Field label="ส่งต่อไปยัง (โรงพยาบาล / แผนก)" className="span-2">
                <Input value={v.referTo} onChange={(e) => set({ referTo: e.target.value })} placeholder="เช่น รพ.ศิริราช แผนกออร์โธปิดิกส์" />
              </Field>
              <Field label="เหตุผลการส่งต่อ" className="span-2">
                <Textarea rows={2} value={v.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="เช่น อาการชาร้าวลงขา สงสัยหมอนรองกระดูกทับเส้นประสาท" />
              </Field>
              <Field label="การรักษาที่ให้แล้ว" className="span-2">
                <Input value={v.treatment} onChange={(e) => set({ treatment: e.target.value })} />
              </Field>
            </>
          )}
        </div>
        {history.length > 0 && (
          <div className="md-hist">
            <h4 className="bz-h">ออกไปแล้ว {history.length} ฉบับ</h4>
            {history.map((d) => (
              <button key={d.id} type="button" onClick={() => print(<DocSheet d={d} p={p} settings={store.settings} />)}>
                <FileHeart size={15} />
                <span>
                  <b>{d.no}</b>
                  <small>
                    {thaiDateShort(d.at.slice(0, 10), true)} · {d.doctor}
                    {d.kind === "refer" ? ` · ${d.referTo}` : d.restDays ? ` · พัก ${d.restDays} วัน` : ""}
                  </small>
                </span>
                <Printer size={15} />
              </button>
            ))}
          </div>
        )}
      </Dialog>
      {portal}
    </>
  );
}
