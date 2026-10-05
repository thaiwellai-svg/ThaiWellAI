import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Candle, RoomHandles } from "./build";
import { flameTexture, leafTexture, linenTexture, softTexture, travertineTexture, waxGlowTexture, woodTexture } from "./textures";

/**
 * "Sala" — an open teak pavilion over an infinity pool at golden hour.
 * The pool throws moving caustics onto the ceiling; the low sun rakes long column shadows
 * across the deck; sheer curtains, a frangipani tree and candle lanterns along the edge.
 * Units: metres. Camera sits at the back of the pavilion looking out over the water.
 */

const rand = (() => {
  let s = 4242;
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

// sun low over the water, slightly right of centre
const SUN = new THREE.Vector3(0.32, 0.085, -1).normalize();

/** Far tropical horizon: hills, canopy, palms — transparent sky so the physical sky shows through. */
function horizonTexture() {
  const W = 4096;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const r = (() => {
    let s = 9;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  })();
  const layers = [
    { y: 0.62, amp: 70, n: 340, size: [40, 110], col: [24, 22, 30] },
    { y: 0.74, amp: 60, n: 300, size: [50, 130], col: [60, 24, 20] },
    { y: 0.86, amp: 60, n: 260, size: [60, 150], col: [95, 30, 12] },
  ];
  for (const L of layers) {
    g.fillStyle = `hsl(${L.col[0]} ${L.col[1]}% ${L.col[2]}%)`;
    g.fillRect(0, H * L.y + 50, W, H);
    for (let i = 0; i < L.n; i++) {
      const x = r() * W;
      const y = H * L.y + (r() - 0.35) * L.amp;
      const rad = L.size[0] + r() * (L.size[1] - L.size[0]);
      g.fillStyle = `hsl(${L.col[0] + (r() - 0.5) * 14} ${L.col[1]}% ${L.col[2] + (r() - 0.5) * 4}%)`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  const palm = (x: number, base: number, h: number, lean: number) => {
    g.strokeStyle = "#140e0b";
    g.fillStyle = "#140e0b";
    g.lineCap = "round";
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(x + lean * 0.6, base - h * 0.55, x + lean, base - h);
    g.stroke();
    const tx = x + lean;
    const ty = base - h;
    g.lineWidth = 2.5;
    for (let k = 0; k < 13; k++) {
      const a = -Math.PI + (k / 12) * Math.PI * 1.15 + (r() - 0.5) * 0.2;
      const len = 170 + r() * 90;
      const ex = tx + Math.cos(a) * len;
      const ey = ty + Math.sin(a) * len * 0.4 + len * 0.38;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * len * 0.5, ty + Math.sin(a) * len * 0.3 - 30, ex, ey);
      g.stroke();
      for (let q = 0.15; q < 1; q += 0.05) {
        const px = tx + (ex - tx) * q;
        const py = ty + (ey - ty) * q - Math.sin(q * Math.PI) * 30;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a + 1.3) * 45 * (1 - q * 0.6), py + 38 * (1 - q * 0.5));
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(a - 1.3) * 45 * (1 - q * 0.6), py + 38 * (1 - q * 0.5));
        g.stroke();
      }
    }
  };
  for (const [x, h, l] of [[300, 560, 40], [760, 420, -20], [1500, 640, 60], [2420, 520, -40], [2900, 700, 50], [3550, 480, -30], [3880, 600, 20]] as const)
    palm(x, H, h, l);
  // a few lit windows / garden lamps in the far hills
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    const y = H * (0.68 + r() * 0.25);
    const rad = 1.5 + r() * 3;
    const gl = g.createRadialGradient(x, y, 0, x, y, rad * 5);
    gl.addColorStop(0, "rgba(255,214,150,1)");
    gl.addColorStop(1, "rgba(255,180,90,0)");
    g.fillStyle = gl;
    g.fillRect(x - rad * 5, y - rad * 5, rad * 10, rad * 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Infinity-pool water: animated normals, sky-coloured fresnel reflection, sun glitter path. */
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: SUN },
      uDeep: { value: new THREE.Color("#0e3b44") },
      uShallow: { value: new THREE.Color("#2f7f86") },
      uSkyTop: { value: new THREE.Color("#2c3b5c") },
      uSkyHorizon: { value: new THREE.Color("#b8724a") },
      uSunCol: { value: new THREE.Color(1.0, 0.72, 0.42) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSun, uDeep, uShallow, uSkyTop, uSkyHorizon, uSunCol;
      varying vec3 vWorld;
      float h(vec2 p) {
        float t = uTime;
        return sin(p.x * 1.7 + t * 0.9) * 0.5 + sin(p.y * 2.3 - t * 0.7) * 0.4
             + sin((p.x + p.y) * 4.1 + t * 1.6) * 0.18 + sin((p.x * 0.6 - p.y) * 7.3 - t * 2.1) * 0.08
             + sin((p.x * 1.3 + p.y * 0.4) * 13.0 + t * 2.7) * 0.035;
      }
      void main() {
        vec2 p = vWorld.xz;
        float e = 0.03;
        float strength = 0.055;
        vec3 n = normalize(vec3(-(h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0))) / (2.0 * e) * strength, 1.0,
                                -(h(p + vec2(0.0, e)) - h(p - vec2(0.0, e))) / (2.0 * e) * strength));
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, n);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.35, R.y));
        float sd = max(dot(R, uSun), 0.0);
        vec3 sun = uSunCol * (pow(sd, 900.0) * 5.0 + pow(sd, 60.0) * 0.45 + pow(sd, 8.0) * 0.08);
        float depthMix = smoothstep(-2.5, -9.0, vWorld.z);
        vec3 body = mix(uShallow, uDeep, depthMix) * (0.55 + 0.45 * max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0));
        vec3 col = mix(body, sky, fres) + sun;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Caustic light the water throws onto the ceiling (additive). */
function causticMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uEdge: { value: -1.6 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uEdge; varying vec3 vWorld;
      #define TAU 6.28318530718
      float caustic(vec2 uv, float time) {
        vec2 p = mod(uv * TAU, TAU) - 250.0;
        vec2 i = p;
        float c = 1.0;
        float inten = 0.005;
        for (int n = 0; n < 4; n++) {
          float t = time * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
        }
        c /= 4.0;
        c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }
      void main() {
        float k = caustic(vWorld.xz * 0.33, uTime * 0.35);
        // strongest where the ceiling overhangs the water, fading into the pavilion
        float mask = smoothstep(uEdge + 4.2, uEdge - 0.2, vWorld.z);
        vec3 col = vec3(1.0, 0.86, 0.62) * k * mask * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function buildSala(): RoomHandles & { tick: (t: number) => void } {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#3a2a28");
  scene.fog = new THREE.Fog("#8a5a42", 16, 60);

  /* ── Materials ──────────────────────────────────────────── */
  const deckTex = woodTexture({ vertical: false, plank: 72, base: [26, 46, 34], seed: 31, size: 2048 });
  for (const t of [deckTex.map, deckTex.bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2.2, 2.2);
  }
  const deckMat = new THREE.MeshPhysicalMaterial({ map: deckTex.map, bumpMap: deckTex.bump, bumpScale: 0.6, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.35, color: "#d9a679" });
  const teakTex = woodTexture({ vertical: true, plank: 1024, base: [24, 48, 30], seed: 8, size: 1024, joints: false });
  const teakMat = std({ map: teakTex.map, roughness: 0.6, color: "#c99363" });
  const ceilTex = woodTexture({ vertical: false, plank: 96, base: [26, 44, 38], seed: 17, size: 1024 });
  for (const t of [ceilTex.map]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
  }
  const ceilMat = std({ map: ceilTex.map, roughness: 0.8, color: "#c9976a" });
  const stone = travertineTexture();
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  stone.repeat.set(6, 1);
  const stoneMat = std({ map: stone, roughness: 0.7, color: "#f0e3cf" });
  const linen = linenTexture();
  const linenMat = new THREE.MeshPhysicalMaterial({ map: linen, color: "#f8f4ee", roughness: 0.95, sheen: 1, sheenColor: new THREE.Color("#fff9ef"), sheenRoughness: 0.55 });
  const towelMat = new THREE.MeshPhysicalMaterial({ map: linen, color: "#fbf9f5", roughness: 1, sheen: 1, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.75 });

  const S = { x0: -3.4, x1: 3.4, zFront: -1.6, zBack: 5.4, h: 3.05 };

  /* ── Sky, horizon, water ────────────────────────────────── */
  // golden-hour sky dome: controllable gradient + sun glow (Preetham sky blows out at this exposure)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uSun: { value: SUN } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uSun; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 top = vec3(0.1, 0.16, 0.32);
        vec3 mid = vec3(0.42, 0.3, 0.32);
        vec3 hor = vec3(0.72, 0.4, 0.22);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.12, y));
        col = mix(col, top, smoothstep(0.1, 0.55, y));
        float sd = max(dot(vDir, uSun), 0.0);
        col += vec3(1.0, 0.62, 0.3) * (pow(sd, 6.0) * 0.25 + pow(sd, 40.0) * 0.45);
        col = mix(col, hor * 0.9, smoothstep(0.0, -0.08, y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat));

  const horizon = new THREE.Mesh(
    new THREE.PlaneGeometry(130, 26),
    new THREE.MeshBasicMaterial({ map: horizonTexture(), transparent: true, fog: false, color: new THREE.Color(0.62, 0.48, 0.47) }),
  );
  horizon.position.set(6, 11, -95);
  scene.add(horizon);
  // sun disc
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 1.05), toneMapped: false, fog: false }));
  sunDisc.position.copy(SUN).multiplyScalar(80);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const water = waterMaterial();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, -0.08, -2.15 - 11);
  scene.add(pool);
  // coping between deck and water
  const coping = new THREE.Mesh(rbox(30, 0.08, 0.5, 0.02), stoneMat);
  coping.position.set(0, -0.04, S.zFront - 0.3);
  coping.receiveShadow = true;
  scene.add(coping);

  /* ── Pavilion ───────────────────────────────────────────── */
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0 + 6, S.zBack - S.zFront), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0, (S.zFront + S.zBack) / 2);
  deck.receiveShadow = true;
  scene.add(deck);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0 + 0.6, S.zBack - S.zFront + 0.9), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, S.h, (S.zFront + S.zBack) / 2 - 0.45);
  ceiling.receiveShadow = true;
  scene.add(ceiling);
  const caustics = causticMaterial();
  const causticPlane = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0 + 0.6, 6), caustics);
  causticPlane.rotation.x = Math.PI / 2;
  causticPlane.position.set(0, S.h - 0.005, S.zFront + 1.5);
  scene.add(causticPlane);
  // ceiling beams
  for (let k = 0; k < 4; k++) {
    const beam = new THREE.Mesh(rbox(S.x1 - S.x0 + 0.4, 0.16, 0.12, 0.01), teakMat);
    beam.position.set(0, S.h - 0.08, S.zFront + 0.25 + k * 1.9);
    scene.add(shadowed(beam));
  }
  // fascia framing the view
  const fascia = new THREE.Mesh(rbox(S.x1 - S.x0 + 0.6, 0.34, 0.16, 0.012), teakMat);
  fascia.position.set(0, S.h - 0.1, S.zFront - 0.45);
  scene.add(shadowed(fascia));
  // columns
  const colGeo = rbox(0.2, S.h, 0.2, 0.02);
  const columns: [number, number][] = [
    [S.x0 + 0.15, S.zFront - 0.3],
    [S.x1 - 0.15, S.zFront - 0.3],
    [S.x0 + 0.15, S.zBack - 0.3],
    [S.x1 - 0.15, S.zBack - 0.3],
    [S.x0 + 0.15, (S.zFront + S.zBack) / 2 - 0.3],
    [S.x1 - 0.15, (S.zFront + S.zBack) / 2 - 0.3],
  ];
  for (const [x, z] of columns) {
    const c = new THREE.Mesh(colGeo, teakMat);
    c.position.set(x, S.h / 2, z);
    scene.add(shadowed(c));
    const base = new THREE.Mesh(rbox(0.3, 0.12, 0.3, 0.02), stoneMat);
    base.position.set(x, 0.06, z);
    scene.add(shadowed(base));
  }
  // slatted side screens (light rakes through the gaps)
  const slatGeo = rbox(0.04, S.h - 0.5, 0.06, 0.006);
  for (const side of [-1, 1]) {
    const n = 34;
    const inst = new THREE.InstancedMesh(slatGeo, teakMat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation(side * (S.x1 + 0.05), (S.h - 0.5) / 2 + 0.2, S.zFront + 1.4 + i * 0.12);
      inst.setMatrixAt(i, m);
    }
    inst.castShadow = inst.receiveShadow = true;
    scene.add(inst);
  }

  /* ── Sheer curtains tied back at the front columns ──────── */
  const curtainMat = new THREE.MeshPhysicalMaterial({ color: "#fbf6ee", roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, map: linen, sheen: 1, sheenColor: new THREE.Color("#fff") });
  const curtains: RoomHandles["curtains"] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.9, S.h - 0.25, 40, 20);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      // gathered toward the column at mid-height (tied back)
      const tie = Math.exp(-Math.pow((y + 0.2) / 0.5, 2));
      const nx = x * (1 - tie * 0.75) - side * tie * 0.18;
      p.setXYZ(i, nx, y, Math.sin(x * 26) * 0.05 * (1 - tie * 0.6) + Math.sin(x * 9) * 0.02);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, curtainMat);
    m.position.set(side * (S.x1 - 0.55), (S.h - 0.25) / 2 + 0.02, S.zFront - 0.15);
    m.castShadow = true;
    scene.add(m);
    curtains.push({ mesh: m, rest: Float32Array.from(p.array as Float32Array) });
  }

  /* ── Massage bed on a low platform ──────────────────────── */
  const pickables: THREE.Object3D[] = [];
  const makeFlower = (scale = 1) => {
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
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), heartMat);
    hm.scale.y = 0.5;
    hm.position.y = 0.006;
    f.add(hm);
    f.scale.setScalar(scale);
    return shadowed(f, true, false);
  };
  const bed = new THREE.Group();
  const L = 1.96;
  const D = 0.76;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(rbox(0.06, 0.56, 0.06, 0.008), teakMat);
      leg.position.set(sx * (L / 2 - 0.12), 0.28, sz * (D / 2 - 0.1));
      bed.add(leg);
    }
  const apron = new THREE.Mesh(rbox(L - 0.06, 0.06, D - 0.1, 0.012), teakMat);
  apron.position.y = 0.58;
  bed.add(apron);
  const mattress = new THREE.Mesh(rbox(L, 0.14, D, 0.055, 6), linenMat);
  mattress.position.y = 0.68;
  bed.add(mattress);
  {
    const g = new THREE.PlaneGeometry(L + 0.06, D + 0.08, 80, 30);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const edge = Math.max(Math.abs(x) - L / 2 + 0.02, Math.abs(z) - D / 2 + 0.02);
      const drop = edge > 0 ? -edge * 2.2 : 0;
      p.setY(i, drop + Math.sin(x * 9 + Math.sin(z * 7) * 1.5) * 0.0028 + Math.sin(x * 23 + z * 17) * 0.0012);
    }
    g.computeVertexNormals();
    const sheet = new THREE.Mesh(g, linenMat);
    sheet.position.y = 0.753;
    bed.add(sheet);
  }
  const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.44, 8, 20), towelMat);
  roll.rotation.x = Math.PI / 2;
  roll.position.set(-L / 2 + 0.2, 0.83, 0);
  bed.add(roll);
  for (let k = 0; k < 2; k++) {
    const t = new THREE.Mesh(rbox(0.38, 0.05, 0.28, 0.023, 5), towelMat);
    t.position.set(0.62, 0.79 + k * 0.051, -0.04 + k * 0.01);
    t.rotation.y = (k - 0.5) * 0.04;
    bed.add(t);
  }
  const fl = makeFlower();
  fl.position.set(0.6, 0.873, -0.02);
  fl.rotation.y = 0.5;
  bed.add(fl);
  const fl2 = makeFlower(0.85);
  fl2.position.set(0.68, 0.872, 0.06);
  fl2.rotation.y = -0.6;
  bed.add(fl2);
  bed.position.set(0.15, 0.06, 0.75);
  bed.rotation.y = 0.04;
  scene.add(shadowed(bed));

  /* ── Low side table: candles, stone bowl, incense diffuser ─ */
  const table = new THREE.Group();
  const top = new THREE.Mesh(rbox(0.7, 0.05, 0.4, 0.015), teakMat);
  top.position.y = 0.36;
  table.add(top);
  for (const x of [-0.3, 0.3]) {
    const leg = new THREE.Mesh(rbox(0.05, 0.34, 0.36, 0.01), teakMat);
    leg.position.set(x, 0.17, 0);
    table.add(leg);
  }
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.11, 0.02], [0.13, 0.06], [0.125, 0.065], [0.105, 0.03], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 48),
    stoneMat,
  );
  bowl.position.set(0.18, 0.385, 0);
  table.add(bowl);
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(0.108, 40), new THREE.MeshPhysicalMaterial({ color: "#7d8a86", roughness: 0.05, clearcoat: 1 }));
  bowlWater.rotation.x = -Math.PI / 2;
  bowlWater.position.set(0.18, 0.44, 0);
  table.add(bowlWater);
  const floatF = makeFlower(0.9);
  floatF.position.set(0.19, 0.442, 0.01);
  table.add(floatF);
  table.position.set(-0.1, 0, 2.15);
  table.rotation.y = 0.05;
  scene.add(shadowed(table));

  const flameTex = flameTexture();
  const waxGlow = waxGlowTexture();
  const candles: Candle[] = [];
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transmission: 0.95, thickness: 0.01, transparent: true, opacity: 0.25 });
  const addCandle = (parent: THREE.Object3D, x: number, y: number, z: number, h: number, r: number, hurricane = false) => {
    const wax = new THREE.MeshStandardMaterial({ color: "#f2e7d6", roughness: 0.5, emissive: "#ff8a3c", emissiveMap: waxGlow, emissiveIntensity: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1), wax);
    body.position.set(x, y + h / 2, z);
    body.receiveShadow = true;
    body.name = `candle:${candles.length}`;
    parent.add(body);
    pickables.push(body);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.016, 6), std({ color: "#15110d" }));
    wick.position.set(x, y + h + 0.006, z);
    parent.add(wick);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: new THREE.Color(3, 2.4, 1.8), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const bs = new THREE.Vector2(0.03 + r * 0.2, 0.07 + r * 0.4);
    flame.scale.set(bs.x, bs.y, 1);
    flame.position.set(x, y + h + bs.y * 0.36, z);
    parent.add(flame);
    if (hurricane) {
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(r * 2.2, r * 2.2, h + 0.22, 40, 1, true), glassMat);
      glass.position.set(x, y + (h + 0.22) / 2, z);
      parent.add(glass);
    }
    candles.push({ flame, wax, baseScale: bs, seed: rand() * 100, gust: 0 });
  };
  addCandle(table, -0.2, 0.385, -0.04, 0.16, 0.042);
  addCandle(table, -0.1, 0.385, 0.06, 0.1, 0.036);
  // hurricane lanterns along the pool edge
  addCandle(scene, -1.15, 0, S.zFront - 0.05, 0.2, 0.05, true);
  addCandle(scene, 1.35, 0, S.zFront - 0.05, 0.26, 0.055, true);
  addCandle(scene, 1.62, 0, S.zFront + 0.12, 0.14, 0.045, true);

  const tableLight = new THREE.PointLight("#ff9a52", 1.1, 3.2, 1.8);
  tableLight.position.set(-0.25, 0.75, 2.15);
  scene.add(tableLight);
  const edgeLight = new THREE.PointLight("#ff9a52", 0.9, 3, 1.8);
  edgeLight.position.set(0.4, 0.5, S.zFront);
  scene.add(edgeLight);

  const diffuser = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.065, 0.03], [0.066, 0.09], [0.05, 0.13], [0.018, 0.155], [0, 0.155]].map(([a, b]) => new THREE.Vector2(a, b)), 48),
    std({ color: "#a5ab93", roughness: 0.45 }),
  );
  diffuser.name = "diffuser";
  diffuser.position.set(0.12, 0.385, 2.18);
  diffuser.castShadow = true;
  scene.add(diffuser);
  pickables.push(diffuser);

  /* ── Frangipani tree by the pool ────────────────────────── */
  const leaves: RoomHandles["leaves"] = [];
  const barkMat = std({ color: "#6f6458", roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(112), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55 });
  const tree = new THREE.Group();
  const leafGeo = new THREE.PlaneGeometry(0.11, 0.34, 1, 4);
  leafGeo.translate(0, 0.17, 0);
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const to = from.clone().add(dir.clone().multiplyScalar(len));
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((rand() - 0.5) * 0.15, 0.05, (rand() - 0.5) * 0.15));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    tree.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, rad, 8), barkMat));
    if (depth === 0) {
      // rosette of leaves + a flower cluster at each tip (frangipani grows like this)
      const parts: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 9; k++) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9 - rand() * 0.4, (k / 9) * Math.PI * 2, 0, "YXZ"));
        parts.push(leafGeo.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(1, 0.8 + rand() * 0.5, 1))));
      }
      const ros = new THREE.Mesh(mergeGeometries(parts), leafMat);
      const pivot = new THREE.Group();
      pivot.position.copy(to);
      pivot.add(ros);
      tree.add(pivot);
      leaves.push({ mesh: pivot, base: pivot.rotation.clone(), seed: rand() * 10 });
      for (let k = 0; k < 5; k++) {
        const f = makeFlower(1.3);
        f.position.copy(to).add(new THREE.Vector3((rand() - 0.5) * 0.12, 0.08 + rand() * 0.05, (rand() - 0.5) * 0.12));
        f.rotation.set((rand() - 0.5) * 0.8, rand() * 6, (rand() - 0.5) * 0.8);
        tree.add(f);
      }
      return;
    }
    const kids = depth === 1 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const a = (k / kids) * Math.PI * 2 + rand();
      const nd = dir.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7)).normalize();
      branch(to, nd, len * 0.72, rad * 0.68, depth - 1);
    }
  };
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.15, 1, 0.05).normalize(), 1.1, 0.075, 3);
  tree.position.set(2.75, 0, S.zFront - 0.95);
  scene.add(shadowed(tree));
  // fallen flowers on the deck and floating in the pool
  for (const [x, z, s] of [[1.9, -1.3, 1.2], [2.3, -1.05, 1.1], [0.9, -2.6, 1.3], [1.6, -3.4, 1.2], [-0.4, -3.0, 1.1]] as const) {
    const f = makeFlower(s);
    f.position.set(x, z < S.zFront - 0.6 ? -0.07 : 0.003, z);
    f.rotation.y = rand() * 6;
    scene.add(f);
  }

  /* ── Lights ─────────────────────────────────────────────── */
  const sun = new THREE.DirectionalLight("#ffb173", 2.4);
  sun.position.copy(SUN).multiplyScalar(30).add(new THREE.Vector3(0, 0, 2));
  sun.target.position.set(0, 0, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 5, far: 60 });
  sun.shadow.radius = 10;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight("#9fb4d6", "#7a5236", 0.8));
  const fill = new THREE.PointLight("#ffe2c4", 1.2, 9, 1.2);
  fill.position.set(0.4, 2.2, 4.6);
  scene.add(fill);
  // bounce off the bright water into the pavilion
  const bounce = new THREE.RectAreaLight("#ffd9b0", 2.4, 6.5, 2.5);
  bounce.position.set(0, 0.05, S.zFront - 0.6);
  bounce.lookAt(0, 2.8, 1.5);
  scene.add(bounce);
  // warm downlight inside the sala
  const lamp = new THREE.PointLight("#ffc48a", 1.4, 8, 1.4);
  lamp.position.set(0.1, 2.75, 1.9);
  scene.add(lamp);

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
  const dustN = 160;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 5;
    dustPos[i * 3 + 1] = 0.3 + rand() * 2.5;
    dustPos[i * 3 + 2] = S.zFront + rand() * 4;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ map: soft, size: 0.014, color: new THREE.Color(1.5, 1.2, 0.9), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  scene.add(dust);

  return {
    scene,
    camera: { position: new THREE.Vector3(0.35, 1.62, 5.6), target: new THREE.Vector3(0.15, 1.02, -2.0), focus: 4.9 },
    candles,
    candleLights: [
      { light: tableLight, base: 1.1, members: [0, 1] },
      { light: edgeLight, base: 0.9, members: [2, 3, 4] },
    ],
    pendant: { light: lamp, bulb: new THREE.MeshBasicMaterial(), base: 1.4 },
    steam: { sprites: steamSprites, origin: steamOrigin, burst: 0 },
    dust,
    leaves,
    curtains,
    pickables,
    tick: (t: number) => {
      water.uniforms.uTime.value = t;
      caustics.uniforms.uTime.value = t;
    },
  };
}
