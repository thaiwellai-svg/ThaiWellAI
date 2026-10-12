import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Element } from "../data/elements";

/**
 * โมเดล 3D isometric ของธาตุทั้ง 4 (low-poly เฉพาะองค์ประกอบของธาตุ ไม่มีฐาน · ไม่มีเงา · ไม่มีแอนิเมชัน · ลากหมุนดูได้)
 *  ดิน = ภูเขา · น้ำ = หยดน้ำ + ระลอกน้ำ · ลม = เมฆ + สายลม + ใบไม้ · ไฟ = เปลวไฟบนฟืน
 * โทนสีของธาตุดินตามภาพใน Figma (ThaiWell 225:36) · วาดครั้งเดียว (วาดใหม่เมื่อย่อ/ขยายหรือลาก)
 */

// สุ่มแบบคงที่ (หน้าตาเดิมทุกครั้ง)
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

type Stops = readonly (readonly [number, string])[];
function ramp(stops: Stops, t: number, jitter = 0) {
  const c = new THREE.Color(stops[stops.length - 1][1]);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      c.set(ca).lerp(new THREE.Color(cb), Math.max(0, (t - a) / (b - a)));
      break;
    }
  }
  return c.offsetHSL(0, 0, jitter);
}

/** กรวย low-poly บิดสันด้วยค่าสุ่มคงที่ · สีต่อหน้าไล่ตามความสูง (flat shading) */
function lowPolyCone(radius: number, height: number, seed: number, stops: Stops, opts: { sides?: number; rows?: number; wobble?: number } = {}) {
  const r = rng(seed);
  const g = new THREE.ConeGeometry(radius, height, opts.sides ?? 9, opts.rows ?? 5, false).toNonIndexed();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const wob = opts.wobble ?? 0.32;
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!moved.has(key)) {
      const h = (y + height / 2) / height;
      const amp = h > 0.98 ? 0.05 : wob * (1 - h * 0.6);
      moved.set(key, [x * (1 + (r() - 0.5) * amp * 1.6), y + (h > 0.02 && h < 0.98 ? (r() - 0.5) * height * 0.07 : 0), z * (1 + (r() - 0.5) * amp * 1.6)]);
    }
    const [nx, ny, nz] = moved.get(key)!;
    pos.setXYZ(i, nx, ny, nz);
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const c = ramp(stops, Math.min(1, Math.max(0, (cy + height / 2) / height + (r() - 0.5) * 0.12)), (r() - 0.5) * 0.06);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.translate(0, height / 2, 0);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
}

interface Scene3D {
  world: THREE.Group;
}

// ───────── ดิน: ภูเขา ─────────
const ROCK: Stops = [
  [0.0, "#6b5a49"],
  [0.25, "#8f7558"],
  [0.45, "#b5966f"],
  [0.62, "#d5bd93"],
  [0.8, "#ecdfc2"],
  [1.0, "#fbf5e8"],
];
function earth(): Scene3D {
  const world = new THREE.Group();
  world.add(lowPolyCone(2.2, 5.2, 7, ROCK, { wobble: 0.24 }));
  // ยอดรองซ้อนชิดยอดหลัก (ไม่มีร่องว่าง)
  const side = lowPolyCone(1.35, 2.8, 31, ROCK, { wobble: 0.22 });
  side.position.set(0.95, 0, 0.8);
  world.add(side);
  const back = lowPolyCone(1.15, 2.2, 53, ROCK, { wobble: 0.22 });
  back.position.set(-1.0, 0, -0.7);
  world.add(back);
  return { world };
}

// ───────── น้ำ: สระน้ำ + หยดน้ำลอย ─────────
function water(): Scene3D {
  const world = new THREE.Group();
  // ระลอกน้ำใต้หยดน้ำ
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75 + i * 0.5, 0.06 - i * 0.012, 3, 12), lambert(["#8cc0de", "#a9d1e8", "#c9e2f0"][i]));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    world.add(ring);
  }
  // หยดน้ำ (lathe low-poly)
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    const y = -Math.cos(a);
    pts.push(new THREE.Vector2(Math.sin(a) * (y < 0 ? 1 : 1 - (y * 0.85) ** 0.9), y * 1.25 + (y > 0 ? y * 0.9 : 0)));
  }
  const drop = new THREE.Mesh(new THREE.LatheGeometry(pts, 9), lambert("#5c9fcb"));
  drop.scale.setScalar(0.85);
  drop.position.y = 2.7;
  world.add(drop);
  return { world };
}

