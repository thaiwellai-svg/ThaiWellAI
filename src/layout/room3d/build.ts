import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  flameTexture,
  gardenTextureHD,
  leafletTexture,
  linenTexture,
  plasterTexture,
  softTexture,
  travertineTexture,
  waxGlowTexture,
  woodTexture,
} from "./textures";

/**
 * "Sabai Studio" — a minimal Japandi massage suite at blue hour.
 * Studio lighting: a floor-to-ceiling window as the softbox, a cove grazing an oak
 * slat panel, a paper lantern, candles. Units: metres.
 */

export interface Candle {
  flame: THREE.Sprite;
  wax: THREE.MeshStandardMaterial;
  baseScale: THREE.Vector2;
  seed: number;
  gust: number;
}

export interface RoomHandles {
  scene: THREE.Scene;
  camera: { position: THREE.Vector3; target: THREE.Vector3; focus: number };
  candles: Candle[];
  candleLights: { light: THREE.PointLight; base: number; members: number[] }[];
  pendant: { light: THREE.PointLight; bulb: THREE.MeshBasicMaterial; base: number };
  steam: { sprites: THREE.Sprite[]; origin: THREE.Vector3; burst: number };
  dust: THREE.Points;
  leaves: { mesh: THREE.Object3D; base: THREE.Euler; seed: number }[];
  curtains: { mesh: THREE.Mesh; rest: Float32Array }[];
  pickables: THREE.Object3D[];
  /** per-frame hook for shader-driven elements (water, caustics) */
  tick?: (t: number) => void;
  /** where to bake a reflection probe of the scene itself (real reflections on floor, brass, glass) */
  envProbe?: { position: THREE.Vector3; intensity: number };
}

