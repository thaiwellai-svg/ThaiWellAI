import { useEffect, useRef, useState, type ReactNode } from "react";
import { emptyLive, useStore, type State } from "../store/store";
import type { Biz } from "../data/biz";
import { withBirthDate } from "../data/elements";
import { DEFAULT_SETTINGS } from "../data/seed";
import { cloud } from "./cloud";

/**
 * ข้อมูลระบบคลินิกทั้งหมดอยู่ในฐานข้อมูล — ตารางแยกตามประเภท (supabase/clinic-tables.sql)
 *   เข้าสู่ระบบ → โหลดทุกตารางมาใส่ร้านค้า · แก้อะไร → บันทึกเฉพาะแถวที่เปลี่ยน · เครื่องอื่นแก้ → รับมาทันที (realtime)
 * แต่ละแถว: id + data (ข้อมูลครบ) · คอลัมน์อ่านง่าย (ชื่อ วันที่ สถานะ ยอดเงิน) ฐานข้อมูลดึงจาก data เอง
 */
const DEVICE = `d${Math.random().toString(36).slice(2, 10)}`;

type Item = { id: string };
/** ตาราง ↔ รายการในร้านค้า */
const LISTS: { table: string; get: (s: State) => Item[]; set: (s: State, v: Item[]) => State }[] = [
  ...(["patients", "appointments", "requests", "decisions", "notifications", "therapists", "services", "audit"] as const).map((k) => ({
    table: `clinic_${k}`,
    get: (s: State) => s[k] as unknown as Item[],
    set: (s: State, v: Item[]) => ({ ...s, [k]: v }),
  })),
  ...(
    [
      ["items", "clinic_stock_items"],
      ["moves", "clinic_stock_moves"],
      ["packages", "clinic_packages"],
      ["sales", "clinic_package_sales"],
      ["closings", "clinic_day_closings"],
      ["waitlist", "clinic_waitlist"],
      ["docs", "clinic_documents"],
    ] as const
  ).map(([k, table]) => ({
    table,
    get: (s: State) => s.biz[k] as unknown as Item[],
    set: (s: State, v: Item[]) => ({ ...s, biz: { ...s.biz, [k]: v } as Biz }),
  })),
];
/** แถวเดี่ยวใน clinic_config */
const CONFIG: { id: string; get: (s: State) => unknown; set: (s: State, v: unknown) => State }[] = [
  { id: "settings", get: (s) => s.settings, set: (s, v) => ({ ...s, settings: { ...DEFAULT_SETTINGS, ...(v as State["settings"]) } }) },
  ...(["usage", "rates", "memberDiscount", "seq"] as const).map((k) => ({
    id: `biz_${k}`,
    get: (s: State) => s.biz[k],
    set: (s: State, v: unknown) => ({ ...s, biz: { ...s.biz, [k]: v } as Biz }),
  })),
];

type Snap = Record<string, Map<string, unknown>>;
const snapOf = (s: State): Snap => {
  const out: Snap = {};
  for (const l of LISTS) out[l.table] = new Map(l.get(s).map((x) => [x.id, x]));
  out.clinic_config = new Map(CONFIG.map((c) => [c.id, c.get(s)]));
  return out;
};

