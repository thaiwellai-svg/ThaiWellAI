import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Element } from "../data/elements";

/**
 * โมเดล 3D isometric ของธาตุทั้ง 4 (low-poly บนแท่นดินเป็นชั้น · ไม่มีเงา · แกว่งช้า ๆ ลากหมุนได้)
 *  ดิน = ภูเขา · น้ำ = สระน้ำ + หยดน้ำ · ลม = เมฆ + สายลม + ใบไม้ · ไฟ = กองไฟบนวงหิน
 * โทนสีของธาตุดินตามภาพใน Figma (ThaiWell 225:36) · หยุดวาดเมื่อเลื่อนพ้นจอ
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
  for (const [h, c] of layers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(5.2, h, 5.2), lambert(c));
    y -= h / 2;
    m.position.y = y;
    y -= h / 2;
    grp.add(m);
  }
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

const SOIL: [number, string][] = [
  [0.32, "#a3825c"],
  [0.36, "#7d6248"],
  [0.3, "#55473b"],
];

interface Scene3D {
  world: THREE.Group;
  /** ขยับทุกเฟรม (t = วินาที) */
  tick?: (t: number) => void;
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
  return { world, view: 4.0, look: 1.3 };
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
  return {
    world,
    view: 4.0,
    look: 1.2,
    tick: (t) => {
      drop.position.y = 2.7 + Math.sin(t * 1.6) * 0.18;
      drop.rotation.y = t * 0.6;
      ripples.forEach((r, i) => r.scale.setScalar(1 + ((t * 0.25 + i * 0.5) % 1) * 0.25));
    },
  };
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
  return {
    world,
    view: 4.0,
    look: 1.5,
    tick: (t) => {
      clouds.forEach((c, i) => (c.position.y += Math.sin(t * 0.9 + i * 2) * 0.004));
      swirls.forEach((s, i) => (s.rotation.y = t * (0.35 + i * 0.12)));
      leaves.forEach((l, i) => {
        const a = t * 0.8 + (i / leaves.length) * Math.PI * 2;
        const rad = 1.7 + (i % 2) * 0.5;
        l.position.set(Math.cos(a) * rad, 1.1 + i * 0.32 + Math.sin(t * 2 + i) * 0.12, Math.sin(a) * rad);
        l.rotation.set(t * 2 + i, a, t + i);
      });
    },
  };
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
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.1, 6), lambert(i % 2 ? "#7a5236" : "#93663f"));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 3) * Math.PI;
    log.position.y = 0.2 + i * 0.07;
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
  // ประกายไฟ
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), lambert("#f8c35c", { emissive: new THREE.Color("#f08a35"), emissiveIntensity: 0.6 }));
    world.add(s);
    sparks.push(s);
  }
  return {
    world,
    view: 3.8,
    look: 1.2,
    tick: (t) => {
      outer.scale.set(1 + Math.sin(t * 5) * 0.04, 1 + Math.sin(t * 3.7) * 0.07, 1 + Math.cos(t * 4.4) * 0.04);
      mid.scale.set(1, 1 + Math.sin(t * 4.6 + 1) * 0.09, 1);
      inner.scale.set(1, 1 + Math.sin(t * 6 + 2) * 0.1, 1);
      outer.rotation.y = t * 0.4;
      mid.rotation.y = -t * 0.6;
      sparks.forEach((s, i) => {
        const k = (t * 0.45 + i / sparks.length) % 1;
        s.position.set(Math.sin(i * 2.1 + t) * 0.5 * k, 1.2 + k * 2.4, Math.cos(i * 1.7 + t) * 0.5 * k);
        s.scale.setScalar(1 - k);
      });
    },
  };
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
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let drag: number | null = null;
    let yaw = 0;
    let spin = 0;
    const down = (e: PointerEvent) => {
      drag = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag === null) return;
      yaw += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    };
    const up = () => (drag = null);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const t = still ? 0 : (performance.now() - t0) / 1000;
      if (!still && drag === null) spin = Math.sin(t / 4.2) * 0.35;
      sc.world.rotation.y = yaw + spin;
      sc.tick?.(t);
      renderer.render(scene, cam);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
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