// ───────── ลม: เมฆลอย + สายลมวน + ใบไม้ปลิว ─────────
function wind(): Scene3D {
  const world = new THREE.Group();
  const r = rng(77);
  const cloud = (x: number, y: number, z: number, s: number) => {
    const g = new THREE.Group();
    const parts: [number, number, number, number][] = [
      [0, 0, 0, 0.75],
      [0.7, -0.1, 0.1, 0.55],
      [-0.65, -0.12, -0.05, 0.5],
      [0.25, 0.3, -0.25, 0.45],
    ];
    for (const [px, py, pz, ps] of parts) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(ps, 0), lambert(r() > 0.5 ? "#f6f8fa" : "#e2e9ef"));
      m.position.set(px, py, pz);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      g.add(m);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    world.add(g);
    return g;
  };
  const clouds = [cloud(-0.3, 3.3, 0.3, 1.55), cloud(1.45, 2.4, -1.0, 1.05), cloud(-1.55, 2.1, 1.3, 0.9)];
  // สายลม: ท่อโค้งรอบแกน
  const swirls: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.EllipseCurve(0, 0, 1.6 + i * 0.35, 1.6 + i * 0.35, 0, Math.PI * (1.1 + i * 0.15));
    const pts3 = curve.getPoints(18).map((p, k) => new THREE.Vector3(p.x, 0.9 + i * 0.55 + k * 0.025, p.y));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3), 24, 0.045, 4), lambert("#c7d6df"));
    world.add(tube);
    swirls.push(tube);
  }
  // ใบไม้
  const leaves: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16, 0), lambert(i % 2 ? "#8fae6b" : "#b8c97f"));
    leaf.scale.set(1, 0.35, 1.6);
    world.add(leaf);
    leaves.push(leaf);
  }
  void clouds;
  swirls.forEach((s, i) => (s.rotation.y = i * 1.3));
  leaves.forEach((l, i) => {
    const a = (i / leaves.length) * Math.PI * 2 + 0.4;
    const rad = 1.7 + (i % 2) * 0.5;
    l.position.set(Math.cos(a) * rad, 1.1 + i * 0.32, Math.sin(a) * rad);
    l.rotation.set(i * 1.1, a, i * 0.7);
  });
  return { world };
}

