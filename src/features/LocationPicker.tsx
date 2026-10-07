import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BANGKOK: [number, number] = [13.7563, 100.5018];
/** หมุดแบบ CSS (ไม่ต้องใช้ไฟล์รูปของ Leaflet) */
const PIN = L.divIcon({ className: "lp-pin", html: "<i></i>", iconSize: [30, 40], iconAnchor: [15, 38] });

/**
 * แผนที่ปักหมุด: แตะบนแผนที่ = ย้ายหมุดไปตรงนั้น · ลากหมุดเพื่อปรับ · ค่าใหม่จากข้างนอก (ค้นหา / ตำแหน่งปัจจุบัน) → เลื่อนแผนที่ไปหา
 */
export function LocationPicker({ value, onChange, height = 260 }: { value: [number, number] | null; onChange: (v: [number, number]) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  /** ค่าที่มาจากการแตะ/ลากบนแผนที่เอง (ไม่ต้องเลื่อนแผนที่ตาม) */
  const mine = useRef<string | null>(null);
  const cb = useRef((v: [number, number]) => {
    mine.current = `${v[0]},${v[1]}`;
    onChange(v);
  });
  cb.current = (v: [number, number]) => {
    mine.current = `${v[0]},${v[1]}`;
    onChange(v);
  };

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(value ?? BANGKOK, value ? 17 : 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => cb.current([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    // แผนที่อยู่ในหน้าต่างที่เพิ่งเปิด → คำนวณขนาดใหม่หลังแสดงผล
    const t = window.setTimeout(() => m.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      pin.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (!pin.current) {
      pin.current = L.marker(value, { icon: PIN, draggable: true }).addTo(m);
      pin.current.on("dragend", () => {
        const p = pin.current!.getLatLng();
        cb.current([p.lat, p.lng]);
      });
    } else pin.current.setLatLng(value);
    // ค่ามาจากข้างนอก (ค้นหา / ตำแหน่งปัจจุบัน / วางลิงก์) → ซูมไปที่หมุด
    if (mine.current !== `${value[0]},${value[1]}`) m.setView(value, Math.max(m.getZoom(), 17));
  }, [value?.[0], value?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="lp-map" style={{ height }} />;
}
