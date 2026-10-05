import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useStore } from "../store/store";
import { useToast } from "../design-system";
import { bedsInUse } from "../data/domain";
import { todayISO } from "../data/thaiDate";
import type { ClinicSettings } from "../data/types";
import "./rooms-editor.css";

type Room = NonNullable<ClinicSettings["rooms"]>[number];

/** rooms and their beds — name a room, add or remove beds; beds in use right now can't be removed */
export function RoomsEditor() {
  const store = useStore();
  const toast = useToast();
  const rooms = store.settings.rooms ?? [];
  const busy = bedsInUse(store.appointments, todayISO());
  const [draft, setDraft] = useState("");
  const save = (next: Room[]) => store.dispatch({ type: "updateSettings", patch: { rooms: next } });
  const allIds = new Set(rooms.flatMap((r) => r.beds.map((b) => b.id)));
  const nextBedId = (r: Room) => {
    const prefix = (r.beds[0]?.id.match(/^[A-Z]+/)?.[0] ?? String.fromCharCode(65 + rooms.indexOf(r))).toUpperCase();
    let n = r.beds.length + 1;
    while (allIds.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
  };

  return (
    <div className="re">
      {rooms.map((r, i) => (
        <div key={r.id} className="re__room">
          <div className="re__head">
            <input className="re__name" value={r.name} onChange={(e) => save(rooms.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} aria-label="ชื่อห้อง" />
            <span className="re__count">{r.beds.length} เตียง</span>
            <button
              type="button"
              className="re__icon"
              aria-label={`ลบ${r.name}`}
              title="ลบห้อง"
              onClick={() => {
                if (r.beds.some((b) => busy.has(b.id))) return toast({ message: "มีผู้ป่วยใช้เตียงในห้องนี้อยู่ ลบไม่ได้", tone: "danger" });
                save(rooms.filter((_, k) => k !== i));
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="re__beds">
            {r.beds.map((b) => (
              <span key={b.id} className={busy.has(b.id) ? "re__bed is-busy" : "re__bed"}>
                {b.id}
                <button
                  type="button"
                  aria-label={`ลบ${b.name}`}
                  onClick={() => {
                    if (busy.has(b.id)) return toast({ message: `${b.name} มีผู้ป่วยใช้อยู่ ลบไม่ได้`, tone: "danger" });
                    save(rooms.map((x, k) => (k === i ? { ...x, beds: x.beds.filter((y) => y.id !== b.id) } : x)));
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="re__add-bed"
              onClick={() => {
                const id = nextBedId(r);
                save(rooms.map((x, k) => (k === i ? { ...x, beds: [...x.beds, { id, name: `เตียง ${id}` }] } : x)));
              }}
            >
              <Plus size={12} /> เตียง
            </button>
          </div>
        </div>
      ))}
      <form
        className="re__new"
        onSubmit={(e) => {
          e.preventDefault();
          const name = draft.trim();
          if (!name) return;
          let c = 65;
          const used = new Set([...allIds].map((x) => x.match(/^[A-Z]+/)?.[0]));
          while (used.has(String.fromCharCode(c))) c++;
          const L = String.fromCharCode(c);
          save([...rooms, { id: `r${Date.now()}`, name, beds: [{ id: `${L}1`, name: `เตียง ${L}1` }] }]);
          setDraft("");
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ชื่อห้องใหม่ เช่น ห้องอบสมุนไพร" />
        <button type="submit" disabled={!draft.trim()}>
          <Plus size={14} /> เพิ่มห้อง
        </button>
      </form>
    </div>
  );
}