// ───────── ไฟ: กองไฟบนวงหิน ─────────
const FLAME_OUT: Stops = [
  [0, "#d9532f"],
  [0.6, "#ee7a36"],
  [1, "#f6a54a"],
];
const FLAME_MID: Stops = [
  [0, "#f08a35"],
  [1, "#f8c35c"],
];
const FLAME_IN: Stops = [
  [0, "#f9cf6b"],
  [1, "#fff1bf"],
];
function fire(): Scene3D {
  const world = new THREE.Group();
  // เปลวไฟหลายลิ้น: กลางสูง + ลิ้นข้าง · ชั้นกลาง/ใน ส้ม-เหลืองซ้อนด้านใน
  const glow = (m: THREE.Mesh, k = 0.35) => {
    (m.material as THREE.MeshLambertMaterial).emissive = new THREE.Color("#a83a12");
    (m.material as THREE.MeshLambertMaterial).emissiveIntensity = k;
    world.add(m);
    return m;
  };
  glow(lowPolyCone(0.95, 3.6, 13, FLAME_OUT, { sides: 7, rows: 4, wobble: 0.3 }));
  for (const [x, z, h, r, seed] of [[0.62, 0.3, 2.2, 0.55, 17], [-0.55, 0.42, 1.8, 0.5, 19], [0.1, -0.62, 2.0, 0.5, 23], [-0.4, -0.35, 1.4, 0.42, 27]] as const) {
    const t = glow(lowPolyCone(r, h, seed, FLAME_OUT, { sides: 6, rows: 3, wobble: 0.3 }));
    t.position.set(x, 0, z);
    t.rotation.set(z * 0.35, 0, -x * 0.35);
  }
  const mid = glow(lowPolyCone(0.68, 2.5, 29, FLAME_MID, { sides: 7, rows: 3, wobble: 0.25 }), 0.4);
  const inner = glow(lowPolyCone(0.4, 1.5, 47, FLAME_IN, { sides: 6, rows: 2, wobble: 0.2 }), 0.45);
  mid.position.set(0.12, 0, 0.32);
  inner.position.set(0.18, 0, 0.5);
  mid.rotation.y = 0.6;
  inner.rotation.y = 1.1;
  // ถ่านแดงที่ฐาน
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.12, 9), lambert("#b8482a", { emissive: new THREE.Color("#7a2410"), emissiveIntensity: 0.5 }));
  ember.position.y = 0.06;
  world.add(ember);
  // ประกายไฟ (นิ่ง)
  for (const [x, y, z, sc] of [[0.35, 3.3, 0.1, 1], [-0.3, 3.7, -0.2, 0.7], [0.1, 4.1, 0.3, 0.5]] as const) {
    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 * sc, 0), lambert("#f8c35c", { emissive: new THREE.Color("#f08a35"), emissiveIntensity: 0.6 }));
    sp.position.set(x, y, z);
    world.add(sp);
  }
  return { world };
}

const BUILD: Record<Element, () => Scene3D> = { ดิน: earth, น้ำ: water, ลม: wind, ไฟ: fire };
const LABEL: Record<Element, string> = { ดิน: "ภูเขา", น้ำ: "สระน้ำและหยดน้ำ", ลม: "เมฆและสายลม", ไฟ: "กองไฟ" };

export function ElementDiorama({ element, className }: { element: Element; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // ไม่มี WebGL → ไม่แสดงโมเดล
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const sc = BUILD[element]();
    // จัดกึ่งกลาง + ขนาดพอดีกรอบอัตโนมัติ (ไม่มีฐาน แต่ละธาตุขนาดไม่เท่ากัน)
    const sphere = new THREE.Box3().setFromObject(sc.world).getBoundingSphere(new THREE.Sphere());
    sc.world.position.sub(sphere.center);
    const pivot = new THREE.Group();
    pivot.add(sc.world);
    scene.add(pivot);
    const view = sphere.radius * 0.86;

    // แสงนุ่ม ฝั่งซ้ายสว่าง ฝั่งขวาเข้ม (ตามภาพอ้างอิง)
    scene.add(new THREE.HemisphereLight("#fffaf0", "#b49a7c", 2.4));
    const sun = new THREE.DirectionalLight("#fff4e2", 2.0);
    sun.position.set(-4, 10, 8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight("#e9dccb", 0.6);
    fill.position.set(8, 3, -2);
    scene.add(fill);

    // isometric: orthographic เอียง ~35° หมุน 45°
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    cam.position.set(10, 8.2, 10);
    cam.lookAt(0, 0, 0);
    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      const v = w < h ? (view * h) / w : view;
      cam.top = v;
      cam.bottom = -v;
      cam.left = (-v * w) / h;
      cam.right = (v * w) / h;
      cam.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(() => {
      fit();
      draw();
    });
    ro.observe(el);

    // ไม่มีแอนิเมชัน: วาดครั้งเดียว · วาดใหม่เมื่อย่อ/ขยาย หรือเมื่อลากหมุน
    let drag: number | null = null;
    let yaw = 0;
    const draw = () => {
      pivot.rotation.y = yaw;
      renderer.render(scene, cam);
    };
    const down = (e: PointerEvent) => {
      drag = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag === null) return;
      yaw += (e.clientX - drag) * 0.01;
      drag = e.clientX;
      draw();
    };
    const up = () => (drag = null);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    draw();

    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [element]);
  return <div ref={host} className={className} role="img" aria-label={`ธาตุ${element}: ${LABEL[element]}`} />;
}
