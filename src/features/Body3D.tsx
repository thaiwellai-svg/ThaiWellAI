import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LoopSubdivision } from "three-subdivide";
import { Loader2, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { BODY_AREAS, type BodyArea } from "./BodyMap";
import { ELEMENT_INFO, type Element } from "../data/elements";
import { ElementIcon } from "./ElementIcon";
import "./body3d.css";

/* ───────────── shared model: loaded once, posed, baked to static meshes, each vertex tagged with a body area ───────────── */

type Part = { geometry: THREE.BufferGeometry; area: Uint8Array; neighbours: { start: Uint32Array; list: Uint32Array }; eye?: Float32Array };
type Model = { parts: Part[]; height: number; center: THREE.Vector3; maps: { normal: THREE.Texture | null; ao: THREE.Texture | null } };
const modelCache: Record<string, Promise<Model>> = {};

const AREA_INDEX = Object.fromEntries(BODY_AREAS.map((a, i) => [a, i + 1])) as Record<BodyArea, number>;

/** bone name (Mixamo, or Blender Rigify — GLTFLoader strips the dots: "upper_arm.L" → "upper_armL") → canonical part + side */
function canon(raw: string): { part: string; side: "Left" | "Right" | "" } {
  const n = raw.replace(/^mixamorig:?/, "");
  const m = n.match(/^(Left|Right)(.*)$/);
  if (m) return { part: m[2].replace(/\d+$/, "").replace(/^Hand.*/, "Hand").replace(/^Toe.*/, "Toe"), side: m[1] as "Left" | "Right" };
  const r = n.replace(/\./g, "").match(/^([a-z_]+?)(\d*)(L|R)$/);
  if (r) {
    const map: Record<string, string> = { shoulder: "Shoulder", upper_arm: "Arm", forearm: "ForeArm", hand: "Hand", thigh: "UpLeg", shin: "Leg", foot: "Foot", heel: "Foot", toe: "Toe", pelvis: "Hips" };
    return { part: map[r[1]] ?? (/^(f_|thumb)/.test(r[1]) ? "Hand" : r[1]), side: r[3] === "L" ? "Left" : "Right" };
  }
  const rig: Record<string, string> = { spine: "Hips", spine001: "Spine", spine002: "Spine1", spine003: "Spine2", spine004: "Neck", spine005: "Neck", spine006: "Head" };
  return { part: rig[n.replace(/\./g, "")] ?? n.replace(/_End$/, "").replace(/^HeadTop$/, "Head"), side: "" };
}

/** body area from proportions alone (for meshes without a skeleton): t = height fraction, x = lateral, front = facing +Z */
function areaByShape(t: number, ax: number, front: boolean, H: number): BodyArea {
  const x = ax / H;
  if (t > 0.875) return "ศีรษะ";
  if (t > 0.83) return x < 0.07 ? "คอ" : t > 0.85 ? "ศีรษะ" : front ? "ไหล่" : "บ่า";
  // arms hang beside the torso: anything well outside the torso width
  const torso = t > 0.7 ? 0.125 : t > 0.6 ? 0.1 : t > 0.5 ? 0.105 : 0.11;
  if (t > 0.38 && x > torso) return t > 0.74 && x < 0.17 ? "ไหล่" : "แขน";
  if (t > 0.78) return front ? (x > 0.075 ? "ไหล่" : "อก") : "บ่า";
  if (t > 0.655) return front ? "อก" : "หลังส่วนบน";
  if (t > 0.56) return front ? "ท้อง" : "หลังส่วนล่าง";
  if (t > 0.47) return front ? "ท้อง" : "สะโพก";
  if (t > 0.045) return t > 0.255 && t < 0.31 ? "เข่า" : "ขา";
  return "เท้า";
}

/** vertex adjacency (CSR) — used to soften the heat glow across region edges */
function adjacency(g: THREE.BufferGeometry) {
  const count = g.attributes.position.count;
  const idx = g.index!.array;
  // vertices split at UV seams share a position — link them so colours blend across the seam
  const pos = g.attributes.position;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const arr = groups.get(k);
    if (arr) arr.push(i);
    else groups.set(k, [i]);
  }
  const twins: [number, number][] = [];
  for (const arr of groups.values()) if (arr.length > 1) for (let a = 0; a < arr.length; a++) for (let b = a + 1; b < arr.length; b++) twins.push([arr[a], arr[b]]);
  const deg = new Uint32Array(count + 1);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) deg[idx[t + e]] += 2;
  for (const [a, b] of twins) {
    deg[a] += 4;
    deg[b] += 4;
  }
  const start = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, count);
  const list = new Uint32Array(start[count]);
  for (let t = 0; t < idx.length; t += 3) {
    const [p, q, r] = [idx[t], idx[t + 1], idx[t + 2]];
    list[fill[p]++] = q;
    list[fill[p]++] = r;
    list[fill[q]++] = p;
    list[fill[q]++] = r;
    list[fill[r]++] = p;
    list[fill[r]++] = q;
  }
  // a twin counts 4× so the two sides of a seam converge quickly
  for (const [a, b] of twins)
    for (let k = 0; k < 4; k++) {
      list[fill[a]++] = b;
      list[fill[b]++] = a;
    }
  return { start, list };
}

