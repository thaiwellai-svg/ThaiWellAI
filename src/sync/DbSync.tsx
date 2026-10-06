import { useEffect, useRef, useState, type ReactNode } from "react";
import { COLLECTIONS, emptyLive, useStore, type Collection, type State } from "../store/store";
import { withBirthDate } from "../data/elements";
import { DEFAULT_SETTINGS } from "../data/seed";
import { cloud } from "./cloud";

/**
 * ข้อมูลระบบคลินิกทั้งหมดอยู่ในฐานข้อมูล (bo_store: collection + id + data)
 *   เข้าสู่ระบบ → โหลดทั้งหมดมาใส่ร้านค้า · แก้อะไร → บันทึกเฉพาะแถวที่เปลี่ยน · เครื่องอื่นแก้ → รับมาทันที (realtime)
 * ผู้ป่วย นัด คำขอ ผลการพิจารณา แจ้งเตือน ผู้บำบัด บริการ ประวัติการแก้ไข = แถวละรายการ
 * ตั้งค่าคลินิก / คลังสินค้า-แพ็กเกจ-ค่ามือ-ปิดยอด (biz) = แถวใน "meta"
 */
const DEVICE = `d${Math.random().toString(36).slice(2, 10)}`;
const META_KEYS = ["settings", "biz"] as const;
type Snap = Record<string, Map<string, unknown>>;

const pick = (s: State) => s;
const snapOf = (s: State): Snap => {
  const out: Snap = {};
  for (const c of COLLECTIONS) out[c] = new Map((s[c] as { id: string }[]).map((x) => [x.id, x]));
  out.meta = new Map(META_KEYS.map((k) => [k, s[k]]));
  return out;
};

async function loadAll(): Promise<Map<string, { id: string; data: unknown }[]>> {
  const out = new Map<string, { id: string; data: unknown }[]>();
  // ทีละ 1000 แถว (ขีดจำกัดต่อครั้งของ Supabase)
  for (let from = 0; ; from += 1000) {
    const { data, error } = await cloud.from("bo_store").select("collection,id,data").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const list = out.get(r.collection) ?? [];
      list.push({ id: r.id, data: r.data });
      out.set(r.collection, list);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

function fromRows(rows: Map<string, { id: string; data: unknown }[]>): State {
  const base = emptyLive();
  const s: State = { ...base };
  for (const c of COLLECTIONS) {
    const list = rows.get(c);
    if (list) (s as unknown as Record<string, unknown>)[c] = list.map((r) => r.data);
  }
  for (const m of rows.get("meta") ?? []) (s as unknown as Record<string, unknown>)[m.id] = m.data;
  // ใหม่กว่าก่อน (แสดงผลเรียงตามเดิมของแต่ละหน้า)
  s.audit = [...s.audit].sort((a, b) => b.at.localeCompare(a.at));
  s.notifications = [...s.notifications].sort((a, b) => b.at.localeCompare(a.at));
  s.settings = { ...DEFAULT_SETTINGS, ...base.settings, ...s.settings };
  s.biz = { ...base.biz, ...s.biz };
  s.patients = s.patients.map(withBirthDate);
  return s;
}

export function DbSync({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const store = useStore();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snap = useRef<Snap | null>(null);
  const timer = useRef(0);
  const latest = useRef(store);
  latest.current = store;

  // เข้าสู่ระบบแล้ว → โหลดข้อมูลทั้งหมด
  useEffect(() => {
    let alive = true;
    loadAll()
      .then((rows) => {
        if (!alive) return;
        const s = fromRows(rows);
        // ฐานข้อมูลว่าง (คลินิกใหม่) → ยังไม่มี snapshot เดิม → บันทึกค่าตั้งต้นลงฐานข้อมูลรอบแรก
        snap.current = rows.size ? snapOf(s) : { meta: new Map(), ...Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()])) };
        store.dispatch({ type: "hydrate", state: s });
        setReady(true);
      })
      .catch((e) => alive && setError(e?.message ?? String(e)));
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // แก้ในเครื่องนี้ → บันทึกเฉพาะที่เปลี่ยน (รวบทุก 0.4 วินาที)
  useEffect(() => {
    if (!ready || !snap.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const s = pick(latest.current as unknown as State);
      const prev = snap.current!;
      const now = snapOf(s);
      const upserts: { collection: string; id: string; data: unknown; updated_by: string; updated_at: string }[] = [];
      const deletes: { collection: string; id: string }[] = [];
      const at = new Date().toISOString();
      for (const c of [...COLLECTIONS, "meta"] as Collection[]) {
        const a = prev[c] ?? new Map();
        const b = now[c];
        for (const [id, v] of b) if (a.get(id) !== v) upserts.push({ collection: c, id, data: v, updated_by: DEVICE, updated_at: at });
        for (const id of a.keys()) if (!b.has(id)) deletes.push({ collection: c, id });
      }
      if (!upserts.length && !deletes.length) return;
      snap.current = now;
      void (async () => {
        for (let i = 0; i < upserts.length; i += 400) {
          const { error: e } = await cloud.from("bo_store").upsert(upserts.slice(i, i + 400));
          if (e) console.warn("bo_store upsert", e.message);
        }
        for (const c of new Set(deletes.map((d) => d.collection))) {
          const ids = deletes.filter((d) => d.collection === c).map((d) => d.id);
          for (let i = 0; i < ids.length; i += 200) await cloud.from("bo_store").delete().eq("collection", c).in("id", ids.slice(i, i + 200));
        }
      })();
    }, 400);
  }, [ready, store]);

  // เครื่องอื่นแก้ → รับมา (ไม่ส่งกลับ: snapshot ชี้ไปที่ข้อมูลชิ้นเดียวกัน)
  useEffect(() => {
    if (!ready) return;
    const ch = cloud
      .channel("bo-store")
      .on("postgres_changes", { event: "*", schema: "public", table: "bo_store" }, (ev) => {
        const row = (ev.eventType === "DELETE" ? ev.old : ev.new) as { collection: Collection; id: string; data?: unknown; updated_by?: string };
        if (!row?.collection || row.updated_by === DEVICE) return;
        const item = ev.eventType === "DELETE" ? null : row.data;
        const m = snap.current?.[row.collection];
        if (m) {
          if (item === null) m.delete(row.id);
          else m.set(row.id, item);
        }
        latest.current.dispatch({ type: "remote", collection: row.collection, id: row.id, item: row.collection === "meta" && item !== null ? { key: row.id, value: item } : item });
      })
      .subscribe();
    return () => void cloud.removeChannel(ch);
  }, [ready]);

  if (error) return <div className="dbsync-error">โหลดข้อมูลคลินิกไม่สำเร็จ · {error}</div>;
  return <>{ready ? children : fallback}</>;
}
