import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import type { Candle, RoomHandles } from "./build";
import { flameTexture, leafletTexture, plasterTexture, softTexture, travertineTexture, waxGlowTexture, woodTexture } from "./textures";

/**
 * "Reception" — the front desk of a calm Thai wellness clinic, evening.
 * Fluted travertine desk under three warm pendants, an oak-slat feature wall with a
 * backlit ThaiWell sign, a lit retail niche, an areca palm and a boucle lounge corner.
 * Units: metres. Camera stands in the lobby facing the desk.
 */

const rand = (() => {
  let s = 777;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
})();
const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
const rbox = (w: number, h: number, d: number, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, color = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Large-format travertine floor tiles with fine grout. */
function tileTexture() {
  const S = 2048;
  const r = (() => {
    let s = 31;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  })();
  return canvasTex(S, S, (g) => {
    const n = 2;
    const T = S / n;
    for (let ty = 0; ty < n; ty++)
      for (let tx = 0; tx < n; tx++) {
        const x0 = tx * T;
        const y0 = ty * T;
        g.fillStyle = `hsl(${36 + r() * 4} ${22 + r() * 6}% ${80 + r() * 4}%)`;
        g.fillRect(x0, y0, T, T);
        for (let i = 0; i < 70; i++) {
          const y = y0 + r() * T;
          g.strokeStyle = `rgba(${150 + r() * 40},${128 + r() * 30},${100 + r() * 25},${0.06 + r() * 0.1})`;
          g.lineWidth = 1 + r() * 6;
          g.beginPath();
          g.moveTo(x0, y);
          for (let x = 0; x <= T; x += 48) g.lineTo(x0 + x, y + Math.sin((x + i * 37) * 0.012) * 6);
          g.stroke();
        }
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(120,100,75,${0.12 + r() * 0.2})`;
          g.beginPath();
          g.ellipse(x0 + r() * T, y0 + r() * T, 1 + r() * 4, 0.6 + r() * 1.2, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(110,95,78,0.9)";
        g.fillRect(x0, y0, T, 3);
        g.fillRect(x0, y0, 3, T);
      }
  });
}

/** Brushed-brass "ThaiWell" letters on transparent ground (sign face) + its soft halo. */
function signTexture() {
  return canvasTex(2048, 512, (g) => {
    g.clearRect(0, 0, 2048, 512);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#f1d9a6";
    g.font = '300 220px "Didot", "Bodoni 72", "Playfair Display", Georgia, serif';
    // manual tracking for an airy logotype
    const word = "THAIWELL";
    const track = 34;
    const widths = [...word].map((ch) => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (word.length - 1);
    let x = 1024 - total / 2;
    [...word].forEach((ch, i) => {
      g.fillText(ch, x + widths[i] / 2, 230);
      x += widths[i] + track;
    });
    g.font = '400 54px "Avenir Next", Inter, "Helvetica Neue", sans-serif';
    const sub = "W E L L N E S S   ·   T H A I   M A S S A G E";
    g.fillStyle = "#cdb185";
    g.fillText(sub, 1024, 400);
  });
}

export function buildReception(): RoomHandles & { tick: (t: number) => void; entrance: Entrance } {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#120d09");

  const R = { x0: -4.2, x1: 4.2, zBack: -2.4, zFront: 6.5, h: 3.2 };

  /* ── Materials ──────────────────────────────────────────── */
  const plaster = plasterTexture();
  // smooth limewash: only a whisper of trowel relief, no colour blotches
  const wallMat = std({ bumpMap: plaster.bump, bumpScale: 0.06, roughness: 0.9, color: "#ddd2c2" });
  const tiles = tileTexture();
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(4.2, 4.4);
  const floorMat = new THREE.MeshPhysicalMaterial({ map: tiles, roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.07, color: "#efe4d2" });
  const oakTex = woodTexture({ vertical: true, plank: 1024, base: [30, 34, 54], seed: 12, size: 1024, joints: false });
  const oakMat = std({ map: oakTex.map, bumpMap: oakTex.map, bumpScale: 0.4, roughness: 0.5, color: "#ead2b2" });
  const stoneTex = canvasTex(1024, 1024, (g) => {
    g.fillStyle = "#e7dccb";
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 140; i++) {
      const y = rand() * 1024;
      g.strokeStyle = `rgba(${150 + rand() * 40},${130 + rand() * 30},${100 + rand() * 30},${0.07 + rand() * 0.1})`;
      g.lineWidth = 1 + rand() * 5;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
      g.stroke();
    }
  });
  const stoneMat = std({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.6, roughness: 0.42, color: "#f3e9d8" });
  const brassMat = std({ color: "#c9a46a", metalness: 1, roughness: 0.32 });
  const boucle = canvasTex(512, 512, (g) => {
    g.fillStyle = "#efe8dc";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${200 + rand() * 40},${190 + rand() * 40},${170 + rand() * 40},${0.25 + rand() * 0.4})`;
      g.beginPath();
      g.arc(rand() * 512, rand() * 512, 1 + rand() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
  });
  boucle.wrapS = boucle.wrapT = THREE.RepeatWrapping;
  boucle.repeat.set(3, 3);
  const boucleMat = new THREE.MeshPhysicalMaterial({ map: boucle, bumpMap: boucle, bumpScale: 3, color: "#f4eee4", roughness: 1, sheen: 1, sheenColor: new THREE.Color("#fffaf2") });

  /* ── Shell ──────────────────────────────────────────────── */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.zFront - R.zBack), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (R.zBack + R.zFront) / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.h), wallMat);
  back.position.set(0, R.h / 2, R.zBack);
  back.receiveShadow = true;
  scene.add(back);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(R.zFront - R.zBack, R.h), wallMat);
    w.rotation.y = -side * Math.PI / 2;
    w.position.set(side * R.x1, R.h / 2, (R.zBack + R.zFront) / 2);
    w.receiveShadow = true;
    w.castShadow = true; // keeps daylight from the street out of the lobby
    scene.add(w);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.zFront - R.zBack), std({ color: "#d8cdbf", roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, R.h, (R.zBack + R.zFront) / 2);
  ceiling.castShadow = true;
  scene.add(ceiling);

  /* ── Feature wall: oak slats + backlit sign ─────────────── */
  const panelW = 4.4;
  const slatW = 0.042;
  const gap = 0.024;
  const n = Math.floor(panelW / (slatW + gap));
  const slats = new THREE.InstancedMesh(rbox(slatW, R.h - 0.02, 0.04, 0.006, 2), oakMat, n);
  const m4 = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (let i = 0; i < n; i++) {
    m4.makeTranslation(-panelW / 2 + i * (slatW + gap) + slatW / 2, (R.h - 0.02) / 2, R.zBack + 0.06);
    slats.setMatrixAt(i, m4);
    slats.setColorAt(i, tint.setHSL(0.08, 0.18, 0.88 + (rand() - 0.5) * 0.06));
  }
  slats.castShadow = slats.receiveShadow = true;
  scene.add(slats);
  const slatBack = new THREE.Mesh(new THREE.PlaneGeometry(panelW, R.h), std({ color: "#2a2018", roughness: 1 }));
  slatBack.position.set(0, R.h / 2, R.zBack + 0.015);
  scene.add(slatBack);
  // floor & ceiling grazing lights along the slat wall
  for (const [y, look] of [[0.03, R.h], [R.h - 0.03, 0]] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.25), toneMapped: false }));
    strip.position.set(0, y, R.zBack + 0.12);
    scene.add(strip);
    const L = new THREE.RectAreaLight("#ffc890", 4.5, panelW, 0.08);
    L.position.set(0, y, R.zBack + 0.16);
    L.lookAt(0, look, R.zBack + 0.02);
    scene.add(L);
  }
  // sign panel: travertine slab floating off the slats, letters with a warm halo behind
  const signY = 2.58;
  const slab = new THREE.Mesh(rbox(2.3, 0.62, 0.06, 0.012), std({ color: "#2a241f", roughness: 0.55 }));
  slab.position.set(0, signY, R.zBack + 0.14);
  scene.add(shadowed(slab));
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 1.15),
    new THREE.MeshBasicMaterial({ map: softTexture(), color: new THREE.Color(1.6, 1.05, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }),
  );
  halo.position.set(0, signY, R.zBack + 0.105);
  scene.add(halo);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.525),
    new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, color: new THREE.Color(1.35, 1.2, 1.0) }),
  );
  sign.position.set(0, signY, R.zBack + 0.172);
  scene.add(sign);

  /* ── Reception desk: fluted travertine, oak plinth gap ──── */
  const desk = new THREE.Group();
  const DW = 2.8;
  const DH = 1.05;
  const DD = 0.7;
  const core = new THREE.Mesh(rbox(DW - 0.04, DH - 0.12, DD - 0.06, 0.02), stoneMat);
  core.position.y = 0.12 + (DH - 0.12) / 2;
  desk.add(core);
  // fluting on the front face
  const fluteR = 0.022;
  const flutes = Math.floor((DW - 0.08) / (fluteR * 2));
  const fluteGeo = new THREE.CylinderGeometry(fluteR, fluteR, DH - 0.14, 16, 1, false, -Math.PI / 2, Math.PI);
  const fl = new THREE.InstancedMesh(fluteGeo, stoneMat, flutes);
  for (let i = 0; i < flutes; i++) {
    m4.makeTranslation(-DW / 2 + 0.04 + fluteR + i * fluteR * 2, 0.12 + (DH - 0.12) / 2, DD / 2 - 0.035);
    fl.setMatrixAt(i, m4);
  }
  desk.add(fl);
  const counter = new THREE.Mesh(rbox(DW + 0.08, 0.05, DD + 0.08, 0.012), stoneMat);
  counter.position.y = DH + 0.025;
  desk.add(counter);
  const plinth = new THREE.Mesh(rbox(DW - 0.2, 0.12, DD - 0.2, 0.01), std({ color: "#2b211a", roughness: 0.9 }));
  plinth.position.y = 0.06;
  desk.add(plinth);
  // LED under the desk lighting the floor
  const toe = new THREE.Mesh(new THREE.BoxGeometry(DW - 0.2, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 1.1), toneMapped: false }));
  toe.position.set(0, 0.115, DD / 2 - 0.09);
  desk.add(toe);
  // brass inlay line under the counter
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(DW, 0.012, 0.012), brassMat);
  inlay.position.set(0, DH - 0.012, DD / 2 + 0.002);
  desk.add(inlay);
  desk.position.set(0, 0, -0.55);
  scene.add(shadowed(desk));
  const toeLight = new THREE.RectAreaLight("#ffc68d", 3, DW - 0.2, 0.05);
  toeLight.position.set(0, 0.1, -0.55 + DD / 2 - 0.05);
  toeLight.lookAt(0, 0, 0.6);
  scene.add(toeLight);

  const deskTop = DH + 0.05;
  const deskZ = -0.55;

  /* ── On the counter: orchids, candles, diffuser, tray ───── */
  const pickables: THREE.Object3D[] = [];
  const orchid = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.15, 40), std({ color: "#f3efe8", roughness: 0.35 }));
  pot.position.y = 0.075;
  orchid.add(pot);
  const moss = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), std({ color: "#5d6b3a", roughness: 1 }));
  moss.rotation.x = -Math.PI / 2;
  moss.position.y = 0.145;
  orchid.add(moss);
  const stemMat = std({ color: "#4f6b2c", roughness: 0.6 });
  const petal = new THREE.MeshPhysicalMaterial({ color: "#fffdf9", roughness: 0.45, sheen: 0.8, sheenColor: new THREE.Color("#ffffff") });
  const lip = std({ color: "#e7b8c4", roughness: 0.5 });
  const flowerGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const pg = new THREE.SphereGeometry(1, 14, 8);
    // 3 sepals + 2 broad petals
    const spec: [number, number, number][] = [[0, 0.028, 0.02], [2.1, 0.028, 0.02], [-2.1, 0.028, 0.02], [1.05, 0.034, 0.032], [-1.05, 0.034, 0.032]];
    for (const [a, len, wid] of spec) {
      const g = pg.clone();
      g.scale(wid, len, 0.004);
      g.translate(0, len * 0.8, 0);
      g.rotateZ(a);
      parts.push(g);
    }
    return mergeGeometries(parts);
  })();
  for (const [lean, h, turn] of [[0.15, 0.62, 0.3], [-0.2, 0.52, -0.6]] as const) {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0.14, 0),
      new THREE.Vector3(lean * 0.2, h * 0.6, 0),
      new THREE.Vector3(lean * 0.9, h * 0.95, 0.02),
      new THREE.Vector3(lean * 1.8, h * 0.88, 0.06),
    );
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0035, 6), stemMat);
    stem.rotation.y = turn;
    orchid.add(stem);
    for (let k = 0; k < 6; k++) {
      const q = 0.55 + k * 0.08;
      const p = curve.getPoint(Math.min(q, 1));
      const f = new THREE.Mesh(flowerGeo, petal);
      f.position.copy(p).add(new THREE.Vector3(0, -0.02, 0.025));
      f.rotation.set(-0.15 + rand() * 0.2, rand() * 0.4 - 0.2, rand() * 0.5);
      f.scale.setScalar(1 - k * 0.06);
      const holder = new THREE.Group();
      holder.rotation.y = turn;
      holder.add(f);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), lip);
      l.position.copy(f.position).add(new THREE.Vector3(0, -0.006, 0.006));
      holder.add(l);
      orchid.add(holder);
    }
  }
  // two leaves at the base
  for (const a of [0.4, 2.6]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), std({ color: "#2f5a2a", roughness: 0.4 }));
    leaf.scale.set(0.05, 0.006, 0.13);
    leaf.position.set(Math.sin(a) * 0.08, 0.16, Math.cos(a) * 0.08);
    leaf.rotation.y = a;
    orchid.add(leaf);
  }
  orchid.position.set(-0.95, deskTop, deskZ - 0.05);
  scene.add(shadowed(orchid));

  const flameTex = flameTexture();
  const waxGlow = waxGlowTexture();
  const candles: Candle[] = [];
  const addCandle = (x: number, y: number, z: number, h: number, r: number) => {
    const wax = new THREE.MeshStandardMaterial({ color: "#f2e7d6", roughness: 0.5, emissive: "#ff8a3c", emissiveMap: waxGlow, emissiveIntensity: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1), wax);
    body.position.set(x, y + h / 2, z);
    body.receiveShadow = true;
    body.name = `candle:${candles.length}`;
    scene.add(body);
    pickables.push(body);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.016, 6), std({ color: "#15110d" }));
    wick.position.set(x, y + h + 0.006, z);
    scene.add(wick);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(3, 2.4, 1.8), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const bs = new THREE.Vector2(0.03 + r * 0.2, 0.07 + r * 0.4);
    flame.scale.set(bs.x, bs.y, 1);
    flame.position.set(x, y + h + bs.y * 0.36, z);
    scene.add(flame);
    candles.push({ flame, wax, baseScale: bs, seed: rand() * 100, gust: 0 });
  };
  const tray = new THREE.Mesh(rbox(0.36, 0.02, 0.18, 0.008), brassMat);
  tray.position.set(0.55, deskTop + 0.01, deskZ);
  scene.add(shadowed(tray));
  addCandle(0.45, deskTop + 0.02, deskZ, 0.14, 0.04);
  addCandle(0.56, deskTop + 0.02, deskZ + 0.02, 0.09, 0.035);
  const diffuser = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.065, 0.03], [0.066, 0.09], [0.05, 0.13], [0.018, 0.155], [0, 0.155]].map(([a, b]) => new THREE.Vector2(a, b)), 48),
    std({ color: "#a5ab93", roughness: 0.45 }),
  );
  diffuser.name = "diffuser";
  diffuser.position.set(0.72, deskTop + 0.02, deskZ - 0.02);
  diffuser.castShadow = true;
  scene.add(diffuser);
  pickables.push(diffuser);
  // tablet on a stand for check-in
  const tablet = new THREE.Group();
  const frame = new THREE.Mesh(rbox(0.26, 0.18, 0.01, 0.012), std({ color: "#1b1b1d", roughness: 0.3, metalness: 0.4 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.236, 0.156), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.9, 0.82) }));
  screen.position.z = 0.0056;
  tablet.add(frame, screen);
  tablet.rotation.set(-0.35, -0.25, 0);
  tablet.position.set(0.05, deskTop + 0.11, deskZ + 0.1);
  scene.add(shadowed(tablet));
  const deskLight = new THREE.PointLight("#ff9a52", 0.9, 2.4, 1.8);
  deskLight.position.set(0.5, deskTop + 0.35, deskZ + 0.15);
  scene.add(deskLight);

  /* ── Pendants over the desk ─────────────────────────────── */
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.3), toneMapped: false });
  // recessed downlights flush with the ceiling (nothing hangs into the view)
  for (const x of [-0.9, 0, 0.9]) {
    const trim = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.06, 32), brassMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(x, R.h - 0.002, deskZ + 0.05);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 32), bulbMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, R.h - 0.003, deskZ + 0.05);
    scene.add(trim, lens);
  }
  for (const x of [-0.9, 0, 0.9]) {
    const spot = new THREE.SpotLight("#ffc98f", 3.2, 5, 0.42, 0.8, 1.4);
    spot.position.set(x, R.h - 0.02, deskZ + 0.05);
    spot.target.position.set(x, 0, deskZ + 0.15);
    scene.add(spot, spot.target);
  }
  const pendantLight = new THREE.PointLight("#ffc382", 1.6, 6, 1.5);
  pendantLight.position.set(0, R.h - 0.3, deskZ + 0.6);
  scene.add(pendantLight);

  /* ── Retail niche (right wall) with amber bottles ───────── */
  const niche = new THREE.Group();
  const nicheBack = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), std({ color: "#e9ddcd", roughness: 1 }));
  niche.add(nicheBack);
  const amber = new THREE.MeshPhysicalMaterial({ color: "#8a4b1c", roughness: 0.15, transmission: 0.3, thickness: 0.05, clearcoat: 1 });
  const capMat = std({ color: "#1d1a17", roughness: 0.5 });
  const label = std({ color: "#efe6d6", roughness: 0.8 });
  for (let s = 0; s < 3; s++) {
    const y = -0.55 + s * 0.48;
    const shelf = new THREE.Mesh(rbox(1.1, 0.03, 0.26, 0.006), oakMat);
    shelf.position.set(0, y, 0.13);
    niche.add(shelf);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.2), toneMapped: false }));
    glow.position.set(0, y + 0.43, 0.25);
    glow.rotation.x = Math.PI / 2;
    niche.add(glow);
    const count = 4 + (s % 2);
    for (let b = 0; b < count; b++) {
      const bh = 0.16 + ((b + s) % 3) * 0.03;
      const bx = -0.38 + b * (0.76 / (count - 1));
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, bh, 24), amber);
      bottle.position.set(bx, y + 0.015 + bh / 2, 0.13);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 16), capMat);
      c.position.set(bx, y + 0.015 + bh + 0.02, 0.13);
      const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0355, bh * 0.45, 24, 1, true), label);
      lb.position.copy(bottle.position);
      niche.add(bottle, c, lb);
    }
  }
  niche.position.set(R.x1 - 0.02, 1.3, 1.3);
  niche.rotation.y = -Math.PI / 2;
  scene.add(shadowed(niche));
  const nicheLight = new THREE.RectAreaLight("#ffcf9a", 3, 1.0, 0.1);
  nicheLight.position.set(R.x1 - 0.2, 2.0, 1.3);
  nicheLight.lookAt(R.x1 - 0.2, 0, 1.3);
  scene.add(nicheLight);

  /* ── Lounge corner (left): boucle chairs, round table ───── */
  const chair = () => {
    const c = new THREE.Group();
    const seat = new THREE.Mesh(rbox(0.78, 0.36, 0.72, 0.16, 6), boucleMat);
    seat.position.y = 0.3;
    c.add(seat);
    const backRest = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 20, 48, Math.PI), boucleMat);
    backRest.rotation.x = -Math.PI / 2;
    backRest.position.set(0, 0.52, 0.02);
    backRest.scale.set(1, 0.85, 1.2);
    c.add(backRest);
    return shadowed(c);
  };
  const c1 = chair();
  c1.position.set(-2.75, 0, 1.3);
  c1.rotation.y = 0.6;
  const c2 = chair();
  c2.position.set(-2.95, 0, 2.7);
  c2.rotation.y = 1.4;
  scene.add(c1, c2);
  const ctable = new THREE.Group();
  const ctop = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 48), stoneMat);
  ctop.position.y = 0.4;
  const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.38, 32), oakMat);
  cbase.position.y = 0.19;
  ctable.add(ctop, cbase);
  ctable.position.set(-2.2, 0, 2.15);
  scene.add(shadowed(ctable));

  /* ── Areca palm in a stone planter ──────────────────────── */
  const leaves: RoomHandles["leaves"] = [];
  const leafletMat = new THREE.MeshStandardMaterial({ map: leafletTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
  const leafletGeo = new THREE.PlaneGeometry(0.028, 0.26, 1, 4);
  leafletGeo.translate(0, 0.13, 0);
  const plant = new THREE.Group();
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.6, 48), stoneMat);
  planter.position.y = 0.3;
  plant.add(planter);
  const stemMat2 = std({ color: "#6b7a3a", roughness: 0.7 });
  for (let f = 0; f < 12; f++) {
    const yaw = (f / 12) * Math.PI * 2 + rand() * 0.4;
    const pitch = 0.25 + rand() * 0.55;
    const len = 1.1 + rand() * 0.6;
    const frond = new THREE.Group();
    frond.position.y = 0.6;
    frond.rotation.set(0, yaw, 0);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, len * 0.75, Math.sin(pitch) * len * 0.35),
      new THREE.Vector3(0, len * Math.cos(pitch) * 0.95, Math.sin(pitch) * len),
    );
    frond.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 5), stemMat2));
    const parts: THREE.BufferGeometry[] = [];
    for (let q = 0.18; q < 0.98; q += 0.045) {
      const pt = curve.getPoint(q);
      const tan = curve.getTangent(q);
      for (const side of [-1, 1]) {
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * (0.9 + q * 0.4)));
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25 + q * 0.4));
        parts.push(leafletGeo.clone().applyMatrix4(new THREE.Matrix4().compose(pt, quat, new THREE.Vector3(1, 0.55 + Math.sin(q * Math.PI) * 0.6, 1))));
      }
    }
    frond.add(new THREE.Mesh(mergeGeometries(parts), leafletMat));
    plant.add(frond);
    leaves.push({ mesh: frond, base: frond.rotation.clone(), seed: rand() * 10 });
  }
  plant.position.set(2.35, 0, -1.7);
  scene.add(shadowed(plant));

  /* ── Rug in the lobby ───────────────────────────────────── */
  const rug = new THREE.Mesh(rbox(3.2, 0.012, 2.1, 0.006, 2), std({ map: boucle, color: "#d9ccba", roughness: 1 }));
  rug.position.set(0, 0.006, 2.1);
  rug.receiveShadow = true;
  scene.add(rug);

  /* ── Detail: shadow-gap skirting, ceiling slot, wall washers ─ */
  const gapMat = std({ color: "#1a140f", roughness: 1 });
  for (const side of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, R.zFront - R.zBack), gapMat);
    g.position.set(side * (R.x1 - 0.004), 0.007, (R.zBack + R.zFront) / 2);
    scene.add(g);
  }

  /* ── Detail: framed ink artwork on the left wall ──────────── */
  const art = canvasTex(1024, 1280, (g) => {
    g.fillStyle = "#efe7da";
    g.fillRect(0, 0, 1024, 1280);
    // paper fibres
    for (let i = 0; i < 3000; i++) {
      g.strokeStyle = `rgba(150,130,100,${0.03 + rand() * 0.04})`;
      g.beginPath();
      const x = rand() * 1024;
      const y = rand() * 1280;
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 20, y + (rand() - 0.5) * 20);
      g.stroke();
    }
    // ensō brush circle
    g.lineCap = "round";
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(40,32,26,${0.05 + rand() * 0.06})`;
      g.lineWidth = 30 + rand() * 40;
      g.beginPath();
      const r = 300 + (rand() - 0.5) * 18;
      g.arc(512, 600, r, -1.3 + rand() * 0.06, 4.55 + rand() * 0.15);
      g.stroke();
    }
    g.fillStyle = "#a2462e";
    g.fillRect(760, 1030, 46, 46);
  });
  const artGroup = new THREE.Group();
  const frameBox = new THREE.Mesh(rbox(1.02, 1.26, 0.04, 0.006), oakMat);
  const canvasM = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.14), std({ map: art, roughness: 0.95 }));
  canvasM.position.z = 0.021;
  artGroup.add(frameBox, canvasM);
  artGroup.position.set(R.x0 + 0.03, 1.55, 3.4);
  artGroup.rotation.y = Math.PI / 2;
  scene.add(shadowed(artGroup));

  /* ── Detail: stone bench + pampas vase by the slat wall ──── */
  const bench = new THREE.Group();
  const bTop = new THREE.Mesh(rbox(1.2, 0.08, 0.4, 0.015), stoneMat);
  bTop.position.y = 0.42;
  bench.add(bTop);
  for (const x of [-0.48, 0.48]) {
    const leg = new THREE.Mesh(rbox(0.12, 0.38, 0.36, 0.012), stoneMat);
    leg.position.set(x, 0.19, 0);
    bench.add(leg);
  }
  const books = [["#c9b79a", 0.035], ["#8a7660", 0.028], ["#e8dfd0", 0.03]] as const;
  let by = 0.46;
  books.forEach(([col, h], i) => {
    const b = new THREE.Mesh(rbox(0.26 - i * 0.02, h, 0.19 - i * 0.01, 0.004), std({ color: col, roughness: 0.8 }));
    b.position.set(-0.3, by + h / 2, 0.02);
    b.rotation.y = (i - 1) * 0.12;
    by += h;
    bench.add(b);
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 32, 20), std({ color: "#2d2a27", roughness: 0.35 }));
  orb.position.set(-0.3, by + 0.06, 0.02);
  orb.scale.y = 0.85;
  bench.add(orb);
  bench.position.set(-2.4, 0, R.zBack + 0.45);
  scene.add(shadowed(bench));

  const vase = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.17, 0.12], [0.18, 0.32], [0.12, 0.56], [0.07, 0.66], [0.075, 0.7], [0, 0.7]].map(([a, b]) => new THREE.Vector2(a, b)), 48),
    std({ color: "#b9a389", roughness: 0.85, bumpMap: stoneTex, bumpScale: 1.5 }),
  );
  vase.position.set(-1.55, 0, R.zBack + 0.42);
  scene.add(shadowed(vase));
  // pampas: arching stems with feathery plumes
  const plumeMat = new THREE.MeshStandardMaterial({ map: softTexture(), color: "#e9dcc4", transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide });
  const stemM = std({ color: "#b49c7a", roughness: 0.9 });
  const plumeGeo = new THREE.PlaneGeometry(0.05, 0.12);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rand();
    const lean = 0.12 + rand() * 0.3;
    const hgt = 1.25 + rand() * 0.45;
    const base = new THREE.Vector3(-1.55, 0.68, R.zBack + 0.42);
    const tip = base.clone().add(new THREE.Vector3(Math.cos(a) * lean, hgt, Math.sin(a) * lean * 0.5));
    const curve = new THREE.QuadraticBezierCurve3(base, base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.1, 0)), tip);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.004, 5), stemM));
    const parts: THREE.BufferGeometry[] = [];
    for (let j = 0; j < 38; j++) {
      const q = 0.68 + (j / 38) * 0.32;
      const pt = curve.getPoint(q);
      const g = plumeGeo.clone();
      g.rotateZ((rand() - 0.5) * 1.2);
      g.rotateY(rand() * Math.PI);
      g.scale(1 + rand() * 0.6, 1 + rand() * 0.8, 1);
      g.translate(pt.x + (rand() - 0.5) * 0.04, pt.y + (rand() - 0.5) * 0.03, pt.z + (rand() - 0.5) * 0.04);
      parts.push(g);
    }
    const plume = new THREE.Mesh(mergeGeometries(parts), plumeMat);
    const pivot = new THREE.Group();
    pivot.add(plume);
    scene.add(pivot);
  }

  /* ── Cinematic: perimeter cove glow + daylight shafts through the glass ── */
  {
    const soft2 = softTexture();
    const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.15), toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({ map: soft2, color: new THREE.Color(1.0, 0.72, 0.45), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, R.zFront - R.zBack - 0.2), led);
      strip.position.set(side * (R.x1 - 0.06), R.h - 0.012, (R.zBack + R.zFront) / 2);
      scene.add(strip);
      const wash = new THREE.Mesh(new THREE.PlaneGeometry(1.0, R.zFront - R.zBack), glowMat);
      wash.rotation.x = Math.PI / 2;
      wash.position.set(side * (R.x1 - 0.4), R.h - 0.004, (R.zBack + R.zFront) / 2);
      scene.add(wash);
      // the same light grazing down the wall
      const graze = new THREE.Mesh(new THREE.PlaneGeometry(R.zFront - R.zBack, 1.4), glowMat);
      graze.rotation.y = -side * Math.PI / 2;
      graze.position.set(side * (R.x1 - 0.005), R.h - 0.5, (R.zBack + R.zFront) / 2);
      scene.add(graze);
    }
    // god rays: soft additive blades along the sun's direction, entering through the front glass
    const sunDir = new THREE.Vector3(0.5 + 7.5, 0.6 - 4.6, R.zBack + 1 - (R.zFront + 0.32 + 12)).normalize();
    const rayMat = new THREE.MeshBasicMaterial({ map: soft2, color: new THREE.Color(1.0, 0.86, 0.66), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const up = new THREE.Vector3(0, 1, 0);
    for (const [x, w] of [
      [-2.6, 1.2],
      [-0.9, 0.9],
      [1.0, 1.4],
    ] as [number, number][]) {
      const len = 7.5;
      for (const twist of [0, Math.PI / 2]) {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(w, len), rayMat);
        const start = new THREE.Vector3(x, 2.4, R.zFront - 0.05);
        ray.position.copy(start).addScaledVector(sunDir, len / 2);
        ray.quaternion.setFromUnitVectors(up, sunDir.clone().negate());
        ray.rotateY(twist);
        ray.userData.fx = true;
        scene.add(ray);
      }
    }
  }

  /* ── Lights ─────────────────────────────────────────────── */
  scene.add(new THREE.HemisphereLight("#f2ebe2", "#b39a7e", 1.1));
  const key = new THREE.SpotLight("#ffe2c0", 7, 10, 0.75, 1.0, 1.2);
  key.position.set(1.4, R.h - 0.05, 2.6);
  key.target.position.set(0, 0.8, -0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 18;
  key.shadow.blurSamples = 24;
  key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  const fill = new THREE.PointLight("#ffe7cc", 1.1, 9, 1.2);
  fill.position.set(-0.8, 2.2, 4.8);
  scene.add(fill);
  // big soft "softbox" from the lobby side: even, shadowless front light
  const softbox = new THREE.RectAreaLight("#fff1e2", 2.2, 6, 2.4);
  softbox.position.set(0, 2.2, 4.6);
  softbox.lookAt(0, 1.0, -1.5);
  scene.add(softbox);

  /* ── Steam & dust ───────────────────────────────────────── */
  const soft = softTexture();
  const steamOrigin = diffuser.position.clone().add(new THREE.Vector3(0, 0.16, 0));
  const steamSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: "#f6f2ec", transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { phase: i / 30, seed: rand() * 10 };
    scene.add(s);
    steamSprites.push(s);
  }
  const dustN = 110;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 4;
    dustPos[i * 3 + 1] = 0.4 + rand() * 2.4;
    dustPos[i * 3 + 2] = -1.5 + rand() * 4;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ map: soft, size: 0.012, color: new THREE.Color(1.4, 1.2, 0.95), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  scene.add(dust);

  const entrance = buildEntrance(scene, R);

  return {
    entrance,
    scene,
    camera: { position: new THREE.Vector3(0.25, 1.58, 5.4), target: new THREE.Vector3(0.0, 1.22, -1.5), focus: 5.9 },
    candles,
    candleLights: [{ light: deskLight, base: 0.9, members: [0, 1] }],
    pendant: { light: pendantLight, bulb: bulbMat, base: 1.6 },
    steam: { sprites: steamSprites, origin: steamOrigin, burst: 0 },
    dust,
    leaves,
    curtains: [],
    pickables,
    tick: () => {},
  };
}

/* ══ Entrance: the clinic's street front, seen before signing in ══════════
   Built in the same scene, on the open front edge of the lobby (z = zFront),
   so the camera can glide from the plaza through the doors to the desk. */
export interface Entrance {
  group: THREE.Group;
  /** 0 = closed, 1 = open */
  setOpen: (f: number) => void;
  tick?: (t: number) => void;
  /** street lights: [outside, inside] intensities — never removed, so no shader recompiles */
  lights: { light: THREE.Light; base: number; inside: number }[];
  /** inside: hide the street, keep the envelope (it casts the window light) */
  setInside: (inside: boolean) => void;
  camera: { position: THREE.Vector3; target: THREE.Vector3; focus: number; via?: THREE.Vector3 };
}

/** a single leaf on transparent ground (alpha-tested card) */
let leafCardTex: THREE.Texture | null = null;
function leafCard() {
  if (leafCardTex) return leafCardTex;
  leafCardTex = canvasTex(64, 128, (g) => {
    g.clearRect(0, 0, 64, 128);
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, "#3e5f2e");
    gr.addColorStop(0.5, "#6f9150");
    gr.addColorStop(1, "#3a5a2b");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(32, 2);
    g.quadraticCurveTo(64, 50, 32, 126);
    g.quadraticCurveTo(0, 50, 32, 2);
    g.fill();
    g.strokeStyle = "rgba(220,235,190,0.45)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(32, 6);
    g.lineTo(32, 122);
    g.stroke();
  });
  return leafCardTex;
}

/** a crown of individual leaf cards inside an ellipsoid — reads far more natural than blobs */
function leafCrown(center: THREE.Vector3, r: THREE.Vector3, count: number, hue = 0) {
  const mat = new THREE.MeshStandardMaterial({ map: leafCard(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  const geo = new THREE.PlaneGeometry(0.11, 0.2);
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // denser toward the outer shell
    const u = Math.pow(rand(), 0.35);
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    p.set(Math.sin(ph) * Math.cos(th) * r.x * u, Math.cos(ph) * r.y * u, Math.sin(ph) * Math.sin(th) * r.z * u).add(center);
    e.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI);
    q.setFromEuler(e);
    const sc = 0.8 + rand() * 0.6;
    m4.compose(p, q, new THREE.Vector3(sc, sc, sc));
    inst.setMatrixAt(i, m4);
    c.setHSL(0.24 + hue + (rand() - 0.5) * 0.05, 0.35 + rand() * 0.2, 0.5 + rand() * 0.25);
    inst.setColorAt(i, c);
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}

/** a bed of ornamental grass: thin bent blades */
function grassBed(x0: number, x1: number, z0: number, z1: number, count: number) {
  const blade = new THREE.PlaneGeometry(0.018, 0.55, 1, 4);
  const pos = blade.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.275;
    pos.setY(i, y);
    pos.setZ(i, y * y * 0.35); // arch
    pos.setX(i, pos.getX(i) * (1 - y / 0.6));
  }
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.7 });
  const inst = new THREE.InstancedMesh(blade, mat, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.3));
    const s = 0.7 + rand() * 0.7;
    m4.compose(new THREE.Vector3(x0 + rand() * (x1 - x0), 0, z0 + rand() * (z1 - z0)), q, new THREE.Vector3(1, s, 1));
    inst.setMatrixAt(i, m4);
    c.setHSL(0.17 + rand() * 0.06, 0.3 + rand() * 0.2, 0.42 + rand() * 0.2);
    inst.setColorAt(i, c);
  }
  inst.castShadow = true;
  return inst;
}

/* ══ Entrance: a contemporary wellness pavilion, daytime ══════════════════
   Built in the same scene on the lobby's open front edge (z = zFront), so the
   camera can glide over the pool, through the doors, to the desk. */
export function buildEntrance(scene: THREE.Scene, R: { x0: number; x1: number; zBack: number; zFront: number; h: number }): Entrance {
  const group = new THREE.Group();
  scene.add(group);
  // the building envelope stays when we're inside (it frames the daylight); the street hides
  const shell = <O extends THREE.Object3D>(o: O) => {
    o.userData.shell = true;
    group.add(o);
    return o;
  };
  const Z = R.zFront;
  const T = 0.32;
  const FZ = Z + T;
  const FW = 14;
  const FH = 4.3;
  const DW = 2.2;
  const DH = 2.7;
  const GL = 4.0; // glass curtain half-width
  const GH = 3.55;

  /* sky */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vP; uniform float uT;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        float y = clamp(vP.y, 0.0, 1.0);
        vec3 top = vec3(0.22, 0.46, 0.8);
        vec3 hor = vec3(0.74, 0.8, 0.86);
        vec3 c = mix(hor, top, pow(smoothstep(0.0, 0.75, y), 0.8));
        vec2 uv = vP.xz / max(vP.y, 0.08) * 1.4 + vec2(uT * 0.006, 0.0);
        float f = fbm(uv * 1.1);
        float cl = smoothstep(0.54, 0.76, f);
        vec3 cloud = mix(vec3(0.82, 0.84, 0.88), vec3(1.0), smoothstep(0.56, 0.85, f));
        c = mix(c, cloud, cl * 0.85 * smoothstep(0.04, 0.24, y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMat);
  sky.position.set(0, 0, 8);
  group.add(sky);
  scene.fog = new THREE.Fog("#dfe3e4", 45, 160);

  /* materials */
  const trav = travertineTexture();
  trav.wrapS = trav.wrapT = THREE.RepeatWrapping;
  trav.repeat.set(0.55, 0.7);
  const travMat = std({ map: trav, bumpMap: trav, bumpScale: 0.35, color: "#f1e9dc", roughness: 0.6 });
  const oakTex = woodTexture({ vertical: true, plank: 512, base: [36, 30, 70], seed: 33, size: 512, joints: false });
  const oak = std({ map: oakTex.map, color: "#f0d9b8", roughness: 0.5 });
  const white = std({ color: "#f6f4f0", roughness: 0.55 });
  const black = std({ color: "#1c1c1c", roughness: 0.4, metalness: 0.6 });
  const brass = std({ color: "#c9a46a", metalness: 1, roughness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#c4d2d6", roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.18, envMapIntensity: 3, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const paveTex = tileTexture();
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping;
  paveTex.repeat.set(8, 5);
  const paveMat = std({ map: paveTex, color: "#e6dfd2", roughness: 0.55 });

  /* ground: large pale pavers, lawn beyond */
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), paveMat);
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(0, 0, FZ + 8);
  pave.receiveShadow = true;
  group.add(pave);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(100, 60), std({ color: "#7d9a5c", roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.01, FZ + 30);
  group.add(lawn);

  /* facade: travertine with a full-height glass front */
  const shape = new THREE.Shape();
  shape.moveTo(-FW / 2, 0);
  shape.lineTo(FW / 2, 0);
  shape.lineTo(FW / 2, FH);
  shape.lineTo(-FW / 2, FH);
  shape.closePath();
  const h = new THREE.Path();
  h.moveTo(-GL, 0);
  h.lineTo(-GL, GH);
  h.lineTo(GL, GH);
  h.lineTo(GL, 0);
  h.closePath();
  shape.holes.push(h);
  const facade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false }), travMat);
  facade.position.z = Z;
  shell(shadowed(facade));
  // fixed glazing either side of the doors, slim black mullions
  for (const sx of [-1, 1]) {
    const w = GL - DW / 2;
    const cx = sx * (DW / 2 + w / 2);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, GH), glass);
    pane.position.set(cx, GH / 2, Z + T * 0.5);
    shell(pane);
    for (const mx of [DW / 2, DW / 2 + w / 2, GL]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.045, GH, 0.08), black);
      m.position.set(sx * mx, GH / 2, Z + T * 0.5);
      shell(m);
    }
  }
  const transom = new THREE.Mesh(new THREE.BoxGeometry(GL * 2, 0.05, 0.08), black);
  transom.position.set(0, DH, Z + T * 0.5);
  shell(transom);
  const head = new THREE.Mesh(new THREE.BoxGeometry(GL * 2, 0.06, 0.08), black);
  head.position.set(0, GH - 0.03, Z + T * 0.5);
  shell(head);
  // the lobby ceiling is lower than the glass head: close the gap with a soffit
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(GL * 2, GH - R.h + 0.02), std({ color: "#ece6dc", roughness: 0.9 }));
  fill.position.set(0, (GH + R.h) / 2, Z + 0.03);
  shell(fill);
  const transomGlass = new THREE.Mesh(new THREE.PlaneGeometry(DW, GH - DH), glass);
  transomGlass.position.set(0, (GH + DH) / 2, Z + T * 0.5);
  shell(transomGlass);

  /* light-oak louvres on the right wing, brass letters on the left */
  {
    const n = 26;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, FH - 0.2, 0.16), oak, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m4.makeTranslation(GL + 0.35 + i * 0.105, (FH - 0.2) / 2, FZ + 0.09);
      inst.setMatrixAt(i, m4);
    }
    inst.castShadow = inst.receiveShadow = true;
    shell(inst);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: signTexture(), transparent: true, metalness: 0.7, roughness: 0.3, color: "#a9844c" }));
  sign.position.set(-(GL + 1.55), 2.35, FZ + 0.012);
  shell(sign);

  /* cantilevered roof slab with a warm linear light in its soffit */
  const roof = new THREE.Mesh(rbox(FW + 1.2, 0.34, 4.4, 0.03), white);
  roof.position.set(0, FH + 0.17, FZ + 2.2 - 2.0);
  shell(shadowed(roof));
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(FW - 1, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.3), toneMapped: false }));
  strip.rotation.x = Math.PI / 2;
  strip.position.set(0, FH - 0.001, FZ + 1.9);
  shell(strip);
  // two slim black columns carry the cantilever
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.12, FH, 0.12), black);
    col.position.set(sx * (FW / 2 - 0.4), FH / 2, FZ + 2.05);
    shell(shadowed(col));
  }

  /* doors: tall glass in black frames, long brass pulls — swing inwards */
  const leaves: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * DW * 0.5, 0, Z + T * 0.5);
    const lw = DW / 2 - 0.02;
    const cx = -sx * (lw / 2);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.06, DH - 0.06), glass);
    g.position.set(cx, DH / 2, 0);
    pivot.add(g);
    const fr = (w: number, hh: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.05), black);
      m.position.set(x, y, 0);
      pivot.add(m);
    };
    fr(lw, 0.05, cx, 0.025);
    fr(lw, 0.05, cx, DH - 0.025);
    fr(0.04, DH, -sx * 0.02, DH / 2);
    fr(0.04, DH, -sx * (lw - 0.02), DH / 2);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 16), brass);
    pull.position.set(-sx * (lw - 0.14), 1.2, 0.07);
    pivot.add(pull);
    shell(shadowed(pivot));
    leaves.push(pivot);
  }

  /* long reflecting pool across the front, stepping stones over it */
  const PZ0 = FZ + 2.6;
  const PZ1 = FZ + 7.2;
  const coping = new THREE.Mesh(rbox(FW, 0.08, PZ1 - PZ0 + 0.4, 0.01), paveMat);
  // stone basin sits below the water line (it used to share the water's height → flicker)
  coping.position.set(0, -0.035, (PZ0 + PZ1) / 2);
  group.add(coping);
  // true mirror reflections of the pavilion & sky, tinted like deep still water
  const pool = new Reflector(new THREE.PlaneGeometry(FW - 0.4, PZ1 - PZ0), {
    textureWidth: Math.round(Math.min(1200, window.innerWidth) * 0.42),
    textureHeight: Math.round(Math.min(900, window.innerHeight) * 0.42),
    color: new THREE.Color("#5f7a76"),
    clipBias: 0.003,
  });
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.03, (PZ0 + PZ1) / 2);
  pool.userData.fx = true; // keep it out of the AO / depth-of-field passes
  group.add(pool);
  // a faint dark film over the mirror gives the water body and depth
  const film = new THREE.Mesh(new THREE.PlaneGeometry(FW - 0.4, PZ1 - PZ0), new THREE.MeshBasicMaterial({ color: "#1d2f2c", transparent: true, opacity: 0.22, depthWrite: false }));
  film.rotation.x = -Math.PI / 2;
  film.position.set(0, 0.06, (PZ0 + PZ1) / 2);
  group.add(film);
  /* floating oak bridge: slatted deck, black steel edge, warm glow underneath */
  {
    const BW = 2.5;
    const z0 = PZ0 - 0.35;
    const z1 = PZ1 + 0.35;
    const plank = 0.13;
    const gap = 0.012;
    const n = Math.floor((z1 - z0) / (plank + gap));
    const deckTex = woodTexture({ vertical: false, plank: 256, base: [34, 30, 62], seed: 45, size: 512, joints: false });
    const deckMat = std({ map: deckTex.map, color: "#b0a594", roughness: 0.75 });
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(BW, 0.04, plank), deckMat, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m4.makeTranslation(0, 0.2, z0 + plank / 2 + i * (plank + gap));
      inst.setMatrixAt(i, m4);
    }
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, z1 - z0), black);
      edge.position.set(sx * (BW / 2 + 0.015), 0.16, (z0 + z1) / 2);
      group.add(shadowed(edge));
      // hidden LED: a thin bright line and its reflection-glow on the water
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, z1 - z0 - 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.3), toneMapped: false }));
      led.position.set(sx * (BW / 2 - 0.05), 0.105, (z0 + z1) / 2);
      group.add(led);
      const glowTex = softTexture();
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, z1 - z0),
        new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.75, 0.45), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(sx * (BW / 2 + 0.2), 0.09, (z0 + z1) / 2);
      glow.scale.set(1, 1.15, 1);
      group.add(glow);
    }
    // the deck's shadow on the water, so it reads as floating
    const under = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.1, z1 - z0 - 0.1), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.35, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, 0.085, (z0 + z1) / 2);
    group.add(under);
    // a low step up onto the deck at each end
    for (const zz of [z0 - 0.18, z1 + 0.18]) {
      const st = new THREE.Mesh(rbox(BW, 0.1, 0.34, 0.02), std({ map: trav, color: "#efe6d6", roughness: 0.55 }));
      st.position.set(0, 0.05, zz);
      group.add(shadowed(st));
    }
  }

  /* lotus: notched pads and pink blooms floating on the pool (clear of the stepping stones) */
  {
    const padMat = std({ color: "#5d8a45", roughness: 0.45, side: THREE.DoubleSide });
    const padDark = std({ color: "#46703a", roughness: 0.5, side: THREE.DoubleSide });
    const petal = new THREE.SphereGeometry(1, 12, 8);
    const petalOut = std({ color: "#f3a9c0", roughness: 0.55 });
    const petalIn = std({ color: "#fbd3df", roughness: 0.55 });
    const heart = std({ color: "#f2cf5b", roughness: 0.6 });
    const spots: [number, number][] = [];
    while (spots.length < 16) {
      const x = (rand() < 0.5 ? -1 : 1) * (1.6 + rand() * 5.0);
      const z = PZ0 + 0.3 + rand() * (PZ1 - PZ0 - 0.6);
      if (spots.every(([a, b]) => Math.hypot(a - x, b - z) > 0.55)) spots.push([x, z]);
    }
    spots.forEach(([x, z], i) => {
      const r = 0.2 + rand() * 0.14;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 28, 0.25, Math.PI * 2 - 0.25), i % 3 ? padMat : padDark);
      pad.rotation.set(-Math.PI / 2, 0, rand() * Math.PI * 2);
      pad.position.set(x, 0.11, z);
      pad.receiveShadow = true;
      group.add(pad);
      if (i % 3 === 0) {
        const bloom = new THREE.Group();
        const ring = (n: number, len: number, tilt: number, mat: THREE.Material, y: number) => {
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + (n % 2) * 0.3;
            const m = new THREE.Mesh(petal, mat);
            m.scale.set(len * 0.38, len, len * 0.16);
            m.position.set(Math.cos(a) * len * 0.45, y + len * 0.7, Math.sin(a) * len * 0.45);
            m.rotation.set(0, -a + Math.PI / 2, 0);
            m.rotateX(tilt);
            bloom.add(m);
          }
        };
        ring(8, 0.09, 0.75, petalOut, 0);
        ring(7, 0.08, 0.45, petalIn, 0.02);
        ring(5, 0.065, 0.2, petalIn, 0.04);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.025, 12), heart);
        c.position.y = 0.085;
        bloom.add(c);
        bloom.position.set(x + (rand() - 0.5) * 0.1, 0.12, z + (rand() - 0.5) * 0.1);
        group.add(shadowed(bloom, true, false));
      }
    });
  }

  /* planting: grass beds along the glass, two sculptural trees */
  for (const sx of [-1, 1]) {
    const bed = new THREE.Mesh(rbox(GL - DW / 2 - 0.4, 0.3, 0.6, 0.02), travMat);
    bed.position.set(sx * (DW / 2 + (GL - DW / 2) / 2 + 0.1), 0.15, FZ + 0.6);
    group.add(shadowed(bed));
    const g = grassBed(sx > 0 ? DW / 2 + 0.4 : -GL + 0.1, sx > 0 ? GL - 0.1 : -DW / 2 - 0.4, FZ + 0.4, FZ + 0.8, 320);
    g.position.y = 0.3;
    group.add(g);
  }
  const bark = std({ color: "#6e6458", roughness: 0.9 });
  for (const [tx, tz, s] of [
    [-8.2, FZ + 2.4, 1],
    [5.9, FZ + 6.6, 1.15],
  ] as [number, number, number][]) {
    const planter = new THREE.Mesh(rbox(1.3, 0.5, 1.3, 0.04), std({ color: "#d9d2c6", roughness: 0.8 }));
    planter.position.set(tx, 0.25, tz);
    group.add(shadowed(planter));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.11 * s, 2.3 * s, 10), bark);
    trunk.position.set(tx, 0.5 + 1.1 * s, tz);
    trunk.rotation.z = 0.08;
    group.add(shadowed(trunk));
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + rand();
      const dir = new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize();
      const len = 0.9 * s;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.06 * s, len, 8), bark);
      const from = new THREE.Vector3(tx, 0.5 + 2.0 * s, tz);
      br.position.copy(from).addScaledVector(dir, len / 2);
      br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      group.add(shadowed(br));
    }
    group.add(leafCrown(new THREE.Vector3(tx, 0.5 + 2.9 * s, tz), new THREE.Vector3(1.3 * s, 0.85 * s, 1.3 * s), 800));
  }
  // soft green backdrop: card-leaf trees behind the pavilion
  for (let i = 0; i < 7; i++) {
    const x = -15 + i * 5 + (rand() - 0.5) * 2;
    group.add(leafCrown(new THREE.Vector3(x, 5.5 + rand() * 1.5, R.zBack - 4 - rand() * 4), new THREE.Vector3(3, 2.6, 2.4), 650, 0.02));
  }

  /* daylight */
  const sun = new THREE.DirectionalLight("#ffeccf", 2.5);
  sun.position.set(-12, 12, FZ + 9);
  sun.target.position.set(0, 1, FZ - 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -16;
  sc.right = 16;
  sc.top = 14;
  sc.bottom = -10;
  sc.near = 1;
  sc.far = 50;
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 2.5;
  // lights live on the scene (not the group) so hiding the street never changes the light count → no shader recompile
  scene.add(sun, sun.target);
  const skyFill = new THREE.PointLight("#c6daff", 2.5, 30, 1.2);
  skyFill.position.set(5, 9, FZ + 12);
  scene.add(skyFill);

  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const setOpen = (f: number) => {
    const e = ease(Math.min(1, Math.max(0, f)));
    leaves[0].rotation.y = e * 1.75;
    leaves[1].rotation.y = -e * 1.75;
  };
  setOpen(0);

  return {
    group,
    setOpen,
    tick: (t: number) => {
      skyMat.uniforms.uT.value = t;
    },
    lights: [
      { light: sun, base: 2.5, inside: 1.7 },
      { light: skyFill, base: 2.5, inside: 0 },
    ],
    setInside: (inside: boolean) => {
      for (const c of group.children) c.visible = !inside || !!c.userData.shell;
      // inside: a low late-afternoon sun slips under the eave and lays long window light across the lobby
      if (inside) {
        sun.position.set(-7.5, 4.6, FZ + 12);
        sun.target.position.set(0.5, 0.6, R.zBack + 1);
        sun.color.set("#ffc994");
      } else {
        sun.position.set(-12, 12, FZ + 9);
        sun.target.position.set(0, 1, FZ - 1);
        sun.color.set("#ffeccf");
      }
      sun.target.updateMatrixWorld();
    },
    camera: {
      position: new THREE.Vector3(-5.4, 1.35, FZ + 12.8),
      target: new THREE.Vector3(0.6, 2.25, FZ),
      focus: 13,
      via: new THREE.Vector3(0.05, 1.62, FZ + 4.2),
    },
  };
}
