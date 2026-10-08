import { useState } from "react";
import { PackagePlus, Plus, SlidersHorizontal, Boxes } from "lucide-react";
import { useStore } from "../../store/store";
import { Button, Dialog, Field, Input, Select, useToast } from "../../design-system";
import { baht, thaiDateShort } from "../../data/thaiDate";
import type { StockItem } from "../../data/biz";
import { BizPage, Stat, Tabs } from "./BizPage";

type Tab = "stock" | "usage" | "moves";
const clock = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const level = (it: StockItem) => (it.stock <= 0 ? "bad" : it.stock <= it.min ? "warn" : "ok");

/** /inventory — stock of treatment supplies, usage per service (auto-deducted after each treatment), movements */
export default function Inventory() {
  const store = useStore();
  const toast = useToast();
  const { items, moves, usage } = store.biz;
  const [tab, setTab] = useState<Tab>("stock");
  const [move, setMove] = useState<{ itemId: string; kind: "receive" | "adjust" } | null>(null);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", unit: "ชิ้น", stock: "", min: "", cost: "" });
  const low = items.filter((i) => level(i) !== "ok");
  const value = items.reduce((n, i) => n + Math.max(0, i.stock) * i.cost, 0);
  const monthUse = moves.filter((m) => m.kind === "use" && m.at.slice(0, 7) === new Date().toISOString().slice(0, 7));

  const saveMove = () => {
    if (!move) return;
    const it = items.find((i) => i.id === move.itemId)!;
    const n = Number(qty);
    if (!n && move.kind === "receive") return;
    const delta = move.kind === "receive" ? n : n - it.stock;
    store.dispatch({
      type: "biz",
      cat: "คลังสินค้า",
      log: move.kind === "receive" ? `รับเข้า ${it.name} ${n} ${it.unit}` : `ปรับยอด ${it.name} ${it.stock} → ${n} ${it.unit}`,
      update: (b) => ({
        ...b,
        items: b.items.map((i) => (i.id === it.id ? { ...i, stock: i.stock + delta } : i)),
        moves: [{ id: `m${Date.now().toString(36)}`, at: new Date().toISOString(), itemId: it.id, qty: delta, kind: move.kind, note: note.trim() || undefined, by: store.settings.staffName }, ...b.moves],
      }),
    });
    toast({ message: move.kind === "receive" ? `รับ ${it.name} เข้าคลัง ${n} ${it.unit}` : `ปรับยอด ${it.name} เป็น ${n} ${it.unit}` });
    setMove(null);
    setQty("");
    setNote("");
  };
  const addItem = () => {
    const it: StockItem = { id: `i${Date.now().toString(36)}`, name: draft.name.trim(), unit: draft.unit.trim() || "ชิ้น", stock: Number(draft.stock) || 0, min: Number(draft.min) || 0, cost: Number(draft.cost) || 0 };
    store.dispatch({ type: "biz", cat: "คลังสินค้า", log: `เพิ่มสินค้า ${it.name}`, update: (b) => ({ ...b, items: [...b.items, it] }) });
    setAdding(false);
    setDraft({ name: "", unit: "ชิ้น", stock: "", min: "", cost: "" });
  };
  const setUse = (sid: string, itemId: string, q: number) =>
    store.dispatch({
      type: "biz",
      cat: "คลังสินค้า",
      log: `ตั้งการใช้ ${items.find((i) => i.id === itemId)?.name} ต่อ ${store.serviceById(sid).name} = ${q}`,
      update: (b) => {
        const list = (b.usage[sid] ?? []).filter((u) => u.itemId !== itemId);
        return { ...b, usage: { ...b.usage, [sid]: q > 0 ? [...list, { itemId, qty: q }] : list } };
      },
    });

  return (
    <BizPage
      eyebrow="การเงิน"
      title="คลังสินค้า"
      bar={
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "stock", label: "สต็อก", count: low.length || undefined },
              { value: "usage", label: "ใช้ต่อบริการ" },
              { value: "moves", label: "เข้า–ออก" },
            ]}
          />
          <div className="adp__actions">
            <Button variant="outline" size="md" leading={<Plus size={16} />} onClick={() => setAdding(true)}>
              เพิ่มสินค้า
            </Button>
            <Button size="md" leading={<PackagePlus size={16} />} onClick={() => setMove({ itemId: items[0]?.id, kind: "receive" })}>
              รับเข้า
            </Button>
          </div>
        </>
      }
    >
      <div className="bz-stats">
        <Stat label="สินค้า" value={`${items.length} รายการ`} />
        <Stat label="ใกล้หมด / หมด" value={`${low.length} รายการ`} sub={low.map((i) => i.name).join(", ") || "พอทุกรายการ"} tone={low.length ? "#c47a12" : undefined} />
        <Stat label="มูลค่าคงคลัง" value={`${baht(value)} ฿`} sub="ตามราคาทุน" />
        <Stat label="ใช้ไปเดือนนี้" value={`${monthUse.length} ครั้ง`} sub="ตัดอัตโนมัติหลังบันทึกการรักษา" />
      </div>

      {tab === "stock" && (
        <div className="bz-list">
          {items.map((it) => {
            const lv = level(it);
            const pct = Math.min(100, (Math.max(0, it.stock) / Math.max(1, it.min * 3)) * 100);
            return (
              <div key={it.id} className="bz-row">
                <div className="bz-row__main">
                  <b>{it.name}</b>
                  <small>
                    ขั้นต่ำ {it.min} {it.unit} · ทุน {it.cost} ฿/{it.unit}
                  </small>
                </div>
                <span className="bz-bar" style={{ ["--bc" as string]: lv === "ok" ? "#4c845a" : lv === "warn" ? "#e0a32a" : "#d23a2a" }}>
                  <i style={{ width: `${pct}%` }} />
                </span>
                <span className={`bz-chip ${lv === "ok" ? "" : lv === "warn" ? "is-warn" : "is-bad"}`}>{lv === "ok" ? "พอ" : lv === "warn" ? "ใกล้หมด" : "หมด"}</span>
                <span className="bz-row__num">
                  {it.stock.toLocaleString()}
                  <small>{it.unit}</small>
                </span>
                <Button variant="outline" size="md" leading={<PackagePlus size={15} />} onClick={() => setMove({ itemId: it.id, kind: "receive" })}>
                  รับเข้า
                </Button>
                <Button variant="ghost" size="md" leading={<SlidersHorizontal size={15} />} onClick={() => (setMove({ itemId: it.id, kind: "adjust" }), setQty(String(it.stock)))}>
                  ปรับยอด
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {tab === "usage" && (
        <>
          <p className="adp__muted">จำนวนที่ใช้ต่อ 1 ครั้ง · ตัดสต็อกเมื่อบันทึกการรักษา</p>
          <table className="bz-table">
            <thead>
              <tr>
                <th>บริการ</th>
                {items.map((i) => (
                  <th key={i.id} className="num">
                    {i.name}
                    <br />({i.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {store.services.map((sv) => (
                <tr key={sv.id}>
                  <td>{sv.name}</td>
                  {items.map((i) => {
                    const q = usage[sv.id]?.find((u) => u.itemId === i.id)?.qty ?? 0;
                    return (
                      <td key={i.id} className="num">
                        <Input className="bz-mini" inputMode="numeric" defaultValue={q || ""} placeholder="0" aria-label={`${sv.name} ${i.name}`} onBlur={(e) => Number(e.target.value || 0) !== q && setUse(sv.id, i.id, Number(e.target.value || 0))} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === "moves" && (
        <div className="bz-list">
          {moves.length ? (
            moves.slice(0, 200).map((m) => {
              const it = items.find((i) => i.id === m.itemId);
              return (
                <div key={m.id} className="bz-row">
                  <span className={`bz-chip ${m.kind === "receive" ? "" : m.kind === "use" ? "is-info" : "is-muted"}`}>{m.kind === "receive" ? "รับเข้า" : m.kind === "use" ? "ใช้" : "ปรับยอด"}</span>
                  <div className="bz-row__main">
                    <b>{it?.name ?? "—"}</b>
                    <small>
                      {thaiDateShort(m.at.slice(0, 10))} {clock(m.at)} น. · {m.by}
                      {m.note ? ` · ${m.note}` : ""}
                    </small>
                  </div>
                  <span className="bz-row__num" style={{ color: m.qty >= 0 ? "#2f8a52" : "#c0392b" }}>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty.toLocaleString()}
                    <small>{it?.unit}</small>
                  </span>
                </div>
              );
            })
          ) : (
            <p className="bz-empty">
              <Boxes size={20} />
              <br />
              ยังไม่มีรายการเข้า–ออก
            </p>
          )}
        </div>
      )}

      <Dialog
        open={!!move}
        onClose={() => setMove(null)}
        title={move?.kind === "receive" ? "รับสินค้าเข้า" : "ปรับยอด"}
        subtitle={move?.kind === "adjust" ? "ใส่จำนวนที่นับได้จริง" : undefined}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setMove(null)}>
              ยกเลิก
            </Button>
            <Button size="md" disabled={qty === ""} onClick={saveMove}>
              บันทึก
            </Button>
          </>
        }
      >
        {move && (
          <div className="bz-form">
            <Field label="สินค้า" className="span-2">
              <Select value={move.itemId} onChange={(e) => setMove({ ...move, itemId: e.target.value })}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (คงเหลือ {i.stock} {i.unit})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={move.kind === "receive" ? "จำนวนรับเข้า" : "จำนวนที่นับได้"}>
              <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label="หมายเหตุ">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={move.kind === "receive" ? "เช่น ใบส่งของ / ผู้ขาย" : "เช่น นับสต็อกสิ้นเดือน"} />
            </Field>
          </div>
        )}
      </Dialog>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="เพิ่มสินค้า"
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setAdding(false)}>
              ยกเลิก
            </Button>
            <Button size="md" disabled={!draft.name.trim()} onClick={addItem}>
              เพิ่ม
            </Button>
          </>
        }
      >
        <div className="bz-form">
          <Field label="ชื่อสินค้า" className="span-2">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น น้ำมันเหลือง" />
          </Field>
          <Field label="หน่วย">
            <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
          </Field>
          <Field label="จำนวนเริ่มต้น">
            <Input inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
          </Field>
          <Field label="แจ้งเตือนเมื่อเหลือ">
            <Input inputMode="numeric" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} />
          </Field>
          <Field label="ทุนต่อหน่วย (บาท)">
            <Input inputMode="decimal" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </BizPage>
  );
}
