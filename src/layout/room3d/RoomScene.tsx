import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildRoom } from "./build";
import { buildSala } from "./sala";
import { buildReception } from "./reception";
import "../backdrop/backdrop.css";

interface Props {
  variant?: "reception" | "sala" | "studio";
  work: boolean;
  onReady?: (ready: boolean) => void;
  /** reception only: outside the clinic (signed out), gliding in, or at the desk */
  entrance?: "outside" | "enter" | "inside";
  onEntered?: () => void;
}

/** door-and-glide timing (seconds) */
const ENTER_S = 3;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10); // smootherstep
};

/** Film finish: warm grade, vignette, grain, veil for work pages. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDim: { value: 0 }, uVig: { value: 0.35 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uDim; uniform float uVig; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      col *= vec3(1.04, 1.0, 0.94);                                  // warm grade
      vec2 v = vUv - 0.5;
      col *= 1.0 - dot(v, v) * uVig;                                 // vignette
      col += (h(vUv * 800.0) - 0.5) * 0.018;                         // grain
      col = mix(col, vec3(0.06, 0.045, 0.03), uDim);                  // veil
      gl_FragColor = vec4(col, c.a);
    }`,
};

export default function RoomScene({ variant = "reception", work, onReady, entrance = "inside", onEntered }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const workRef = useRef(work);
  workRef.current = work;
  const entRef = useRef(entrance);
  entRef.current = entrance;
  const enteredRef = useRef(onEntered);
  enteredRef.current = onEntered;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = () => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    } catch {
      onReady?.(false);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = variant === "reception" ? 1.25 : 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap; // soft, studio-like penumbras
    renderer.shadowMap.autoUpdate = false; // lights never move — bake shadows, refresh occasionally
    el.appendChild(renderer.domElement);
    renderer.domElement.className = "live-bg";

    performance.mark("room:build:start");
    const room = variant === "studio" ? buildRoom() : variant === "sala" ? buildSala() : buildReception();
    performance.measure("room:build", "room:build:start");
    const { scene } = room;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.12;

    // near plane 0.1 (not 0.05): 2× depth precision, no z-fighting on the pool's thin layers
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
    const deskPos = room.camera.position.clone();
    const deskTarget = room.camera.target.clone();
    const FOCUS = room.camera.focus;
    const E = "entrance" in room ? (room as { entrance: import("./reception").Entrance }).entrance : null;
    const camBase = deskPos.clone();
    const target = deskTarget.clone();
    let enterStart = -1;
    let enterDone = false;
    let lastMode = "";
    let wasInside: boolean | null = null;

    // 4× MSAA, HDR half-float buffer
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    composer.addPass(gtao);
    // Sprites/points (flames, steam, dust) must not enter the AO/DOF depth & normal passes,
    // or they render as opaque quads there (dark blocks, wrong focus).
    const fx: THREE.Object3D[] = [];
    scene.traverse((o) => ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || o.userData.fx) && fx.push(o));
    const hideFx = <P extends { render: (...a: never[]) => void }>(pass: P) => {
      const orig = pass.render.bind(pass);
      pass.render = ((...a: never[]) => {
        fx.forEach((o) => (o.visible = false));
        orig(...a);
        fx.forEach((o) => (o.visible = true));
      }) as P["render"];
    };
    hideFx(gtao);
    const bokeh = new BokehPass(scene, camera, { focus: FOCUS, aperture: 0.0012, maxblur: 0.006 });
    composer.addPass(bokeh);
    {
      // BokehPass renders its own depth pass: keep effects out of it, but in the final image
      const b = bokeh as unknown as { scene: THREE.Scene; render: (...a: unknown[]) => void };
      const orig = b.render.bind(b);
      b.render = (...a: unknown[]) => {
        const prev = b.scene.overrideMaterial;
        fx.forEach((o) => (o.visible = false));
        orig(...a);
        fx.forEach((o) => (o.visible = true));
        b.scene.overrideMaterial = prev;
      };
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), variant === "sala" ? 0.35 : 0.55, 0.6, variant === "sala" ? 0.95 : 0.86);
    composer.addPass(bloom);
    const grade = new ShaderPass(GradeShader);
    grade.uniforms.uVig.value = variant === "reception" ? 0.22 : 0.35;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    const bu = bokeh.uniforms as unknown as Record<"focus" | "aperture" | "maxblur", { value: number }>;

    const s = {
      par: new THREE.Vector2(), parT: new THREE.Vector2(),
      focus: FOCUS, focusT: FOCUS,
      aperture: workRef.current ? 0.05 : 0.0012, maxblur: workRef.current ? 0.02 : 0.006, dim: workRef.current ? 0.34 : 0,
      dragging: false,
    };
    let dpr = 0;
    // adaptive quality: start sharp, step down if the device can't hold ~30fps
    let quality = 1; // 1 = full (≤2× dpr + AO), 0.5 = reduced
    // same resolution on every page: switching it reallocates every render target (multi-second hitch on iPad)
    // A soft, depth-of-field background behind the UI: 1× pixels look the same as Retina here,
    // and cost a quarter of the GPU time (full 2× rendering dragged the whole UI to ~12fps on iPad).
    const targetDpr = () => Math.min(window.devicePixelRatio || 1, quality === 1 ? 1 : 0.75);
    let lockedH = 0;
    const resize = () => {
      const w = window.innerWidth;
      // ignore small height changes (Safari toolbars collapsing while scrolling)
      if (!lockedH || Math.abs(window.innerHeight - lockedH) > 140 || w !== renderer.domElement.clientWidth) lockedH = window.innerHeight;
      const h = lockedH;
      const want = targetDpr();
      dpr = want;
      renderer.setPixelRatio(want);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(want);
      composer.setSize(w, h);
      camera.aspect = w / h;
      // keep the room framed on portrait iPads
      camera.fov = w / h < 1 ? 50 : 36;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const clock = new THREE.Timer();
    let raf = 0;
    let last = 0;
    let frames = 0;
    let avgMs = 16;
    const tmp = new THREE.Vector3();
    const wobble = (t: number, sd: number) => 0.82 + 0.09 * Math.sin(t * 9.1 + sd) + 0.06 * Math.sin(t * 23.7 + sd * 2.1) + 0.05 * Math.sin(t * 3.3 + sd * 3.7);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // 30fps ambience — but the entrance glide runs at full rate so it stays silky
      const gliding = !!E && entRef.current === "enter" && !enterDone;
      if (!gliding && now - last < 1000 / 31) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      const t0f = performance.now();
      last = now;
      clock.update(now);
      const t = reduced ? 0 : clock.getElapsed();
      const isWork = workRef.current;
      if (targetDpr() !== dpr) resize();
      gtao.enabled = !isWork && quality === 1;
      // frame-time watchdog (after warm-up)
      if (frames > 40 && frames % 30 === 0 && quality === 1 && avgMs > 48) {
        quality = 0.5;
        resize();
      }

      // entrance: outside the doors → doors slide open → glide through to the desk
      if (E) {
        const mode = entRef.current;
        if (mode !== lastMode) {
          if (mode === "enter") {
            enterStart = now;
            enterDone = false;
          }
          if (mode === "outside") enterDone = false;
          lastMode = mode;
          renderer.shadowMap.needsUpdate = true;
        }
        const p = mode === "inside" ? 1 : mode === "outside" ? 0 : Math.min(1, (now - enterStart) / 1000 / ENTER_S);
        if (mode === "enter" && p >= 1 && !enterDone) {
          enterDone = true;
          enteredRef.current?.();
        }
        E.setOpen(p / 0.32);
        const c = smooth((p - 0.08) / 0.92);
        // a slow idle sway while waiting outside
        const sway = 0; // a locked-off camera: any drift makes leaf cards and thin edges shimmer
        // quadratic Bézier through a point just outside the doors, so the glide lines up with the doorway
        const via = E.camera.via;
        if (via) {
          const u = 1 - c;
          camBase.copy(E.camera.position).multiplyScalar(u * u).addScaledVector(via, 2 * u * c).addScaledVector(deskPos, c * c);
        } else camBase.lerpVectors(E.camera.position, deskPos, c);
        camBase.x += sway * (1 - c);
        // rise slightly as we step in, settle at desk height
        camBase.y += Math.sin(c * Math.PI) * 0.06;
        target.lerpVectors(E.camera.target, deskTarget, smooth((p - 0.2) / 0.8));
        s.focusT = E.camera.focus + (FOCUS - E.camera.focus) * c;
        const inside = p >= 1;
        if (inside !== wasInside) {
          E.setInside(inside);
          wasInside = inside;
          renderer.shadowMap.needsUpdate = true;
        }
        if (!inside) E.tick?.(t);
        // the street is lit by full daylight; the lobby reads calmer at a lower exposure
        renderer.toneMappingExposure = 1.2 + (0.98 - 1.2) * c;
        for (const L of E.lights) L.light.intensity = inside ? L.inside : L.base;
        if (gliding && frames % 6 === 0) renderer.shadowMap.needsUpdate = true;
      }

      // camera: pointer/finger parallax + slow breathing drift
      // locked-off camera: the room never moves, only its flames, steam and dust do
      const idleX = 0;
      const idleY = 0;
      const tx = s.dragging ? s.parT.x : s.parT.x + idleX;
      const ty = s.dragging ? s.parT.y : s.parT.y + idleY;
      s.par.x += (tx - s.par.x) * 0.07;
      s.par.y += (ty - s.par.y) * 0.07;
      camera.position.set(camBase.x + s.par.x * 0.42, camBase.y - s.par.y * 0.2, camBase.z);
      camera.lookAt(target.x + s.par.x * 0.1, target.y - s.par.y * 0.05, target.z);

      room.tick?.(t);
      // candles: flicker, gusts from taps, lights follow their flames
      const flick = room.candles.map((c) => {
        c.gust = Math.max(0, c.gust - dt * 0.9);
        const f = reduced ? 0.9 : wobble(t, c.seed) - c.gust * (0.3 + 0.3 * Math.sin(t * 31 + c.seed));
        c.flame.scale.set(c.baseScale.x * (0.92 + 0.12 * f), c.baseScale.y * (0.82 + 0.28 * f) * (1 + c.gust * 0.3), 1);
        const lean = c.gust * 0.018 * Math.sin(t * 17 + c.seed) + (reduced ? 0 : Math.sin(t * 1.3 + c.seed) * 0.0015);
        c.flame.material.rotation = -lean * 12;
        c.wax.emissiveIntensity = 0.45 + 0.65 * f;
        return f;
      });
      for (const L of room.candleLights) {
        const f = L.members.reduce((a, i) => a + flick[i], 0) / L.members.length;
        L.light.intensity = L.base * (0.72 + 0.35 * f);
      }
      room.pendant.light.intensity = room.pendant.base * (0.97 + 0.03 * Math.sin(t * 0.8));

      // aroma steam
      room.steam.burst = Math.max(0, room.steam.burst - dt * 0.5);
      for (const sp of room.steam.sprites) {
        const { phase, seed } = sp.userData as { phase: number; seed: number };
        const p = (t * (0.12 + room.steam.burst * 0.2) + phase) % 1;
        const hgt = p * (0.75 + room.steam.burst * 0.5);
        tmp.copy(room.steam.origin);
        tmp.x += Math.sin(t * 0.7 + seed + p * 4) * 0.06 * p + p * 0.08;
        tmp.z += Math.cos(t * 0.5 + seed) * 0.04 * p;
        tmp.y += hgt;
        sp.position.copy(tmp);
        const sc = 0.05 + p * (0.38 + room.steam.burst * 0.2);
        sp.scale.set(sc, sc, 1);
        sp.material.opacity = Math.sin(p * Math.PI) * (0.16 + room.steam.burst * 0.22);
        sp.material.rotation = seed + p * 2;
      }

      // leaves & curtains in a faint breeze
      for (const L of room.leaves) {
        L.mesh.rotation.z = L.base.z + Math.sin(t * 0.7 + L.seed) * 0.035;
        L.mesh.rotation.x = L.base.x + Math.sin(t * 0.5 + L.seed * 2) * 0.02;
      }
      if (!reduced && frames % 2 === 0) {
        for (const c of room.curtains) {
          const pos = c.mesh.geometry.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) {
            const x = c.rest[i * 3];
            const y = c.rest[i * 3 + 1];
            const w = (1.25 - y) / 2.5; // hem moves, rail stays
            pos.setZ(i, c.rest[i * 3 + 2] + Math.sin(t * 0.8 + x * 3 + y * 0.6) * 0.03 * w * w);
          }
          pos.needsUpdate = true;
          c.mesh.geometry.computeVertexNormals();
        }
      }

      // dust rising slowly through the light
      const dp = room.dust.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < dp.count; i++) {
        let y = dp.getY(i) + dt * 0.025;
        if (y > 2.8) y = 0.3;
        dp.setY(i, y);
        dp.setX(i, dp.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.01);
      }
      dp.needsUpdate = true;

      // depth of field / veil easing
      s.focus += (s.focusT - s.focus) * 0.08;
      s.aperture += ((isWork ? 0.05 : 0.0012) - s.aperture) * 0.1;
      s.maxblur += ((isWork ? 0.02 : 0.006) - s.maxblur) * 0.1;
      s.dim += ((isWork ? 0.34 : 0) - s.dim) * 0.1;
      bu.focus.value = s.focus;
      bu.aperture.value = s.aperture;
      bu.maxblur.value = s.maxblur;
      grade.uniforms.uTime.value = t;
      grade.uniforms.uDim.value = s.dim;

      if (frames < 3 || frames % 90 === 0) renderer.shadowMap.needsUpdate = true;
      if (frames === 3 && room.envProbe) {
        // bake the room into its own reflection probe once shadows exist
        fx.forEach((o) => (o.visible = false));
        const prevEnv = scene.environment;
        scene.environment = null;
        const probe = pmrem.fromScene(scene, 0.015, 0.05, 30, { size: 256, position: room.envProbe.position });
        scene.environment = probe.texture;
        scene.environmentIntensity = room.envProbe.intensity;
        prevEnv?.dispose();
        fx.forEach((o) => (o.visible = true));
      }
      if (frames === 0) performance.mark("room:render0:start");
      composer.render();
      if (frames === 0) performance.measure("room:render0", "room:render0:start");
      avgMs = avgMs * 0.9 + (performance.now() - t0f) * 0.1;
      frames++;
      if (frames === 2) {
        setReady(true);
        onReady?.(true);
      }
    };
    // compile every shader in parallel (KHR_parallel_shader_compile) before the first frame,
    // instead of stalling the main thread for seconds inside the first render
    let disposed = false;
    renderer
      .compileAsync(scene, camera)
      .catch(() => {})
      .finally(() => {
        if (!disposed) raf = requestAnimationFrame(frame);
      });

    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setReady(false);
      onReady?.(false);
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mt) => {
          Object.values(mt).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          mt.dispose();
        });
      });
      composer.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    };
    // Let the UI paint and finish its entrance animation first; the room fades in afterwards.
    let cleanup: void | (() => void);
    const timer = window.setTimeout(() => {
      cleanup = mount();
    }, 650);
    return () => {
      window.clearTimeout(timer);
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={host} className={`room3d${ready ? " room3d--on" : ""}`} aria-hidden />
    </>
  );
}