const rand = (() => {
  let s = 20260930;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
})();

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}
const rbox = (w: number, h: number, d: number, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

export function buildRoom(): RoomHandles {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e0b09");

  /* ── Materials ──────────────────────────────────────────── */
  const plaster = plasterTexture();
  const wallMat = std({ map: plaster.map, bumpMap: plaster.bump, bumpScale: 0.35, roughness: 0.94, color: "#e9dfd2" });
  const floorTex = woodTexture({ vertical: false, plank: 110, base: [32, 24, 60], seed: 23, size: 2048 });
  for (const t of [floorTex.map, floorTex.bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.6, 1.6);
  }
  const floorMat = new THREE.MeshPhysicalMaterial({
    map: floorTex.map,
    bumpMap: floorTex.bump,
    bumpScale: 0.45,
    roughness: 0.5,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    color: "#ecdcc6",
  });
  const oakTex = woodTexture({ vertical: true, plank: 1024, base: [32, 26, 62], seed: 5, size: 1024, joints: false });
  const oakMat = std({ map: oakTex.map, roughness: 0.55, color: "#f1e2cc" });
  const linen = linenTexture();
  const linenMat = new THREE.MeshPhysicalMaterial({ map: linen, color: "#f7f3ec", roughness: 0.95, sheen: 1, sheenColor: new THREE.Color("#fff9ef"), sheenRoughness: 0.55 });
  const towelMat = new THREE.MeshPhysicalMaterial({ map: linen, color: "#fbf9f5", roughness: 1, sheen: 1, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.75 });
  const stoneTex = travertineTexture();
  const stoneMat = std({ map: stoneTex, roughness: 0.62, color: "#efe4d2" });
  const ceramicSage = std({ color: "#a5ab93", roughness: 0.45 });
  const ceramicChar = std({ color: "#3a3632", roughness: 0.4 });

  /* ── Shell: plaster room, oak floor ─────────────────────── */
  const ROOM = { x0: -3.4, x1: 3.2, z0: -2.7, z1: 4.8, h: 2.95 };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((ROOM.x0 + ROOM.x1) / 2, 0, (ROOM.z0 + ROOM.z1) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = (w: number, h: number, pos: THREE.Vector3, rotY: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.copy(pos);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // back wall
  wall(ROOM.x1 - ROOM.x0, ROOM.h, new THREE.Vector3((ROOM.x0 + ROOM.x1) / 2, ROOM.h / 2, ROOM.z0), 0);
  // right wall
  wall(ROOM.z1 - ROOM.z0, ROOM.h, new THREE.Vector3(ROOM.x1, ROOM.h / 2, (ROOM.z0 + ROOM.z1) / 2), -Math.PI / 2);
  // left wall with a floor-to-ceiling window from z = -2.3 … 1.6
  const WIN = { z0: -2.3, z1: 1.6, y0: 0.06, y1: 2.72 };
  wall(WIN.z0 - ROOM.z0, ROOM.h, new THREE.Vector3(ROOM.x0, ROOM.h / 2, (ROOM.z0 + WIN.z0) / 2), Math.PI / 2);
  wall(ROOM.z1 - WIN.z1, ROOM.h, new THREE.Vector3(ROOM.x0, ROOM.h / 2, (WIN.z1 + ROOM.z1) / 2), Math.PI / 2);
  wall(WIN.z1 - WIN.z0, ROOM.h - WIN.y1, new THREE.Vector3(ROOM.x0, (WIN.y1 + ROOM.h) / 2, (WIN.z0 + WIN.z1) / 2), Math.PI / 2);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), std({ color: "#d9cfc2", roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((ROOM.x0 + ROOM.x1) / 2, ROOM.h, (ROOM.z0 + ROOM.z1) / 2);
  scene.add(ceiling);
  // shadow-gap skirting (architectural detail)
  const gap = new THREE.Mesh(new THREE.BoxGeometry(ROOM.x1 - ROOM.x0, 0.012, 0.01), std({ color: "#1d1712", roughness: 1 }));
  gap.position.set((ROOM.x0 + ROOM.x1) / 2, 0.006, ROOM.z0 + 0.005);
  scene.add(gap);

  /* ── Window: frameless glass, garden beyond, sheer curtain ─ */
  const garden = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: gardenTextureHD(), color: new THREE.Color(0.95, 0.95, 1.0) }));
  garden.position.set(ROOM.x0 - 3.2, 1.8, (WIN.z0 + WIN.z1) / 2);
  garden.rotation.y = Math.PI / 2;
  scene.add(garden);
  const frameMat = std({ color: "#2a2520", roughness: 0.5, metalness: 0.4 });
  for (const z of [WIN.z0, WIN.z1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, WIN.y1 - WIN.y0, 0.035), frameMat);
    m.position.set(ROOM.x0, (WIN.y0 + WIN.y1) / 2, z);
    scene.add(m);
  }
  for (const y of [WIN.y0, WIN.y1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, WIN.z1 - WIN.z0), frameMat);
    m.position.set(ROOM.x0, y, (WIN.z0 + WIN.z1) / 2);
    scene.add(m);
  }
  const windowLight = new THREE.RectAreaLight("#b9c8e6", 4.5, WIN.z1 - WIN.z0, WIN.y1 - WIN.y0);
  windowLight.position.set(ROOM.x0 + 0.02, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
  windowLight.lookAt(ROOM.x0 + 5, 0.9, (WIN.z0 + WIN.z1) / 2);
  scene.add(windowLight);
  // low warm "last light" through the glass: the only hard-ish shadow in the room (VSM-softened)
  const sun = new THREE.DirectionalLight("#ffc18a", 1.15);
  sun.position.set(ROOM.x0 - 4, 2.6, -0.2);
  sun.target.position.set(0.4, 0.2, -0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 14;
  sun.shadow.radius = 12;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const curtainMat = new THREE.MeshPhysicalMaterial({ color: "#f3ede4", roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, map: linen, sheen: 1, sheenColor: new THREE.Color("#fff") });
  const curtains: RoomHandles["curtains"] = [];
  {
    const g = new THREE.PlaneGeometry(1.35, 2.62, 48, 14);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 30) * 0.03 + Math.sin(pos.getX(i) * 9) * 0.015);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, curtainMat);
    m.rotation.y = Math.PI / 2;
    m.position.set(ROOM.x0 + 0.14, 1.36, WIN.z1 - 0.62);
    m.castShadow = true;
    scene.add(m);
    curtains.push({ mesh: m, rest: Float32Array.from(pos.array as Float32Array) });
  }
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, WIN.z1 - WIN.z0 + 0.3), frameMat);
  track.position.set(ROOM.x0 + 0.14, ROOM.h - 0.03, (WIN.z0 + WIN.z1) / 2);
  scene.add(track);

  /* ── Feature: oak slat panel + cove light, behind the bed ─ */
  const panelW = 2.6;
  const slatW = 0.045;
  const slatGap = 0.022;
  const n = Math.floor(panelW / (slatW + slatGap));
  const slats = new THREE.InstancedMesh(new RoundedBoxGeometry(slatW, ROOM.h - 0.24, 0.035, 2, 0.006), oakMat, n);
  const mtx = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (let i = 0; i < n; i++) {
    mtx.makeTranslation(-panelW / 2 + i * (slatW + slatGap) + slatW / 2, (ROOM.h - 0.24) / 2, ROOM.z0 + 0.05);
    slats.setMatrixAt(i, mtx);
    slats.setColorAt(i, tint.setHSL(0.08, 0.16, 0.9 + (rand() - 0.5) * 0.06));
  }
  slats.castShadow = slats.receiveShadow = true;
  scene.add(slats);
  const panelBack = new THREE.Mesh(new THREE.PlaneGeometry(panelW + 0.04, ROOM.h - 0.24), std({ color: "#2b211a", roughness: 1 }));
  panelBack.position.set(0, (ROOM.h - 0.24) / 2, ROOM.z0 + 0.012);
  scene.add(panelBack);
  // recessed cove above the panel: emissive strip + a light grazing down the slats
  const coveStrip = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 1.5), toneMapped: false }));
  coveStrip.position.set(0, ROOM.h - 0.22, ROOM.z0 + 0.08);
  scene.add(coveStrip);
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(panelW + 0.3, 0.2, 0.3), wallMat);
  soffit.position.set(0, ROOM.h - 0.1, ROOM.z0 + 0.15);
  scene.add(soffit);
  const cove = new THREE.RectAreaLight("#ffc98f", 9, panelW, 0.12);
  cove.position.set(0, ROOM.h - 0.24, ROOM.z0 + 0.14);
  cove.lookAt(0, 0, ROOM.z0 + 0.02);
  scene.add(cove);

  /* ── Wall niche (right wall) with backlight ─────────────── */
  const niche = new THREE.Group();
  const nicheBack = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), std({ color: "#e8dccd", roughness: 1 }));
  niche.add(nicheBack);
  const nicheGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.3), toneMapped: false }));
  nicheGlow.position.set(0, 0.235, 0.02);
  niche.add(nicheGlow);
  const nicheShelf = new THREE.Mesh(rbox(0.9, 0.03, 0.2, 0.006), stoneMat);
  nicheShelf.position.set(0, -0.24, 0.1);
  niche.add(nicheShelf);
  const vase = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.07, 0.08], [0.05, 0.22], [0.025, 0.28], [0.03, 0.3], [0, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)), 32), ceramicChar);
  vase.position.set(-0.18, -0.225, 0.1);
  niche.add(vase);
  [[0.06, 0.03], [0.045, 0.025], [0.032, 0.02]].forEach(([r, h], k) => {
    const st = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), std({ color: "#2b2926", roughness: 0.3 }));
    st.scale.set(r, h, r * 0.9);
    st.position.set(0.16, -0.21 + k * 0.042, 0.1);
    niche.add(st);
  });
  niche.position.set(ROOM.x1 - 0.12, 1.45, -0.9);
  niche.rotation.y = -Math.PI / 2;
  scene.add(shadowed(niche));
  const nicheLight = new THREE.RectAreaLight("#ffcf9a", 3, 0.86, 0.1);
  nicheLight.position.set(ROOM.x1 - 0.14, 1.68, -0.9);
  nicheLight.lookAt(ROOM.x1 - 0.14, 0, -0.9);
  scene.add(nicheLight);

  /* ── Massage bed (clean oak, white linen) ───────────────── */
  const pickables: THREE.Object3D[] = [];
  const makeFlower = () => {
    const f = new THREE.Group();
    const petalMat = new THREE.MeshPhysicalMaterial({ color: "#fffbf3", roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color("#fff3d6") });
    const heartMat = std({ color: "#f5c343", roughness: 0.6 });
    const petalGeo = new THREE.SphereGeometry(1, 16, 10);
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(petalGeo, petalMat);
      p.scale.set(0.018, 0.0045, 0.034);
      const a = (i / 5) * Math.PI * 2;
      p.position.set(Math.sin(a) * 0.027, 0.004, Math.cos(a) * 0.027);
      p.rotation.set(0.22, a, 0.22);
      f.add(p);
    }
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), heartMat);
    h.scale.y = 0.5;
    h.position.y = 0.006;
    f.add(h);
    return shadowed(f, true, false);
  };
  const bed = new THREE.Group();
  const L = 1.96;
  const D = 0.76;
  const legGeo = rbox(0.06, 0.62, 0.06, 0.008);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, oakMat);
      leg.position.set(sx * (L / 2 - 0.12), 0.31, sz * (D / 2 - 0.1));
      bed.add(leg);
    }
  const rail = new THREE.Mesh(rbox(L - 0.2, 0.04, 0.04, 0.008), oakMat);
  rail.position.set(0, 0.18, 0);
  bed.add(rail);
  const apron = new THREE.Mesh(rbox(L - 0.06, 0.06, D - 0.1, 0.012), oakMat);
  apron.position.y = 0.64;
  bed.add(apron);
  const mattress = new THREE.Mesh(rbox(L, 0.14, D, 0.055, 6), linenMat);
  mattress.position.y = 0.74;
  bed.add(mattress);
  // wrinkled sheet: subdivided plane with gentle noise, tucked slightly over the edges
  {
    const g = new THREE.PlaneGeometry(L + 0.06, D + 0.08, 80, 30);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.max(Math.abs(x) - L / 2 + 0.02, Math.abs(z) - D / 2 + 0.02);
      const drop = edge > 0 ? -edge * 2.2 : 0;
      const wr = Math.sin(x * 9 + Math.sin(z * 7) * 1.5) * 0.0028 + Math.sin(x * 23 + z * 17) * 0.0012;
      p.setY(i, drop + wr);
    }
    g.computeVertexNormals();
    const sheet = new THREE.Mesh(g, linenMat);
    sheet.position.y = 0.813;
    bed.add(sheet);
  }
  // runner towel draped across and over the front edge
  {
    const W = 0.56;
    const top = D / 2 + 0.02;
    const drop = 0.3;
    const g = new THREE.PlaneGeometry(W, top * 2 + drop + 0.04, 16, 60);
    const p = g.attributes.position as THREE.BufferAttribute;
    const total = top * 2 + drop + 0.04;
    for (let i = 0; i < p.count; i++) {
      const u = p.getY(i) + total / 2; // 0 … total along the towel
      let y: number;
      let z: number;
      if (u < top * 2) {
        y = 0;
        z = -top + u;
      } else {
        const k = u - top * 2; // around the bend, then hanging
        const R = 0.055;
        const a = Math.min(k / R, Math.PI / 2);
        y = -(1 - Math.cos(a)) * R - Math.max(0, k - (Math.PI / 2) * R);
        z = top + 0.012 + Math.sin(a) * R;
      }
      const wr = Math.sin(p.getX(i) * 20 + u * 6) * 0.003;
      p.setXYZ(i, p.getX(i), y + wr, z);
    }
    g.computeVertexNormals();
    const runner = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ map: linen, color: "#f3ebdf", roughness: 1, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color("#fffaf0"), polygonOffset: true, polygonOffsetFactor: -2 }));
    runner.position.set(0.22, 0.832, 0);
    bed.add(runner);
  }
  const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.44, 8, 20), towelMat);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(-L / 2 + 0.2, 0.89, 0);
  bed.add(roll);
  for (let k = 0; k < 2; k++) {
    const t = new THREE.Mesh(rbox(0.38, 0.05, 0.28, 0.023, 5), towelMat);
    t.position.set(0.66, 0.85 + k * 0.051, -0.06 + k * 0.01);
    t.rotation.y = (k - 0.5) * 0.04;
    bed.add(t);
  }
  const f1 = makeFlower();
  f1.position.set(0.62, 0.93, -0.04);
  f1.rotation.y = 0.5;
  bed.add(f1);
  bed.position.set(0.1, 0, -0.65);
  bed.rotation.y = -0.1;
  scene.add(shadowed(bed));

  /* ── Wool rug ───────────────────────────────────────────── */
  const rug = new THREE.Mesh(rbox(2.9, 0.012, 1.9, 0.006, 2), std({ map: linen, bumpMap: linen, bumpScale: 2, color: "#d6c9b8", roughness: 1 }));
  rug.position.set(0.1, 0.006, -0.55);
  rug.rotation.y = -0.1;
  rug.receiveShadow = true;
  scene.add(rug);

  /* ── Side table: travertine tray, candles, bowl, diffuser ─ */
  const table = new THREE.Group();
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 48), oakMat);
  tableTop.position.y = 0.5;
  table.add(tableTop);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.48, 24), oakMat);
  stem.position.y = 0.24;
  table.add(stem);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 40), oakMat);
  foot.position.y = 0.015;
  table.add(foot);
  const tray = new THREE.Mesh(rbox(0.34, 0.025, 0.2, 0.01), stoneMat);
  tray.position.set(-0.06, 0.533, 0.05);
  table.add(tray);
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.11, 0.02], [0.13, 0.06], [0.125, 0.065], [0.105, 0.03], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 48),
    stoneMat,
  );
  bowl.position.set(0.12, 0.52, -0.1);
  table.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.108, 40), new THREE.MeshPhysicalMaterial({ color: "#8a8f86", roughness: 0.05, metalness: 0.1, clearcoat: 1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0.12, 0.575, -0.1);
  table.add(water);
  const floatFlower = makeFlower();
  floatFlower.position.set(0.14, 0.577, -0.09);
  floatFlower.scale.setScalar(0.9);
  table.add(floatFlower);
  table.position.set(-0.25, 0, 0.72);
  scene.add(shadowed(table));

  const flameTex = flameTexture();
  const waxGlow = waxGlowTexture();
  const candles: Candle[] = [];
  const addCandle = (parent: THREE.Object3D, x: number, y: number, z: number, h: number, r: number) => {
    const wax = new THREE.MeshStandardMaterial({ color: "#f2e7d6", roughness: 0.5, emissive: "#ff8a3c", emissiveMap: waxGlow, emissiveIntensity: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1), wax);
    body.position.set(x, y + h / 2, z);
    body.receiveShadow = true;
    body.name = `candle:${candles.length}`;
    parent.add(body);
    pickables.push(body);
    // melted lip at the top
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 10, 40), wax);
    lip.rotation.x = Math.PI / 2;
    lip.position.set(x, y + h - r * 0.08, z);
    parent.add(lip);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.016, 6), std({ color: "#15110d" }));
    wick.position.set(x, y + h + 0.006, z);
    parent.add(wick);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(3, 2.4, 1.8), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const bs = new THREE.Vector2(0.03 + r * 0.2, 0.07 + r * 0.4);
    flame.scale.set(bs.x, bs.y, 1);
    flame.position.set(x, y + h + bs.y * 0.36, z);
    parent.add(flame);
    candles.push({ flame, wax, baseScale: bs, seed: rand() * 100, gust: 0 });
  };
  addCandle(table, -0.14, 0.545, 0.06, 0.2, 0.042);
  addCandle(table, -0.04, 0.545, 0.02, 0.13, 0.038);
  addCandle(table, 0.04, 0.545, 0.09, 0.09, 0.034);
  // a single low candle on the floor by the window
  addCandle(scene, -2.55, 0, 0.55, 0.16, 0.055);

  const candleLight = new THREE.PointLight("#ff9a52", 1.4, 3.5, 1.8);
  candleLight.position.set(-0.29, 0.82, 0.75);
  scene.add(candleLight);
  const floorCandleLight = new THREE.PointLight("#ff9a52", 0.5, 2.2, 2);
  floorCandleLight.position.set(-2.55, 0.35, 0.55);
  scene.add(floorCandleLight);

  const diffuser = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.075, 0.03], [0.078, 0.1], [0.06, 0.15], [0.022, 0.18], [0.018, 0.19], [0, 0.19]].map(([a, b]) => new THREE.Vector2(a, b)), 48),
    ceramicSage,
  );
  diffuser.name = "diffuser";
  diffuser.position.set(-0.4, 0.52, 0.55);
  diffuser.castShadow = diffuser.receiveShadow = true;
  scene.add(diffuser);
  pickables.push(diffuser);

  /* ── Paper lantern (Akari-style) ────────────────────────── */
  const lanternPos = new THREE.Vector3(0.62, 2.02, -1.75);
  const paper = new THREE.MeshPhysicalMaterial({ color: "#fff6e8", roughness: 1, emissive: "#ffcf96", emissiveIntensity: 0.62, sheen: 1 });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.26, 48, 32), paper);
  lantern.scale.y = 0.92;
  lantern.position.copy(lanternPos);
  scene.add(lantern);
  // bamboo ribs
  for (let i = 1; i < 9; i++) {
    const y = -0.24 + i * 0.053;
    const rr = Math.sqrt(Math.max(0, 0.26 * 0.26 - (y / 0.92) * (y / 0.92))) + 0.002;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0022, 6, 64), std({ color: "#a88a62", roughness: 0.8 }));
    rib.rotation.x = Math.PI / 2;
    rib.position.set(lanternPos.x, lanternPos.y + y, lanternPos.z);
    scene.add(rib);
  }
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, ROOM.h - lanternPos.y - 0.24, 6), std({ color: "#1a1612" }));
  cord.position.set(lanternPos.x, (ROOM.h + lanternPos.y + 0.24) / 2, lanternPos.z);
  scene.add(cord);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
  const lanternLight = new THREE.PointLight("#ffc382", 2.6, 7, 1.6);
  lanternLight.position.copy(lanternPos);
  scene.add(lanternLight);

  /* ── One sculptural plant: areca palm in a travertine planter ─ */
  const leaves: RoomHandles["leaves"] = [];
  const leafletMat = new THREE.MeshStandardMaterial({ map: leafletTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
  const leafletGeo = new THREE.PlaneGeometry(0.028, 0.26, 1, 4);
  leafletGeo.translate(0, 0.13, 0);
  const plant = new THREE.Group();
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.56, 48), stoneMat);
  planter.position.y = 0.28;
  plant.add(planter);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.245, 32), std({ color: "#2a1f16", roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.555;
  plant.add(soil);
  const stemMat = std({ color: "#6b7a3a", roughness: 0.7 });
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const pitch = 0.25 + rand() * 0.55;
    const len = 1.0 + rand() * 0.55;
    const frond = new THREE.Group();
    frond.position.y = 0.56;
    frond.rotation.set(0, yaw, 0);
    // arching stem
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, len * 0.75, Math.sin(pitch) * len * 0.35),
      new THREE.Vector3(0, len * Math.cos(pitch) * 0.95, Math.sin(pitch) * len),
    );
    frond.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 5), stemMat));
    // all leaflets of a frond merged into one draw call
    const parts: THREE.BufferGeometry[] = [];
    for (let q = 0.18; q < 0.98; q += 0.045) {
      const pt = curve.getPoint(q);
      const tan = curve.getTangent(q);
      for (const side of [-1, 1]) {
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * (0.9 + q * 0.4)));
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25 + q * 0.4));
        const sc = 0.55 + Math.sin(q * Math.PI) * 0.6;
        parts.push(leafletGeo.clone().applyMatrix4(new THREE.Matrix4().compose(pt, quat, new THREE.Vector3(1, sc, 1))));
      }
    }
    frond.add(new THREE.Mesh(mergeGeometries(parts), leafletMat));
    plant.add(frond);
    leaves.push({ mesh: frond, base: frond.rotation.clone(), seed: rand() * 10 });
  }
  plant.position.set(1.95, 0, -2.05);
  scene.add(shadowed(plant));

  /* ── Steam & dust ───────────────────────────────────────── */
  const soft = softTexture();
  const steamOrigin = diffuser.position.clone().add(new THREE.Vector3(0, 0.2, 0));
  const steamSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 38; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: "#f6f2ec", transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { phase: i / 38, seed: rand() * 10 };
    scene.add(s);
    steamSprites.push(s);
  }
  const dustN = 140;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    // concentrated in the window's light
    dustPos[i * 3] = ROOM.x0 + 0.3 + rand() * 2.6;
    dustPos[i * 3 + 1] = 0.3 + rand() * 2.3;
    dustPos[i * 3 + 2] = WIN.z0 + rand() * (WIN.z1 - WIN.z0);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ map: soft, size: 0.014, color: new THREE.Color(1.4, 1.25, 1.05), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  scene.add(dust);

  /* ── Ambient ────────────────────────────────────────────── */
  scene.add(new THREE.HemisphereLight("#b4c0d8", "#6b5540", 0.35));
  const fill = new THREE.PointLight("#ffe2c4", 0.7, 8, 1.2);
  fill.position.set(1.2, 1.9, 3.4);
  scene.add(fill);

  return {
    scene,
    camera: { position: new THREE.Vector3(0.55, 1.62, 5.1), target: new THREE.Vector3(0.02, 0.86, -0.95), focus: 5.75 },
    candles,
    candleLights: [
      { light: candleLight, base: 1.4, members: [0, 1, 2] },
      { light: floorCandleLight, base: 0.5, members: [3] },
    ],
    pendant: { light: lanternLight, bulb: bulbMat, base: 2.6 },
    steam: { sprites: steamSprites, origin: steamOrigin, burst: 0 },
    dust,
    leaves,
    curtains,
    pickables,
  };
}