/** natural eye colours by angle from the eyeball's forward axis: soft sclera, muted brown iris, dark pupil */
function paintEye(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  const p = g.attributes.position;
  const out = new Float32Array(p.count * 3);
  const sclera = new THREE.Color("#efe6de");
  const iris = new THREE.Color("#6a4a35");
  const irisEdge = new THREE.Color("#3e2a1f");
  const pupil = new THREE.Color("#1b1310");
  const col = new THREE.Color();
  const d = new THREE.Vector3();
  const smooth = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).sub(c).normalize();
    const t = d.z; // 1 = looking straight ahead
    col.copy(sclera);
    col.lerp(irisEdge, smooth(0.8, 0.83, t));
    col.lerp(iris, smooth(0.84, 0.9, t));
    col.lerp(pupil, smooth(0.955, 0.97, t));
    out.set([col.r, col.g, col.b], i * 3);
  }
  return out;
}

function loadModel(file: string): Promise<Model> {
  return (modelCache[file] ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${file}`).then(async (gltf) => {
    const root = gltf.scene;
    const clip = gltf.animations.find((a) => /idle/i.test(a.name));
    if (clip) {
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clip).play();
      mixer.update(0);
    }
    root.updateMatrixWorld(true);

    // bones by canonical name
    const bonesBy: Record<string, THREE.Object3D> = {};
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        const c = canon(o.name);
        bonesBy[c.side + c.part] ??= o;
      }
    });
    const at = (k: string) => (bonesBy[k] ? bonesBy[k].getWorldPosition(new THREE.Vector3()) : new THREE.Vector3());
    // face the camera (+Z): forward = heel → toe
    const fwd = at("LeftToe").sub(at("LeftFoot")).add(at("RightToe").sub(at("RightFoot")));
    fwd.y = 0;
    // rotation that turns the body to face +Z — applied to baked positions (rotating the skinned root would double-apply)
    const turn = new THREE.Matrix4().makeRotationY(fwd.lengthSq() > 1e-8 ? -Math.atan2(fwd.x, fwd.z) : 0);
    // rigify has no separate head bone: the top of the neck chain is the head
    if (!bonesBy.Head && bonesBy.Neck) bonesBy.Head = bonesBy.Neck;
    const J = { hips: at("Hips"), spine: at("Spine"), spine1: at("Spine1"), spine2: at("Spine2"), neck: at("Neck"), lArm: at("LeftArm"), rArm: at("RightArm"), lKnee: at("LeftLeg"), rKnee: at("RightLeg") };
    Object.values(J).forEach((j) => j.applyMatrix4(turn));

    const box = new THREE.Box3().setFromObject(root);
    box.applyMatrix4(turn);
    const height = box.max.y - box.min.y;
    const center = box.getCenter(new THREE.Vector3());
    const headY = box.max.y - 0.13 * height; // chin line

    const classify = (b: { part: string; side: string }, v: THREE.Vector3): BodyArea => {
      const front = (ref: THREE.Vector3) => v.z > ref.z;
      const near = (j: THREE.Vector3, r: number) => v.distanceTo(j) < r * height;
      if (v.y > headY) return "ศีรษะ";
      switch (b.part) {
        case "Head":
        case "HeadTop":
        case "Eye":
          return "ศีรษะ";
        case "Neck":
          return "คอ";
        case "Shoulder":
          return front(J.spine2) ? "ไหล่" : "บ่า";
        case "Arm":
          return near(b.side === "Left" ? J.lArm : J.rArm, 0.07) ? "ไหล่" : "แขน";
        case "ForeArm":
        case "Hand":
          return "แขน";
        case "Spine2":
          return front(J.spine2) ? "อก" : v.y > J.spine2.y + 0.06 * height ? "บ่า" : "หลังส่วนบน";
        case "Spine1":
          return front(J.spine1) ? (v.y > J.spine1.y ? "อก" : "ท้อง") : "หลังส่วนบน";
        case "Spine":
          return front(J.spine) ? "ท้อง" : "หลังส่วนล่าง";
        case "Hips":
          return front(J.hips) ? "ท้อง" : v.y < J.hips.y ? "สะโพก" : "หลังส่วนล่าง";
        case "UpLeg":
          return near(b.side === "Left" ? J.lKnee : J.rKnee, 0.06) ? "เข่า" : !front(J.hips) && v.y > J.hips.y - 0.12 * height ? "สะโพก" : "ขา";
        case "Leg":
          return near(b.side === "Left" ? J.lKnee : J.rKnee, 0.06) ? "เข่า" : "ขา";
        case "Foot":
        case "Toe":
          return "เท้า";
        default:
          return "อก";
      }
    };

    const parts: Part[] = [];
    const minY = box.min.y;
    // mid-depth of the torso per 2% height band (front = in front of it)
    const bands = new Array(51).fill(0).map(() => ({ s: 0, n: 0 }));
    root.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh || (mm as THREE.SkinnedMesh).isSkinnedMesh) return;
      const p = mm.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        v.fromBufferAttribute(p, i).applyMatrix4(mm.matrixWorld).applyMatrix4(turn);
        if (Math.abs(v.x - center.x) > 0.09 * height) continue; // torso/legs only, not arms
        const k = Math.min(50, Math.max(0, Math.round(((v.y - box.min.y) / height) * 50)));
        bands[k].s += v.z;
        bands[k].n++;
      }
    });
    const midZ = (y: number) => {
      const k = Math.min(50, Math.max(0, Math.round(((y - box.min.y) / height) * 50)));
      return bands[k].n ? bands[k].s / bands[k].n : center.z;
    };
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!(m as THREE.Mesh).isMesh) return;
      if (!m.isSkinnedMesh) {
        // detailed static mesh (no skeleton): areas from body proportions, no subdivision
        const g = (m.geometry as THREE.BufferGeometry).clone();
        g.applyMatrix4(m.matrixWorld);
        g.applyMatrix4(turn);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.index) {
          const ix = new Uint32Array(g.attributes.position.count);
          ix.forEach((_, i) => (ix[i] = i));
          g.setIndex(new THREE.BufferAttribute(ix, 1));
        }
        const gp = g.attributes.position;
        const count = gp.count;
        const area = new Uint8Array(count);
        const H = height;
        for (let i = 0; i < count; i++) {
          // front/back is judged against the body's mid-depth at this height band
          area[i] = AREA_INDEX[areaByShape((gp.getY(i) - minY) / H, Math.abs(gp.getX(i) - center.x), gp.getZ(i) > midZ(gp.getY(i)), H)];
        }
        const isEye = /eye/i.test(m.name) || /eye/i.test(m.geometry.name ?? "");
        parts.push({ geometry: g, area, neighbours: adjacency(g), eye: isEye ? paintEye(g) : undefined });
        return;
      }
      const src = m.geometry;
      const n = src.attributes.position.count;
      const pos = new Float32Array(n * 3);
      const tag = new Uint8Array(n);
      const v = new THREE.Vector3();
      const skinIndex = src.attributes.skinIndex;
      const skinWeight = src.attributes.skinWeight;
      const bones = m.skeleton.bones;
      for (let i = 0; i < n; i++) {
        // bake the posed (skinned) position into world space
        m.getVertexPosition(i, v);
        v.applyMatrix4(m.matrixWorld).applyMatrix4(turn);
        pos.set([v.x, v.y, v.z], i * 3);
        let best = 0;
        let bw = -1;
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k);
          if (w > bw) {
            bw = w;
            best = skinIndex.getComponent(i, k);
          }
        }
        tag[i] = AREA_INDEX[classify(canon(bones[best].name), v)];
      }
      // weld UV seams, then smooth a low-poly body with loop subdivision
      let g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      if (src.index) g.setIndex(src.index.clone());
      g = mergeVertices(g, 1e-5);
      const levels = n < 4000 ? 2 : n < 12000 ? 1 : 0;
      if (levels) g = LoopSubdivision.modify(g, levels, { split: false, uvSmooth: false, preserveEdges: false, flatOnly: false });
      if (!g.index) g = mergeVertices(g, 1e-6);
      g.computeVertexNormals();

      // area of each new vertex = area of the nearest original vertex
      const gp = g.attributes.position;
      const count = gp.count;
      const area = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        const x = gp.getX(i);
        const y = gp.getY(i);
        const z = gp.getZ(i);
        let bd = Infinity;
        let bt = 0;
        for (let j = 0; j < n; j++) {
          const dx = pos[j * 3] - x;
          const dy = pos[j * 3 + 1] - y;
          const dz = pos[j * 3 + 2] - z;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) {
            bd = d;
            bt = tag[j];
          }
        }
        area[i] = bt;
      }

      parts.push({ geometry: g, area, neighbours: adjacency(g) });
    });
    // baked detail maps (normal = sculpted muscles & skin folds, ao = creases) next to the model
    const base = `${import.meta.env.BASE_URL}models/${file.replace(/\.glb$/, "")}`;
    const tl = new THREE.TextureLoader();
    const tex = (url: string) =>
      tl.loadAsync(url).then(
        (t) => {
          t.flipY = false; // glTF UV convention
          t.colorSpace = THREE.NoColorSpace;
          t.anisotropy = 4;
          return t;
        },
        () => null,
      );
    const [normal, ao] = await Promise.all([tex(`${base}_normal.jpg`), tex(`${base}_ao.jpg`)]);
    return { parts, height, center, maps: { normal, ao } };
  }));
}

/* ───────────── colours ───────────── */

const BASE = new THREE.Color("#e2b597"); // natural warm skin
const AVOID = new THREE.Color("#7c6cd4");
const PICK = new THREE.Color("#4c845a");
const HOVER = new THREE.Color("#9cc9a8");
const RAMP = [new THREE.Color("#f6d35b"), new THREE.Color("#f08a2c"), new THREE.Color("#e2452f")];
const heatColor = (t: number, out: THREE.Color) => {
  const x = Math.min(1, Math.max(0, (t - 0.25) / 0.75)) * 2;
  return x < 1 ? out.copy(RAMP[0]).lerp(RAMP[1], x) : out.copy(RAMP[1]).lerp(RAMP[2], x - 1);
};

const VIEWS = [
  { key: "front", label: "หน้า", az: 0 },
  { key: "right", label: "ขวา", az: Math.PI / 2 },
  { key: "back", label: "หลัง", az: Math.PI },
  { key: "left", label: "ซ้าย", az: -Math.PI / 2 },
] as const;

/** 3D medical mannequin — drag to orbit 360°, pinch/scroll to zoom, tap a region to select it */
export function Body3D({
  heatmap = {},
  avoid = [],
  selected = [],
  onToggle,
  compact,
  sex = "ชาย",
  pain,
  element,
  trend,
}: {
  /** pain change since the first visit, shown under the pain badge */
  trend?: { better: boolean; label: string };
  /** latest pain score (0–10) shown as a badge on the stage */
  pain?: number;
  /** ธาตุเจ้าเรือน badge */
  element?: Element;
  /** patient's sex — picks the male or female body */
  sex?: "ชาย" | "หญิง";
  heatmap?: Partial<Record<BodyArea, number>>;
  avoid?: BodyArea[];
  selected?: string[];
  onToggle?: (area: BodyArea) => void;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ paint: () => void; view: (az: number) => void; render: () => void } | null>(null);
  const state = useRef({ heatmap, avoid, selected, onToggle, hover: 0 });
  state.current = { ...state.current, heatmap, avoid, selected, onToggle };
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [active, setActive] = useState<string>("front");

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    let cleanup = () => {};
    loadModel(sex === "หญิง" ? "body_female.glb" : "body_male.glb").then((model) => {
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio)); // retina at 2× costs ~80% more pixels for little visible gain
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      el.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
      const target = model.center.clone();
      target.y -= model.height * 0.03; // a little room under the feet for the ring + label
      const dist = model.height * 2.18; // head to toe fills the frame with a little air
      camera.position.set(target.x, target.y, target.z + dist);

      scene.add(new THREE.HemisphereLight("#ffffff", "#c9d3cf", 0.9));
      const key = new THREE.DirectionalLight("#ffffff", 1.6);
      key.position.set(2, 3, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight("#dfe9ff", 1.1);
      rim.position.set(-2.5, 2, -3);
      scene.add(rim);
      // lights follow the camera so every side of the body stays readable while orbiting
      const lightRig = new THREE.Group();
      lightRig.add(key, rim);
      scene.add(lightRig);

      // soft contact shadow
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g2 = c.getContext("2d")!;
      const grad = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, "rgba(40,60,50,0.35)");
      grad.addColorStop(1, "rgba(40,60,50,0)");
      g2.fillStyle = grad;
      g2.fillRect(0, 0, 128, 128);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(model.height * 0.55, model.height * 0.55), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(target.x, model.center.y - model.height / 2 + 0.002, target.z);
      scene.add(shadow);

      // "you can spin me" ring around the feet: a 300° arc with an arrowhead at each end.
      // It turns with the camera so both arrows always face the viewer; the body hides its back half.
      const ring = new THREE.Group();
      {
        const R = model.height * 0.24;
        const span = (150 * Math.PI) / 180;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 80; k++) {
          const t = -span + (2 * span * k) / 80;
          pts.push(new THREE.Vector3(Math.sin(t) * R, 0, Math.cos(t) * R));
        }
        // soft white, low-key; a faint darker halo underneath keeps it readable on the light stage
        const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false });
        const haloMat = new THREE.MeshBasicMaterial({ color: "#2f4034", transparent: true, opacity: 0.1, depthWrite: false });
        const curve = new THREE.CatmullRomCurve3(pts);
        const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, model.height * 0.0058, 8, false), haloMat);
        halo.renderOrder = 1;
        ring.add(halo);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, model.height * 0.0035, 8, false), ringMat);
        tube.renderOrder = 2;
        ring.add(tube);
        for (const end of [-1, 1]) {
          const t = end * span;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(model.height * 0.013, model.height * 0.032, 18), ringMat);
          cone.position.set(Math.sin(t) * R, 0, Math.cos(t) * R);
          // point along the arc, away from the front
          const tangent = new THREE.Vector3(Math.cos(t), 0, -Math.sin(t)).multiplyScalar(end);
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
          ring.add(cone);
        }
        ring.position.set(target.x, model.center.y - model.height / 2 + model.height * 0.012, target.z);
        ring.renderOrder = 2;
        scene.add(ring);
      }

      // soft studio reflections for natural-looking skin
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();

      // standard (not physical) shading: sheen/clearcoat cost a lot of GPU on iPad and made orbiting stutter
      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        metalness: 0,
        normalMap: model.maps.normal ?? undefined,
        normalScale: new THREE.Vector2(1.1, 1.1),
        aoMap: model.maps.ao ?? undefined,
        aoMapIntensity: 0.9,
      });
      const eyeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 });
      const meshes = model.parts.map((p) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", p.geometry.attributes.position);
        g.setAttribute("normal", p.geometry.attributes.normal);
        if (p.geometry.attributes.uv) g.setAttribute("uv", p.geometry.attributes.uv);
        g.setIndex(p.geometry.index);
        g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(p.area.length * 3), 3));
        if (p.eye) g.setAttribute("color", new THREE.BufferAttribute(p.eye, 3));
        const mesh = new THREE.Mesh(g, p.eye ? eyeMaterial : material);
        mesh.userData.part = p;
        scene.add(mesh);
        return mesh;
      });

      // OrbitControls only handles zoom (wheel / pinch); rotation is our own smoothed orbit below
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.enablePan = false;
      controls.enableRotate = false;
      controls.minDistance = model.height * 0.45;
      controls.maxDistance = model.height * 3;
      controls.update();

      // smooth orbit: the finger moves a *target* angle; the camera eases toward it every frame,
      // and a flick keeps spinning with gently decaying momentum
      const PHI_MIN = 0.55;
      const PHI_MAX = Math.PI - 0.6;
      const start = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      let theta = start.theta;
      let phi = start.phi;
      let tTheta = theta;
      let tPhi = phi;
      let vel = 0;
      let dragging = false;
      const pointers = new Set<number>();
      let last = { x: 0, y: 0, t: 0 };

      let raf = 0;
      let idle = 0;
      let lastView = "front";
      const render = () => {
        lightRig.quaternion.copy(camera.quaternion);
        ring.rotation.y = theta; // arc in front of the feet, arrowheads behind
        renderer.render(scene, camera);
      };
      const sph = new THREE.Spherical();
      let inLoop = false;
      const loop = () => {
        raf = 0;
        inLoop = true;
        if (!dragging && Math.abs(vel) > 1e-5) {
          tTheta += vel;
          vel *= 0.93; // momentum fades out softly
        }
        const dT = tTheta - theta;
        const dP = tPhi - phi;
        theta += dT * 0.16;
        phi += dP * 0.16;
        const zoomed = controls.update(); // zoom damping (radius only)
        sph.setFromVector3(camera.position.clone().sub(controls.target));
        sph.theta = theta;
        sph.phi = phi;
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
        camera.lookAt(controls.target);
        render();
        // which view button is closest
        const a = Math.atan2(Math.sin(theta), Math.cos(theta));
        const nearest = VIEWS.reduce((best, v) => (Math.abs(Math.atan2(Math.sin(a - v.az), Math.cos(a - v.az))) < Math.abs(Math.atan2(Math.sin(a - best.az), Math.cos(a - best.az))) ? v : best));
        if (nearest.key !== lastView) {
          lastView = nearest.key;
          setActive(nearest.key);
        }
        const moving = dragging || zoomed || Math.abs(dT) > 1e-4 || Math.abs(dP) > 1e-4 || Math.abs(vel) > 1e-5;
        idle = moving ? 0 : idle + 1;
        inLoop = false;
        if (idle < 10) raf = requestAnimationFrame(loop);
      };
      // one loop only: "change" fired by controls.update() inside the loop must not schedule a second one
      const kick = () => {
        idle = 0;
        if (!raf && !inLoop) raf = requestAnimationFrame(loop);
      };
      controls.addEventListener("change", kick);

      const SPEED = 0.0075; // radians per pixel
      const orbitDown = (e: PointerEvent) => {
        pointers.add(e.pointerId);
        if (pointers.size > 1) {
          dragging = false; // second finger = pinch zoom
          return;
        }
        dragging = true;
        vel = 0;
        last = { x: e.clientX, y: e.clientY, t: performance.now() };
        renderer.domElement.setPointerCapture?.(e.pointerId);
        kick();
      };
      const orbitMove = (e: PointerEvent) => {
        if (!dragging || !pointers.has(e.pointerId)) return;
        const now = performance.now();
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        tTheta -= dx * SPEED;
        tPhi = Math.min(PHI_MAX, Math.max(PHI_MIN, tPhi - dy * SPEED * 0.7));
        // velocity per frame (16.7ms), smoothed so a flick feels natural
        const dt = Math.max(1, now - last.t);
        vel = vel * 0.6 + ((-dx * SPEED) / dt) * 16.7 * 0.4;
        last = { x: e.clientX, y: e.clientY, t: now };
        kick();
      };
      const orbitUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        if (!dragging) return;
        dragging = false;
        if (performance.now() - last.t > 80) vel = 0; // finger rested before lifting: no flick
        vel = Math.max(-0.08, Math.min(0.08, vel));
        kick();
      };
      renderer.domElement.addEventListener("pointerdown", orbitDown);
      renderer.domElement.addEventListener("pointermove", orbitMove);
      renderer.domElement.addEventListener("pointerup", orbitUp);
      renderer.domElement.addEventListener("pointercancel", orbitUp);

      const tmp = new THREE.Color();
      const hc = new THREE.Color();
      // base colours (heat / do-not-massage / selection, softened across edges) are cached;
      // hover is a cheap overlay on top so moving the mouse never re-runs the smoothing
      const baseCols = new Map<THREE.Mesh, Float32Array>();
      const overlay = () => {
        const hover = state.current.hover;
        for (const mesh of meshes) {
          const p = mesh.userData.part as Part;
          const base = baseCols.get(mesh);
          if (p.eye || !base) continue;
          const col = mesh.geometry.attributes.color as THREE.BufferAttribute;
          const arr = col.array as Float32Array;
          arr.set(base);
          if (hover)
            for (let i = 0; i < p.area.length; i++)
              if (p.area[i] === hover) {
                arr[i * 3] += (HOVER.r - arr[i * 3]) * 0.45;
                arr[i * 3 + 1] += (HOVER.g - arr[i * 3 + 1]) * 0.45;
                arr[i * 3 + 2] += (HOVER.b - arr[i * 3 + 2]) * 0.45;
              }
          col.needsUpdate = true;
        }
        kick();
      };
      const paint = () => {
        const { heatmap: hm, avoid: av, selected: sel } = state.current;
        for (const mesh of meshes) {
          const p = mesh.userData.part as Part;
          if (p.eye) continue;
          const n = p.area.length;
          const smooth = (f: Float32Array, passes: number) => {
            let h = f;
            for (let pass = 0; pass < passes; pass++) {
              const next = new Float32Array(n);
              for (let i = 0; i < n; i++) {
                let s2 = h[i] * 2;
                let w = 2;
                for (let k = p.neighbours.start[i]; k < p.neighbours.start[i + 1]; k++) {
                  s2 += h[p.neighbours.list[k]];
                  w++;
                }
                next[i] = s2 / w;
              }
              h = next;
            }
            return h;
          };
          const field = (fn: (name: BodyArea) => number) => {
            const f = new Float32Array(n);
            for (let i = 0; i < n; i++) f[i] = fn(BODY_AREAS[p.area[i] - 1]);
            return f;
          };
          const passes = n > 20000 ? 7 : 3;
          const h = smooth(field((nm) => hm[nm] ?? 0), passes);
          const av2 = av.length ? smooth(field((nm) => (av.includes(nm) ? 1 : 0)), passes) : null;
          const sl = sel.length ? smooth(field((nm) => (sel.includes(nm) ? 1 : 0)), Math.ceil(passes / 2)) : null;
          const base = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            tmp.copy(BASE);
            if (h[i] > 0.01) tmp.lerp(heatColor(Math.max(h[i], 0.3), hc), Math.min(1, h[i] * 2.4));
            if (av2 && av2[i] > 0.01) tmp.lerp(AVOID, Math.min(0.85, av2[i] * 1.3));
            if (sl && sl[i] > 0.01) tmp.lerp(PICK, Math.min(0.8, sl[i] * 1.2));
            base[i * 3] = tmp.r;
            base[i * 3 + 1] = tmp.g;
            base[i * 3 + 2] = tmp.b;
          }
          baseCols.set(mesh, base);
        }
        overlay();
      };

      // picking
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const pick = (e: PointerEvent): { area: number; x: number; y: number } | null => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit || !hit.face) return null;
        const p = hit.object.userData.part as Part;
        return { area: p.area[hit.face.a], x: e.clientX - r.left, y: e.clientY - r.top };
      };
      let down: { x: number; y: number } | null = null;
      const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
        down = null;
        const h = pick(e);
        if (!h) return setTip(null);
        const name = BODY_AREAS[h.area - 1];
        setTip({ x: h.x, y: h.y, label: name });
        state.current.onToggle?.(name);
      };
      let lastMove = 0;
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || e.buttons) return;
        const now = performance.now();
        if (now - lastMove < 60) return; // raycasting ~90k triangles is not free — throttle hover
        lastMove = now;
        const h = pick(e);
        const a = h?.area ?? 0;
        if (a !== state.current.hover) {
          state.current.hover = a;
          renderer.domElement.style.cursor = a && state.current.onToggle ? "pointer" : "grab";
          overlay();
        }
      };
      const onLeave = () => {
        if (state.current.hover) {
          state.current.hover = 0;
          overlay();
        }
      };
      const cv = renderer.domElement;
      cv.addEventListener("pointerdown", onDown);
      cv.addEventListener("pointerup", onUp);
      cv.addEventListener("pointermove", onMove);
      cv.addEventListener("pointerleave", onLeave);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        kick();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      api.current = {
        paint,
        render: kick,
        view: (az) => {
          // shortest way round, eased by the same orbit smoothing
          vel = 0;
          tTheta = theta + Math.atan2(Math.sin(az - theta), Math.cos(az - theta));
          tPhi = Math.PI / 2;
          kick();
        },
      };
      paint();
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        material.dispose();
        eyeMaterial.dispose();
        envTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        cv.remove();
      };
    });
    return () => {
      disposed = true;
      cleanup();
      api.current = null;
    };
  }, [sex]);

  // repaint when the data changes
  const sig = JSON.stringify([heatmap, avoid, selected]);
  useEffect(() => {
    api.current?.paint();
  }, [sig]);

  const legend = Object.keys(heatmap).length > 0 || avoid.length > 0;
  return (
    <div className={clsx("b3", compact && "b3--compact", onToggle && "is-live")}>
        <div className={clsx("b3__stage", element && "has-el")} ref={host}>
        {!ready && (
          <span className="b3__loading">
            <Loader2 size={18} className="spin" /> กำลังโหลดหุ่น 3D…
          </span>
        )}
        <button type="button" className="b3__reset" aria-label="มุมเริ่มต้น" title="มุมเริ่มต้น" onClick={() => api.current?.view(0)}>
          <RotateCcw size={14} />
        </button>
        {(pain !== undefined || element) && (
          <div className="b3__badges">
            {pain !== undefined && (
              <span className="b3__pain">
                <PainGauge value={pain} size={30} />
                <span>
                  <small>Pain</small>
                  <strong style={{ color: painTone(pain)[1] }}>{pain === 0 ? "ไม่ปวด" : pain <= 3 ? "เล็กน้อย" : pain <= 6 ? "ปานกลาง" : "มาก"}</strong>
                  {trend && (
                    <em className={clsx("b3__trend", trend.better ? "is-good" : "is-bad")}>
                      {trend.better ? <TrendingDown size={11} strokeWidth={2.6} /> : <TrendingUp size={11} strokeWidth={2.6} />}
                      {trend.label}
                    </em>
                  )}
                </span>
              </span>
            )}
            {element && (
              <span className="b3__el" style={{ ["--ec" as string]: ELEMENT_INFO[element].color, ["--et" as string]: ELEMENT_INFO[element].tint }}>
                <i>
                  <ElementIcon element={element} size={15} strokeWidth={2.2} />
                </i>
                <span>
                  <small>ธาตุเจ้าเรือน</small>
                  <strong>{element}</strong>
                </span>
              </span>
            )}
          </div>
        )}
        {ready && <span className="b3__spin">ลากเพื่อหมุนดูรอบตัว 360°</span>}
        {tip && (
          <span className="b3__tip" style={{ left: tip.x, top: tip.y }} onAnimationEnd={() => setTip(null)}>
            {tip.label}
            {onToggle ? (selected.includes(tip.label) ? " · เลือกแล้ว" : " · ไม่ได้เลือก") : heatmap[tip.label as BodyArea] ? " · ปวด/เน้น" : avoid.includes(tip.label as BodyArea) ? " · ไม่นวด" : ""}
          </span>
        )}
      </div>
      <div className="b3__bar">
        <div className="b3__views">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={active === v.key} onClick={() => api.current?.view(v.az)}>
              {v.label}
            </button>
          ))}
        </div>

      </div>
      {legend && (
        <div className="b3__legend">
          <span className="b3__scale">
            <i /> ปวดน้อย → มาก
          </span>
          {avoid.length > 0 && (
            <span>
              <i className="b3__no" /> ไม่นวด
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** [light, deep] colours for a pain level */
export const painTone = (v: number): [string, string] => (v >= 7 ? ["#ff8a6b", "#d8392a"] : v >= 4 ? ["#ffd36b", "#e08a1e"] : ["#8fdcae", "#2f9a5b"]);

/** ring gauge: gradient arc with rounded ends and a soft glow, number in the middle, animates in */
export function PainGauge({ value, size = 42 }: { value: number; size?: number }) {
  const id = useId().replace(/:/g, "");
  const [a, b] = painTone(value);
  const W = size < 36 ? 3.5 : 5;
  const R = (size - W) / 2 - 1;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0.04, Math.min(1, value / 10));
  return (
    <span className="b3__gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={`pg-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={a} />
            <stop offset="100%" stopColor={b} />
          </linearGradient>
          <filter id={`pgf-${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor={b} floodOpacity="0.45" />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(47,64,52,0.09)" strokeWidth={W} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          stroke={`url(#pg-${id})`}
          strokeWidth={W}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={`url(#pgf-${id})`}
          className="b3__gauge-arc"
          style={{ ["--c" as string]: C }}
        />
      </svg>
      <b style={{ color: b, fontSize: Math.round(size * 0.36) }}>{value}</b>
    </span>
  );
}
