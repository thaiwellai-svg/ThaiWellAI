import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Element } from "../data/elements";

/**
 * โมเดล 3D isometric ของธาตุทั้ง 4 (low-poly บนแท่นดินเป็นชั้น · ไม่มีเงา · ไม่มีแอนิเมชัน · ลากหมุนดูได้)
 *  ดิน = ภูเขา · น้ำ = สระน้ำ + หยดน้ำ · ลม = เมฆ + สายลม + ใบไม้ · ไฟ = กองไฟบนวงหิน
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
  const g = new THREE.ConeGeometry(radius, height, opts.sides ?? 9, opts.rows ?? 5, true).toNonIndexed();
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
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** แท่นสี่เหลี่ยมเป็นชั้น (บนสุด = ผิวของธาตุ) */
function base(layers: [number, string][]) {
  const grp = new THREE.Group();
  let y = 0;
  layers.forEach(([h, c], i) => {
    // ชั้นล่างหดเข้าเล็กน้อย = ดูเป็นแท่นมีมิติ · ชั้นบนสุดมีสันขอบนูน
    const w = 5.2 - i * 0.06;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lambert(c));
    y -= h / 2;
    m.position.y = y;
    y -= h / 2;
    grp.add(m);
  });
  const top = new THREE.Color(layers[0][1]);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(5.28, 0.06, 5.28), lambert("#" + top.clone().offsetHSL(0, -0.02, 0.06).getHexString()));
  lip.position.y = 0.0;
  grp.add(lip);
  return grp;
}

function pebbles(seed: number, colors: string[], spots: [number, number, number][]) {
  const r = rng(seed);
  const grp = new THREE.Group();
  for (const [x, z, s] of spots) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), lambert(colors[Math.floor(r() * colors.length)]));
    m.position.set(x, s * 0.45, z);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    grp.add(m);
  }
  return grp;
}

/** ต้นไม้ low-poly (กรวยซ้อน 2 ชั้น + ลำต้น) · lean = เอียงลู่ลม */
function tree(x: number, z: number, s: number, colors: [string, string] = ["#7d9256", "#98ab6a"], lean = 0) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.1 * s, 0.5 * s, 5), lambert("#7a5a3e"));
  trunk.position.y = 0.25 * s;
  g.add(trunk);
  const low = new THREE.Mesh(new THREE.ConeGeometry(0.42 * s, 0.8 * s, 6), lambert(colors[0]));
  low.position.y = 0.75 * s;
  g.add(low);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 0.62 * s, 6), lambert(colors[1]));
  top.position.y = 1.12 * s;
  top.rotation.y = 0.5;
  g.add(top);
  g.position.set(x, 0, z);
  g.rotation.z = lean;
  return g;
}

const SOIL: [number, string][] = [
  [0.32, "#a3825c"],
  [0.36, "#7d6248"],
  [0.3, "#55473b"],
];

interface Scene3D {
  world: THREE.Group;
  /** มุมมอง: ครึ่งความสูงที่เห็น · จุดที่กล้องมอง */
  view: number;
  look: number;
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
  world.add(base([[0.22, "#b9a274"], ...SOIL]));
  world.add(lowPolyCone(2.2, 5.2, 7, ROCK));
  const side = lowPolyCone(1.2, 2.6, 31, ROCK);
  side.position.set(1.35, 0, 1.05);
  world.add(side);
  const back = lowPolyCone(1.05, 2.0, 53, ROCK);
  back.position.set(-1.45, 0, -0.95);
  world.add(back);
  world.add(pebbles(11, ["#6d5f53", "#9c8467"], [[-1.9, 1.7, 0.32], [1.9, -1.7, 0.26], [2.05, 0.2, 0.2], [-1.6, -2.0, 0.22], [0.2, 2.15, 0.18]]));
  // ต้นไม้เชิงเขา
  for (const [x, z, sc] of [[-2.0, 0.6, 0.85], [-1.7, 1.1, 0.65], [0.9, 2.0, 0.75], [1.6, 2.05, 0.55], [2.1, -0.7, 0.6]] as const) world.add(tree(x, z, sc, ["#7f8a55", "#9aa56a"]));
  return { world, view: 3.55, look: 1.4 };
}