async function loadTable(table: string) {
  const rows: { id: string; data: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await cloud.from(table).select("id,data").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as { id: string; data: unknown }[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function loadAll(): Promise<{ state: State; empty: boolean }> {
  let s = emptyLive();
  let total = 0;
  const lists = await Promise.all(LISTS.map((l) => loadTable(l.table)));
  LISTS.forEach((l, i) => {
    total += lists[i].length;
    // คลินิกใหม่: ยังไม่มีบริการในตาราง → ใช้บริการตั้งต้น (จะถูกบันทึกลงตารางรอบแรก)
    if (lists[i].length || l.table !== "clinic_services") s = l.set(s, lists[i].map((r) => r.data as Item));
  });
  const config = await loadTable("clinic_config");
  total += config.length;
  for (const r of config) {
    const c = CONFIG.find((x) => x.id === r.id);
    if (c) s = c.set(s, r.data);
  }
  s = {
    ...s,
    audit: [...s.audit].sort((a, b) => b.at.localeCompare(a.at)),
    notifications: [...s.notifications].sort((a, b) => b.at.localeCompare(a.at)),
    patients: s.patients.map(withBirthDate),
  };
  return { state: s, empty: total === 0 };
}

export function DbSync({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const store = useStore();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snap = useRef<Snap | null>(null);
  const timer = useRef(0);
  const latest = useRef(store);
  latest.current = store;
  /** ข้อมูลจากฐานข้อมูล (เครื่องอื่นแก้/ลบ) → ร้านค้าในเครื่องนี้ (ไม่ส่งกลับ: snapshot ชี้ไปที่ข้อมูลชิ้นเดียวกับในร้านค้า) */
  const applyRemote = useRef((table: string, id: string, item: unknown) => {
    const m = snap.current?.[table];
    if (m) {
      if (item === null) m.delete(id);
      else m.set(id, item);
    }
    const list = LISTS.find((l) => l.table === table);
    const conf = CONFIG.find((c) => c.id === id);
    latest.current.dispatch({
      type: "remote",
      update: (s) => {
        if (table === "clinic_config") return conf && item !== null ? conf.set(s, item) : s;
        if (!list) return s;
        const cur = list.get(s);
        if (item === null) return list.set(s, cur.filter((x) => x.id !== id));
        const i = cur.findIndex((x) => x.id === id);
        return list.set(s, i >= 0 ? cur.map((x) => (x.id === id ? (item as Item) : x)) : [item as Item, ...cur]);
      },
    });
  });

  // เข้าสู่ระบบแล้ว → โหลดข้อมูลทั้งหมด
  useEffect(() => {
    let alive = true;
    loadAll()
      .then(({ state, empty }) => {
        if (!alive) return;
        // ฐานข้อมูลว่าง (คลินิกใหม่) → snapshot ว่าง → ค่าตั้งต้น (บริการ ตั้งค่า) ถูกบันทึกลงตารางรอบแรก
        snap.current = empty ? Object.fromEntries([...LISTS.map((l) => [l.table, new Map()]), ["clinic_config", new Map()]]) : snapOf(state);
        store.dispatch({ type: "hydrate", state });
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
      const prev = snap.current!;
      const now = snapOf(latest.current as unknown as State);
      const at = new Date().toISOString();
      const jobs: Promise<unknown>[] = [];
      for (const table of Object.keys(now)) {
        const a = prev[table] ?? new Map();
        const b = now[table];
        const changed = [...b].filter(([id, v]) => a.get(id) !== v).map(([id, v]) => ({ id, data: v, updated_by: DEVICE, updated_at: at }));
        // แถวใหม่ของเครื่องนี้ → upsert · แถวที่มีอยู่แล้ว → update เท่านั้น
        //   (เครื่องอื่นลบไปแล้ว = ไม่มีแถวให้แก้ → ลบในเครื่องนี้ตาม แทนที่จะสร้างกลับขึ้นมาใหม่)
        const up = changed.filter((r) => !a.has(r.id) || table === "clinic_config");
        const edit = changed.filter((r) => a.has(r.id) && table !== "clinic_config");
        const del = [...a.keys()].filter((id) => !b.has(id));
        for (let i = 0; i < up.length; i += 400)
          jobs.push(
            Promise.resolve(cloud.from(table).upsert(up.slice(i, i + 400))).then(({ error: e }) => e && console.warn(table, e.message)),
          );
        for (const r of edit)
          jobs.push(
            Promise.resolve(cloud.from(table).update({ data: r.data, updated_by: r.updated_by, updated_at: r.updated_at }).eq("id", r.id).select("id")).then(({ data, error: e }) => {
              if (e) return console.warn(table, e.message);
              if (!data?.length) applyRemote.current(table, r.id, null);
            }),
          );
        for (let i = 0; i < del.length; i += 200) jobs.push(Promise.resolve(cloud.from(table).delete().in("id", del.slice(i, i + 200))));
      }
      snap.current = now;
      void Promise.all(jobs);
    }, 400);
  }, [ready, store]);

  // เครื่องอื่นแก้ → รับมา (ไม่ส่งกลับ: snapshot ชี้ไปที่ข้อมูลชิ้นเดียวกับในร้านค้า)
  useEffect(() => {
    if (!ready) return;
    let ch = cloud.channel("clinic-tables");
    for (const table of [...LISTS.map((l) => l.table), "clinic_config"]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, (ev) => {
        const row = (ev.eventType === "DELETE" ? ev.old : ev.new) as { id: string; data?: unknown; updated_by?: string };
        if (!row?.id || row.updated_by === DEVICE) return;
        applyRemote.current(table, row.id, ev.eventType === "DELETE" ? null : (row.data ?? null));
      });
    }
    ch.subscribe();
    return () => void cloud.removeChannel(ch);
  }, [ready]);

  // ตรวจทานกับฐานข้อมูลเป็นระยะ (ทุก 60 วินาที · กลับมาเปิดแอป · เน็ตกลับมา)
  //   realtime หลุดตอนพักเครื่อง/เน็ตไม่ดี → ข้อมูลในเครื่องค้าง (เช่น นัดที่ถูกลบไปแล้วยังแสดง) → ดึงใหม่แล้วแก้ให้ตรง
  useEffect(() => {
    if (!ready) return;
    let busy = false;
    const reconcile = async () => {
      if (busy || document.hidden || !snap.current) return;
      busy = true;
      try {
        // ประวัติการแก้ไขมีแต่เพิ่ม (ใหญ่ที่สุด) → ไม่ต้องตรวจทาน
        for (const table of [...LISTS.map((l) => l.table).filter((t) => t !== "clinic_audit"), "clinic_config"]) {
          const rows = await loadTable(table);
          const m = snap.current?.[table];
          if (!m) continue;
          const remote = new Map(rows.map((r) => [r.id, r.data]));
          const list = LISTS.find((l) => l.table === table);
          const local = new Map<string, unknown>(list ? list.get(latest.current as unknown as State).map((x) => [x.id, x]) : CONFIG.map((c) => [c.id, c.get(latest.current as unknown as State)]));
          for (const [id, v] of m) {
            // แก้ในเครื่องนี้แล้วยังไม่บันทึก → ข้ามไป รอบันทึกก่อน
            if (local.get(id) !== v) continue;
            if (!remote.has(id)) {
              if (table !== "clinic_config") applyRemote.current(table, id, null);
            } else if (JSON.stringify(remote.get(id)) !== JSON.stringify(v)) applyRemote.current(table, id, remote.get(id));
          }
          for (const [id, v] of remote) if (!m.has(id) && !local.has(id)) applyRemote.current(table, id, v);
        }
      } catch {
        /* เน็ตหลุด → รอบหน้าลองใหม่ */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void reconcile(), 60_000);
    const onVisible = () => !document.hidden && void reconcile();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [ready]);

  if (error) return <div className="dbsync-error">โหลดข้อมูลคลินิกไม่สำเร็จ · {error}</div>;
  return <>{ready ? children : fallback}</>;
}