// ───────── น้ำ: สระน้ำ + หยดน้ำลอย ─────────
function water(): Scene3D {
  const world = new THREE.Group();
  world.add(base([[0.22, "#d9ceb2"], ...SOIL]));
  // ขอบสระ
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.25, 0.3, 10), lambert("#bfb398"));
  rim.position.y = 0.12;
  world.add(rim);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.12, 10, 1), lambert("#7fb6d6"));
  pool.position.y = 0.24;
  world.add(pool);
  // ระลอกคลื่น
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7 + i * 0.55, 0.05, 3, 10), lambert("#b9dbee"));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.31;
    world.add(ring);
    ripples.push(ring);
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
  world.add(pebbles(23, ["#9aa4a8", "#c8c0aa"], [[-2.1, 1.9, 0.26], [2.0, -1.9, 0.22], [2.15, 1.6, 0.18], [-1.9, -2.1, 0.2]]));
  ripples[1].scale.setScalar(1.08);
  // ใบบัว + ดอกบัว
  for (const [x, z, sc, rot] of [[0.9, 0.7, 1, 0.4], [-0.8, 1.0, 0.8, 2.1], [0.4, -1.1, 0.7, 4.0]] as const) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * sc, 0.34 * sc, 0.04, 7, 1, false, 0, Math.PI * 1.75), lambert("#7fa66a"));
    pad.position.set(x, 0.32, z);
    pad.rotation.y = rot;
    world.add(pad);
  }
  const lotus = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const petal = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), lambert(i % 2 ? "#f2c6cf" : "#f8dde2"));
    petal.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.07, 0.12, Math.sin((i / 6) * Math.PI * 2) * 0.07);
    petal.rotation.set(Math.sin((i / 6) * Math.PI * 2) * 0.5, 0, -Math.cos((i / 6) * Math.PI * 2) * 0.5);
    lotus.add(petal);
  }
  lotus.position.set(0.9, 0.3, 0.7);
  world.add(lotus);
  // ต้นกก
  for (const [x, z] of [[-2.0, -0.4], [-1.85, -0.7], [-2.1, -0.9], [1.9, 0.6], [2.05, 0.9]] as const) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.9, 4), lambert("#8aa264"));
    reed.position.set(x, 0.45, z);
    reed.rotation.z = (x > 0 ? -1 : 1) * 0.12;
    world.add(reed);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 5), lambert("#8b6a48"));
    tip.position.set(x + (x > 0 ? -0.05 : 0.05), 0.92, z);
    world.add(tip);
  }
  return { world, view: 3.4, look: 0.95 };
}

// ───────── ลม: เมฆลอย + สายลมวน + ใบไม้ปลิว ─────────
function wind(): Scene3D {
  const world = new THREE.Group();
  world.add(base([[0.22, "#bcc79f"], ...SOIL]));
  // หญ้าเตี้ย ๆ
  world.add(pebbles(5, ["#9fb27c", "#c3cfa4"], [[-1.8, 1.6, 0.3], [1.7, -1.5, 0.26], [1.9, 1.5, 0.22], [-1.5, -1.9, 0.24], [0.1, 0.2, 0.34]]));
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
  const clouds = [cloud(-0.4, 3.4, 0.3, 1.25), cloud(1.4, 2.4, -1.0, 0.85), cloud(-1.5, 2.1, 1.3, 0.7)];
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
  // ต้นไม้ลู่ลม
  world.add(tree(-1.9, -1.2, 0.95, ["#86a35f", "#a7bf78"], -0.18));
  world.add(tree(-1.4, -1.8, 0.7, ["#86a35f", "#a7bf78"], -0.2));
  world.add(tree(1.9, 1.9, 0.6, ["#86a35f", "#a7bf78"], -0.16));
  return { world, view: 3.5, look: 1.35 };
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
  world.add(base([[0.22, "#9b8b7c"], [0.32, "#8a6a52"], [0.36, "#6e5240"], [0.3, "#4c3d33"]]));
  // วงหิน
  const stones: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    stones.push([Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0.32 + (i % 3) * 0.04]);
  }
  world.add(pebbles(91, ["#7d746c", "#a39a90", "#5f5852"], stones));
  // ฟืน
  // ฟืนวางไขว้กันแบบกระโจม
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.9, 6), lambert(i % 2 ? "#7a5236" : "#93663f"));
    log.position.set(Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45);
    log.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    world.add(log);
  }
  const outer = lowPolyCone(1.0, 2.8, 13, FLAME_OUT, { sides: 7, rows: 4, wobble: 0.45 });
  const mid = lowPolyCone(0.68, 2.1, 29, FLAME_MID, { sides: 7, rows: 3, wobble: 0.4 });
  const inner = lowPolyCone(0.38, 1.3, 47, FLAME_IN, { sides: 6, rows: 2, wobble: 0.3 });
  [outer, mid, inner].forEach((f) => {
    f.position.y = 0.35;
    (f.material as THREE.MeshLambertMaterial).emissive = new THREE.Color("#a83a12");
    (f.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.35;
    world.add(f);
  });
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
  // หินกับต้นไม้แห้งรอบ ๆ
  world.add(tree(-2.0, 1.8, 0.7, ["#8c7a52", "#a8946a"]));
  world.add(tree(1.95, -1.9, 0.6, ["#8c7a52", "#a8946a"]));
  return { world, view: 3.4, look: 1.05 };
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
    sc.world.position.y = -1.4;
    scene.add(sc.world);

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
    cam.position.set(10, 8.2 + sc.look - 1.3, 10);
    cam.lookAt(0, sc.look - 1.4, 0);
    const fit = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.top = sc.view;
      cam.bottom = -sc.view;
      cam.left = (-sc.view * w) / h;
      cam.right = (sc.view * w) / h;
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
      sc.world.rotation.y = yaw;
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
