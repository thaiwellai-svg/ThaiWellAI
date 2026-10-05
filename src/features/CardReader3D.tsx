/* eslint-disable */
import { Suspense, useEffect, useMemo, useRef } from "react";
import type React from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import idFace from "../assets/cardreader/id_face.png";
import idChip from "../assets/cardreader/id_chip.png";
import readerBody from "../assets/cardreader/reader_body.png";
import * as THREE from "three";

/** ported from AtlasHomeCareRN (CardReader3D) */
export type ReaderState = "checking" | "ready" | "missing" | "reading";

/*
  The reader and the card as a real scene, not two pictures.

  Two things have to be true at once, and they pull against each other. Seen
  square on — which is how the screen shows it at rest — it has to be the
  photograph, pixel for pixel: a black plastic case shaded by three lamps is
  a *render*, and no amount of fiddling with roughness closes the gap to a
  studio shot of the real thing. But it also has to be an object, so that the
  card goes *into* it rather than behind a cut-out, and so that tipping the
  phone moves it.

  So the photograph is the model's skin. The outline you see is the real
  one — traced off the alpha of the product shot, 128 points around, and
  extruded to the case's true thickness — and the picture is projected flat
  onto the front of that solid. Square on, every pixel is the photograph.
  Turn it and the silhouette turns with it, the moulding has depth, the slot
  in the top edge opens, and the card slides down inside the body.

  The light is arranged to leave the photograph alone. A white ambient at
  full strength reproduces a texture exactly — that is what Lambert shading
  does with uniform irradiance — so the lamps are turned almost off and do
  nothing but shape the edges. What is left for them is the clear coat: a
  thin gloss over both the case and the card that the baked picture cannot
  have, whose highlight slides across as the phone tilts. That moving sheen
  is the whole of the live lighting, and it is the part a flat image can't
  fake.
*/

const MM = 0.1;

/**
 * The case, from the product shot: 265 x 277 in the picture, and 65 mm
 * across in the hand. The thickness is the one the ACS reader has.
 */
const CASE = {
  width: 65 * MM,
  height: 65 * MM * (277 / 265),
  depth: 16 * MM,
  /** How far the front rolls back before the widest line of the body. */
  bevel: 1.7 * MM,
  /** How much of the depth that roll takes. */
  roll: 4.2 * MM,
};

/**
 * The case's silhouette, traced from the photograph's alpha.
 *
 * Pairs of x, y, scaled by the picture's width and measured from its centre,
 * so the outline and the texture that goes on it cannot drift apart. Flat
 * rather than nested so it is a screenful, not four.
 */
// prettier-ignore
const OUTLINE = [
  0.01015,0.51927, 0.06587,0.51899, 0.10567,0.5178, 0.1366,0.51593,
  0.1657,0.5134, 0.19475,0.51022, 0.22372,0.50646, 0.25262,0.50215,
  0.28144,0.49739, 0.31024,0.49258, 0.33907,0.4883, 0.36779,0.48422,
  0.39581,0.47845, 0.42206,0.46867, 0.44533,0.454, 0.46447,0.43496,
  0.47859,0.41239, 0.48752,0.38705, 0.49208,0.35974, 0.49384,0.33123,
  0.49428,0.30219, 0.4944,0.273, 0.49475,0.24392, 0.49564,0.21506,
  0.49682,0.18632, 0.4977,0.15745, 0.49805,0.12837, 0.49811,0.09916,
  0.49811,0.06993, 0.49811,0.0407, 0.49811,0.01147, 0.49811,-0.01776,
  0.49811,-0.04699, 0.49811,-0.07622, 0.49811,-0.10545, 0.49811,-0.13468,
  0.49811,-0.16391, 0.49811,-0.19314, 0.49811,-0.22237, 0.49811,-0.2516,
  0.49811,-0.28083, 0.49811,-0.31006, 0.49802,-0.33925, 0.49729,-0.36818,
  0.49447,-0.39624, 0.48768,-0.42263, 0.47566,-0.44665, 0.45841,-0.46761,
  0.43667,-0.4845, 0.41146,-0.49622, 0.38394,-0.50273, 0.35524,-0.50545,
  0.32611,-0.50636, 0.29689,-0.50674, 0.26766,-0.50706, 0.23844,-0.50738,
  0.20921,-0.50769, 0.17998,-0.50801, 0.15075,-0.50833, 0.12162,-0.50874,
  0.09339,-0.50969, 0.06813,-0.51185, 0.04712,-0.51514, 0.02783,-0.51822,
  0.00661,-0.51965, -0.01583,-0.51902, -0.03641,-0.517, -0.05617,-0.51474,
  -0.07897,-0.51321, -0.10581,-0.51249, -0.13466,-0.51212, -0.16389,-0.51181,
  -0.19312,-0.51151, -0.22235,-0.51121, -0.25157,-0.5109, -0.2808,-0.5106,
  -0.31003,-0.51027, -0.3392,-0.50965, -0.3681,-0.50778, -0.39619,-0.50287,
  -0.42248,-0.49324, -0.44564,-0.47834, -0.46446,-0.45882, -0.47806,-0.43574,
  -0.48643,-0.41004, -0.49079,-0.38262, -0.49292,-0.35427, -0.49393,-0.32545,
  -0.49428,-0.29637, -0.49434,-0.26716, -0.49434,-0.23793, -0.49434,-0.2087,
  -0.49434,-0.17947, -0.49434,-0.15024, -0.49434,-0.12106, -0.49434,-0.09213,
  -0.49434,-0.06363, -0.49434,-0.03537, -0.49434,-0.00688, -0.49434,0.02206,
  -0.49434,0.05124, -0.49434,0.08047, -0.49434,0.1097, -0.49434,0.13893,
  -0.49434,0.16816, -0.49434,0.19739, -0.49434,0.22662, -0.49434,0.25585,
  -0.49434,0.28508, -0.49423,0.31427, -0.49344,0.34317, -0.49064,0.37124,
  -0.48415,0.39776, -0.47273,0.42201, -0.45603,0.44323, -0.43462,0.46046,
  -0.40964,0.47287, -0.38234,0.48069, -0.35388,0.48557, -0.32507,0.48973,
  -0.29626,0.49429, -0.26745,0.49909, -0.23859,0.50363, -0.20965,0.50772,
  -0.18065,0.5113, -0.14982,0.5143, -0.11009,0.51672, -0.0544,0.51846
];

/** The card — an ID-1 card, as every one is. */
const CARD = {
  width: 85.6 * MM,
  height: 54 * MM,
  depth: 0.8 * MM,
  /**
   * The corner. ID-1 says 3.18; the artwork rounds its corners at nearly
   * five, and the body has to be at least as round as its own face or the
   * face's clear corners show the plastic underneath as a notch.
   */
  radius: 4.8 * MM,
  /**
   * How much is still out when it is home.
   *
   * A card goes in on its short edge, chip end first, and the slot is only
   * as deep as the case is tall — a reader this size takes a little under
   * half the card and stops, with the rest standing out where a hand can
   * still get hold of it.
   */
  proud: 43 * MM,
  /** Clear of the mouth at the top of the demonstration. */
  gap: 3 * MM,
};

/**
 * The card is turned a quarter before it goes in.
 *
 * A slot cannot be wider than the case it is cut into, and the case is
 * 65 mm across, so the long edge can never be the leading one: every reader
 * takes the card on its 54 mm edge — the end the chip and the barcode sit
 * against — with the face upward. Turning it is not a flourish, it is the
 * only way round it fits, and it is the way round the instruction under the
 * picture is describing.
 */
const TURN = Math.PI / 2;
/** Along the way in, once it is turned. */
const SPAN = CARD.width;

/**
 * The chip, where the artwork paints it — measured off the texture so the
 * gold sits exactly over the printed one and hides it.
 */
const CHIP = {
  x: (121 / 516 - 0.5) * CARD.width,
  y: (0.5 - 139.5 / 324) * CARD.height,
  width: (70 / 516) * CARD.width,
  height: (57 / 324) * CARD.height,
  radius: (4 / 516) * CARD.width,
  /** Above the face. A real contact plate is near flush; this one catches light. */
  proud: 0.22 * MM,
};


/**
 * Where the card's centre sits in each state. The mouth is the top of the
 * case; "seated" leaves `proud` of the card above it.
 */
const MOUTH_Y = CASE.height / 2;

/**
 * How far the whole thing is tipped toward us at rest: not at all.
 *
 * It was ten degrees, to open up the slit in the top edge — and what that
 * opened up was the whole top of the case, which read as a second object
 * sitting on the first. Square on, the front is the photograph and nothing
 * else, which is the look this page had when it was right. The slit is
 * still there, cut into the skin; tip the phone and it comes into view the
 * way it would on the real thing.
 */
const LEAN = 0;
const CARD_Y = {
  waiting: MOUTH_Y + CARD.gap + SPAN / 2,
  seated: MOUTH_Y + CARD.proud - SPAN / 2,
};

/**
 * The demonstration, in seconds from the top of each loop.
 *
 * It only runs once the reader has answered: until then there is nothing to
 * show a card going into, and a card on screen while the page is still
 * asking whether the reader is plugged in is telling the carer to do a thing
 * that may not be possible. So the first beat of the page is the reader on
 * its own with its lamp, and the card arrives as the answer to that.
 */
const DEMO = { enter: 0.45, travel: 1.3, hold: 1.55, leave: 0.45, rest: 0.45 };
const DEMO_IN = DEMO.enter + DEMO.travel;
const DEMO_OUT = DEMO_IN + DEMO.hold;
const DEMO_END = DEMO_OUT + DEMO.leave;
const DEMO_LOOP = DEMO_END + DEMO.rest;

/** Slow at both ends, which is what a hand pushing something does. */
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Split an extrusion's two end caps apart.
 *
 * `ExtrudeGeometry` files both of them under one material — back first, then
 * front — which is no use when only one of them carries a picture. The seam
 * is wherever the triangles start facing the camera, so the run is cut there
 * and the halves are handed to two materials, leaving the side walls as they
 * were.
 */
function splitCaps(geo: THREE.BufferGeometry, front: number, wall: number, back: number) {
  const [caps, walls] = geo.groups;
  const pos = geo.getAttribute("position");
  let seam = caps.start + caps.count;
  for (let i = caps.start; i < caps.start + caps.count; i += 3) {
    if (pos.getZ(i) > 0) {
      seam = i;
      break;
    }
  }
  geo.clearGroups();
  geo.addGroup(caps.start, seam - caps.start, back);
  geo.addGroup(seam, caps.start + caps.count - seam, front);
  geo.addGroup(walls.start, walls.count, wall);
}

/**
 * A flat projection of the picture onto whichever cap faces us.
 *
 * The extrusion triangulates the outline however it likes, so the texture
 * coordinates are taken from where each corner *is* rather than from the
 * order it arrived in. That is what keeps the photograph square on the face
 * however the tessellation falls out.
 */
function planarUV(width: number, height: number) {
  const at = (x: number, y: number) =>
    new THREE.Vector2(x / width + 0.5, y / height + 0.5);
  const none = new THREE.Vector2(0, 0);
  return {
    generateTopUV(_g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) {
      return [
        at(v[a * 3], v[a * 3 + 1]),
        at(v[b * 3], v[b * 3 + 1]),
        at(v[c * 3], v[c * 3 + 1]),
      ];
    },
    generateSideWallUV() {
      return [none, none, none, none];
    },
  };
}

/*
  There is no opening in the case.

  Several were tried — a box in the top, a bite out of the outline, a slit
  cut from the skin — and each one, seen from the front, was a thing on the
  reader rather than a way into it. The card does what it did in the design's
  own drawing: it goes down behind the top edge and is gone, because the
  front of the case is in front of it. Nothing needs to be cut for that to be
  true, and nothing is.
*/

/** The case: the traced outline, given its real thickness. */
function caseBody() {
  const s = CASE.width;
  const shape = new THREE.Shape();
  for (let i = 0; i < OUTLINE.length; i += 2) {
    const x = OUTLINE[i] * s;
    const y = OUTLINE[i + 1] * s;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const core = CASE.depth - CASE.roll * 2;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: true,
    bevelThickness: CASE.roll,
    bevelSize: CASE.bevel,
    bevelSegments: 8,
    curveSegments: 1,
    UVGenerator: planarUV(CASE.width, CASE.height),
  });
  geo.translate(0, 0, -core / 2);
  splitCaps(geo, 0, 1, 2);
  return geo;
}

/**
 * The card's body: a rounded slab with a bevelled edge, not a box.
 *
 * Extruded from the ID-1 outline so the corners are actually round and the
 * edge actually chamfers — under a light, a box's corner is a spike and its
 * edge is a line, and both give it away.
 */
function cardBody() {
  const w = CARD.width / 2;
  const h = CARD.height / 2;
  const r = CARD.radius;
  const bevel = 0.12 * MM;

  const outline = new THREE.Shape();
  outline.moveTo(-w + r, -h);
  outline.lineTo(w - r, -h);
  outline.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  outline.lineTo(w, h - r);
  outline.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  outline.lineTo(-w + r, h);
  outline.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  outline.lineTo(-w, -h + r);
  outline.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);

  const core = CARD.depth - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(outline, {
    depth: core,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
    UVGenerator: planarUV(CARD.width, CARD.height),
  });
  geo.translate(0, 0, -core / 2);
  splitCaps(geo, 0, 1, 2);
  return geo;
}

/**
 * The contact plate: the chip's own outline, raised off the face.
 *
 * Rounded at the corners the way the moulded module is, and extruded barely
 * a fifth of a millimetre — which is all a real one stands proud, and enough
 * for its edge to catch a lamp as the phone turns.
 */
function chipPlate() {
  const w = CHIP.width / 2;
  const h = CHIP.height / 2;
  const r = CHIP.radius;
  const outline = new THREE.Shape();
  outline.moveTo(-w + r, -h);
  outline.lineTo(w - r, -h);
  outline.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  outline.lineTo(w, h - r);
  outline.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  outline.lineTo(-w + r, h);
  outline.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  outline.lineTo(-w, -h + r);
  outline.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);

  const geo = new THREE.ExtrudeGeometry(outline, {
    depth: CHIP.proud,
    bevelEnabled: true,
    bevelThickness: 0.03 * MM,
    bevelSize: 0.03 * MM,
    bevelSegments: 1,
    curveSegments: 8,
    UVGenerator: planarUV(CHIP.width, CHIP.height),
  });
  splitCaps(geo, 0, 1, 2);
  return geo;
}

/**
 * A picture used as a skin: exactly the pixels that were shot, and sharp at
 * a glancing angle.
 */
function skin(tex: THREE.Texture) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The window a laminated card reflects, as a texture.
 *
 * A card is flat, and a flat surface under a lamp has no moving highlight in
 * it at all: every point on it shares one normal, so the whole face either
 * catches the light or does not, all at once. What actually travels across a
 * card in the hand is a *reflection* — the window, the ceiling panel — and a
 * reflection needs something to reflect. There is no room in this scene to
 * reflect, so the room is drawn.
 *
 * One soft streak, and nothing else. It was two hard bands repeating across
 * the face, which put a seam down the card where the pattern wrapped and
 * read as a stripe painted on rather than a light lying on it. This is a
 * single smear, brightest along its spine and gone by every edge of the
 * texture, so it can be slid about without ever wrapping — off the side of
 * the card and back on, the way a reflection does when you turn something
 * over in your hand.
 */
function sheenTexture() {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  // Leaning the way light falls in the rest of the scene: down from the
  // upper left.
  const angle = -0.42;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n - 0.5;
      const v = (y + 0.5) / n - 0.5;
      // Across the streak, and along it.
      const a = u * cos - v * sin;
      const b = u * sin + v * cos;

      // A bright core inside a much wider haze: a window has an edge, but
      // on a finish this matte the edge is the only sharp thing about it.
      const core = Math.exp(-(a * a) / (2 * 0.052 * 0.052));
      const haze = Math.exp(-(a * a) / (2 * 0.17 * 0.17));
      // Fading out along its length as well, so it is a smear and not a bar.
      const run = Math.exp(-(b * b) / (2 * 0.3 * 0.3));
      // And hard zero at the border, which is what lets it slide.
      const edge =
        Math.max(0, 1 - Math.pow(Math.abs(u) * 2, 6)) *
        Math.max(0, 1 - Math.pow(Math.abs(v) * 2, 6));

      const value = (core * 0.62 + haze * 0.38) * run * edge;
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.min(1, value) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * How far the reflection reaches, and how much of it there is.
 *
 * `span` is how much wider than the card the streak's canvas is — it has to
 * be able to leave. `peak` is the most it ever adds: a reflection on a card
 * is a suggestion, and anything that reads as white paint is too much.
 */
const SHEEN = { span: 1.9, throw: 0.42, peak: 0.2 };

/** The face the reflection lies on: the card's own outline, nothing else. */
function cardFace() {
  const w = CARD.width / 2;
  const h = CARD.height / 2;
  const r = CARD.radius;
  const outline = new THREE.Shape();
  outline.moveTo(-w + r, -h);
  outline.lineTo(w - r, -h);
  outline.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  outline.lineTo(w, h - r);
  outline.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  outline.lineTo(-w + r, h);
  outline.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  outline.lineTo(-w, -h + r);
  outline.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  const geo = new THREE.ShapeGeometry(outline, 14);
  geo.translate(0, 0, CARD.depth / 2 + 0.004);
  return geo;
}

/**
 * The reflection itself, sliding over the card as the phone turns.
 *
 * Added rather than mixed, because that is what a reflection does to what is
 * under it — the printing does not get paler where the window crosses it, it
 * gets a window on top of it. Held off the surface by four thousandths so it
 * cannot fight the artwork for the same depth, and not written into the
 * depth buffer, so the reader still hides it the moment the card goes in.
 */
function Sheen({
  tilt,
  fade,
}: {
  tilt: React.MutableRefObject<{ x: number; y: number }>;
  fade: React.MutableRefObject<number>;
}) {
  const geo = useMemo(cardFace, []);
  const tex = useMemo(sheenTexture, []);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const slide = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // The shape's own coordinates come through as texture coordinates, so
    // the map is scaled to the card rather than the card to the map. Wider
    // than the card on purpose: the streak has to have somewhere to go.
    tex.repeat.set(1 / (CARD.width * SHEEN.span), 1 / (CARD.height * SHEEN.span));
    tex.offset.set(0.5, 0.5);
  }, [tex]);

  useFrame((_, dt) => {
    // Eased hard, or the reflection jitters with the accelerometer's own
    // noise — and a highlight that trembles is the one thing that tells you
    // at a glance it is not really there.
    const k = Math.min(1, dt * 3.5);
    slide.current.x += (tilt.current.x * SHEEN.throw - slide.current.x) * k;
    slide.current.y += (tilt.current.y * SHEEN.throw * 0.6 - slide.current.y) * k;
    tex.offset.set(0.5 - slide.current.x, 0.5 - slide.current.y);
    if (mat.current) mat.current.opacity = SHEEN.peak * fade.current;
  });

  return (
    <mesh geometry={geo} renderOrder={2}>
      <meshBasicMaterial
        ref={mat}
        map={tex}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/**
 * The card standing in space: a laminated slab, and a gold chip on it.
 *
 * The face is the design's own artwork under a clear coat — the laminate a
 * real card is sealed in, which is what puts the window in it when it turns.
 * The chip is a separate piece of metal, raised, with its contacts cut in,
 * so it catches the light the way the printed one never could.
 */
function Card({
  face,
  chipFace,
  fade,
  tilt,
}: {
  face: THREE.Texture;
  /** The card's own chip, cropped out so the plate can wear it. */
  chipFace: THREE.Texture;
  /** 0 while there is no card on the bench, 1 once it has arrived. */
  fade: React.MutableRefObject<number>;
  tilt: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useMemo(cardBody, []);
  const chip = useMemo(chipPlate, []);

  const materials = useMemo(() => {
    const front = new THREE.MeshPhysicalMaterial({
      map: face,
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.95,
      clearcoatRoughness: 0.055,
      // The faint rainbow a laminate throws — the security overlay a Thai
      // card actually carries, at a whisper.
      iridescence: 0.12,
      iridescenceIOR: 1.3,
    });
    const edge = new THREE.MeshStandardMaterial({
      color: "#dce8f2",
      roughness: 0.45,
    });
    const back = new THREE.MeshPhysicalMaterial({
      color: "#cfdeec",
      roughness: 0.45,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    });
    return [front, edge, back];
  }, [face]);

  /*
    The contact plate, lifted off the card rather than drawn on it.

    It was a block of metal before — metalness near one, which in a scene
    with no reflected surroundings is a material with no diffuse and nothing
    to reflect, so it came out near black and read as a bruise on the card.
    Gold on a card is not a mirror anyway; it is a thin plated film over
    epoxy, and it is the *artwork's own* gold, so the plate wears the card's
    chip as its face and is given relief, a slight metal glint and a clear
    coat. The contacts come with the picture; there is nothing to draw.
  */
  const plating = useMemo(() => {
    const top = new THREE.MeshPhysicalMaterial({
      map: chipFace,
      roughness: 0.3,
      metalness: 0.22,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
    });
    const wall = new THREE.MeshStandardMaterial({
      color: "#b8912c",
      roughness: 0.42,
      metalness: 0.25,
    });
    return [top, wall, wall];
  }, [chipFace]);

  /*
    The card arrives and leaves rather than appearing and vanishing.

    Every material it is made of takes the same opacity, the chip included,
    and below a whisper the whole group is switched off — a mesh at zero
    opacity still costs a draw and still writes depth, and the one thing a
    card that is not there must not do is punch a hole in the reader behind
    it.
  */
  const coats = useMemo(() => [...materials, ...plating], [materials, plating]);
  useEffect(() => {
    for (const m of coats) m.transparent = true;
  }, [coats]);
  useFrame(() => {
    const a = fade.current;
    if (root.current) root.current.visible = a > 0.004;
    for (const m of coats) {
      m.opacity = a;
      m.depthWrite = a > 0.98;
    }
  });

  return (
    <group ref={root}>
      <mesh geometry={body} material={materials} castShadow />
      <mesh
        geometry={chip}
        material={plating}
        position={[CHIP.x, CHIP.y, CARD.depth / 2]}
      />
      <Sheen tilt={tilt} fade={fade} />
    </group>
  );
}


/** What the frame loop hands the lamp each tick. */
type LampDrive = { glow: number; hue: THREE.Color };

/**
 * How the indicator behaves in each of the page's states.
 *
 * `range` is how far it swings, `beat` how fast — nought for a steady light.
 * The colours are the page's own status colours, so the lamp on the model
 * and the dot in the capsule underneath are never saying different things.
 */
const LAMP: Record<
  ReaderState,
  { colour: string; range: [number, number]; beat: number }
> = {
  checking: { colour: "#f59e0b", range: [0.25, 1], beat: 4.2 },
  ready: { colour: "#22c55e", range: [0.9, 0.9], beat: 0 },
  reading: { colour: "#3b82f6", range: [0.2, 1], beat: 9 },
  // Lit enough to be plainly red: at a glimmer the lens's own highlight
  // outshone it and the "not found" light read as a pale dot.
  missing: { colour: "#ef4444", range: [0.4, 0.4], beat: 0 },
};

/**
 * A soft round falloff, made rather than loaded.
 *
 * The glow around an LED is the light it throws on the air and on the
 * moulding it is set into, and a hard-edged disc is the one thing that
 * cannot pass for it. Squaring the falloff twice gives the tight core and
 * the long tail a real one has. Sixty-four pixels is plenty for something
 * that is never more than a few across on screen.
 */
function glowTexture() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const d = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - d, 3);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * The status light, set into the front of the case.
 *
 * Three pieces, because that is what one is: a well moulded into the
 * plastic, a lens sitting in it, and the light the lens throws. The lens is
 * the only part that is lit from within — it is given its colour as
 * emission, so it stays that colour whatever the scene's lamps are doing —
 * and the glow is an added disc over the top, which is how light on a
 * surface behaves and how a transparent one does not.
 */
function Lamp({
  tone,
}: {
  tone: React.MutableRefObject<LampDrive>;
}) {
  const lens = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useMemo(glowTexture, []);

  // On the front face, low and central: clear of the slot in the top edge
  // and of the lead coming out of the foot.
  const z = CASE.depth / 2;
  const y = -CASE.height * 0.28;

  useFrame(() => {
    const { glow: g, hue } = tone.current;
    if (lens.current) {
      lens.current.emissive.copy(hue);
      lens.current.emissiveIntensity = 0.25 + g * 2.6;
      lens.current.color.copy(hue).multiplyScalar(0.22);
    }
    if (halo.current) {
      halo.current.color.copy(hue);
      halo.current.opacity = 0.1 + g * 0.5;
    }
  });

  return (
    <group position={[0, y, 0]}>
      {/* The well the lens sits in. */}
      <mesh position={[0, 0, z - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.06, 28]} />
        <meshStandardMaterial color="#070709" roughness={0.85} />
      </mesh>
      {/* The lens. */}
      <mesh position={[0, 0, z + 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.05, 28]} />
        <meshStandardMaterial
          ref={lens}
          // Matte enough that the colour inside wins over the glint on top.
          roughness={0.5}
          metalness={0}
          emissiveIntensity={0}
        />
      </mesh>
      {/* What it throws. */}
      <mesh position={[0, 0, z + 0.05]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial
          ref={halo}
          map={glow}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Reader({
  state,
  tilt,
}: {
  state: ReaderState;
  tilt: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const root = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const lamp = useRef<LampDrive>({ glow: 0, hue: new THREE.Color() });

  /** 0 waiting, 1 seated — eased toward its target every frame. */
  const seat = useRef(0);
  /** Where the demonstration has got to, in seconds. */
  const loop = useRef(0);
  /** How much of the card is on the bench at all. */
  const show = useRef(0);
  const t = useRef(0);

  const body = useMemo(caseBody, []);

  /* The lead: out of the foot, then a lazy bend down and away. */
  const lead = useMemo(() => {
    const foot = -CASE.height / 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, foot + 0.1, 0),
      new THREE.Vector3(0, foot - 1.3, 0.04),
      new THREE.Vector3(0.12, -CASE.height / 2 - 2.8, 0.3),
      new THREE.Vector3(0.04, -CASE.height / 2 - 4.4, 0.85),
    ]);
    return new THREE.TubeGeometry(curve, 40, 2.4 * MM, 16, false);
  }, []);

  const [face, chipFace, shell] = useLoader(THREE.TextureLoader, [
    idFace,
    idChip,
    readerBody,
  ]) as THREE.Texture[];
  useEffect(() => {
    skin(face);
    skin(chipFace);
    skin(shell);
  }, [face, chipFace, shell]);

  /* The case: the photograph on the front, moulded plastic everywhere else. */
  const caseMaterials = useMemo(() => {
    const front = new THREE.MeshPhysicalMaterial({
      map: shell,
      roughness: 0.58,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.16,
    });
    const wall = new THREE.MeshPhysicalMaterial({
      color: "#0f0f12",
      roughness: 0.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    });
    const back = new THREE.MeshStandardMaterial({
      color: "#0b0b0e",
      roughness: 0.7,
    });
    return [front, wall, back];
  }, [shell]);

  /* A fresh loop each time the reader comes good, so the card is never
     caught halfway through someone else's cycle. */
  useEffect(() => {
    if (state === "ready") loop.current = 0;
  }, [state]);

  useFrame((_, dt) => {
    t.current += dt;

    /*
      Two different things drive the card, and only one of them at a time.

      Once the card is really being read there is nothing to demonstrate:
      it is in, and it stays in. Before that the page is *showing* what to
      do, so the card runs a loop — arrive, go in, sit a moment, leave —
      and the loop is the instruction. In every other state there is no
      card at all: the reader has not answered yet, or it is not there, and
      a card floating over a reader that may not be plugged in is telling
      the carer to do something that might not work.
    */
    let seated: number;
    if (state === "reading") {
      seated = 1;
      show.current += (1 - show.current) * Math.min(1, dt * 8);
    } else if (state === "ready") {
      loop.current = (loop.current + dt) % DEMO_LOOP;
      const u = loop.current;
      seated =
        u < DEMO.enter
          ? 0
          : u < DEMO_IN
            ? ease((u - DEMO.enter) / DEMO.travel)
            : u < DEMO_END
              ? 1
              : 0;
      show.current =
        u < DEMO.enter
          ? ease(u / DEMO.enter)
          : u < DEMO_OUT
            ? 1
            : u < DEMO_END
              ? 1 - ease((u - DEMO_OUT) / DEMO.leave)
              : 0;
    } else {
      seated = 0;
      show.current += (0 - show.current) * Math.min(1, dt * 8);
      loop.current = 0;
    }
    seat.current = seated;

    // The knock at the stop: a card meeting the end of the slot rebounds a
    // fraction of a millimetre, and leaving that out is what makes an
    // animated card look like it was slid rather than pushed.
    const justLanded = state === "ready" && loop.current > DEMO_IN && loop.current < DEMO_IN + 0.4;
    const knock = justLanded
      ? Math.sin(((loop.current - DEMO_IN) / 0.4) * Math.PI) * 0.5 * MM
      : 0;

    if (card.current) {
      card.current.position.y =
        CARD_Y.waiting + (CARD_Y.seated - CARD_Y.waiting) * seat.current + knock;
      /*
        Square to the slot, always.

        It used to lean toward the reader on the way in, pivoting about its
        own middle — and a card is 86 mm long, so three degrees at the
        middle is two millimetres at the leading edge, which is more than
        the slit is wide. The edge was arriving at the case *behind* the
        slot and pushing through solid plastic. A card being fed into a
        slot is held flat to it; the only freedom left is a hair of roll,
        which moves the edge sideways by less than the slot's clearance.
      */
      card.current.rotation.z = TURN + (1 - seat.current) * -0.012;
      card.current.rotation.x = 0;
    }

    // The lamp, in the four states the page has: hunting for the reader,
    // sitting ready, reading, and nothing found. A real one does not switch
    // between these, it ramps, so the brightness is eased rather than set
    // and the two busy states breathe at different rates — a slow search, a
    // quick transfer.
    const drive = lamp.current;
    drive.hue.set(LAMP[state].colour);
    const [lo, hi] = LAMP[state].range;
    const beat = LAMP[state].beat;
    drive.glow =
      beat > 0
        ? lo + (hi - lo) * (0.5 + Math.sin(t.current * beat) * 0.5)
        : lo;

    // The whole bench follows the phone.
    if (root.current) {
      const rx = LEAN - tilt.current.y * 0.26;
      const ry = tilt.current.x * 0.34;
      root.current.rotation.x += (rx - root.current.rotation.x) * Math.min(1, dt * 6);
      root.current.rotation.y += (ry - root.current.rotation.y) * Math.min(1, dt * 6);
    }
  });

  return (
    <group ref={root} position={[0, -0.6, 0]}>
      {/* The card, in the same plane as the case so the case can swallow it. */}
      <group
        ref={card}
        position={[0, CARD_Y.waiting, 0]}
        rotation={[0, 0, TURN]}
      >
        <Card face={face} chipFace={chipFace} fade={show} tilt={tilt} />
      </group>

      {/* The case. */}
      <mesh geometry={body} material={caseMaterials} castShadow receiveShadow />

      {/* The indicator. */}
      <Lamp tone={lamp} />

      {/* Strain relief where the lead leaves the case, then the lead. */}
      <mesh position={[0, -CASE.height / 2 - 0.42, 0]}>
        <cylinderGeometry args={[0.28, 0.33, 0.95, 24]} />
        <meshStandardMaterial color="#0d0d10" roughness={0.75} />
      </mesh>
      <mesh geometry={lead}>
        <meshStandardMaterial color="#121215" roughness={0.7} />
      </mesh>
    </group>
  );
}

/**
 * What the camera is looking at, and how much of the bench it takes in.
 *
 * Three framings, one per thing the page is doing, and the card is whole in
 * every one of them — the frame's edge never crosses it. Finding the reader,
 * or reporting there isn't one: tight on the case, so the lamp on its front
 * is large enough to read. Showing the card going in: opened right up,
 * because the card stands a full card's height above the mouth before it
 * goes, and every millimetre of that has to be inside the picture. Reading:
 * closed back down around the seated pair, since the card is not going
 * anywhere and the reader can have the room again.
 *
 * `y` is the height the camera is level with, `fov` how much it sees. Each
 * was worked out from where the objects actually are — the card's top edge
 * at rest, the case's foot — with a little over, and the camera eases from
 * one to the next rather than cutting, which is what tells the carer the
 * page has moved on.
 */
const FRAME = {
  // The reader alone sat too large on the taller canvas, and the pair too
  // small on the shorter one: so the canvas is the tall one and these two
  // are opened a few degrees, while the demonstration keeps the field it
  // needs to hold a whole card standing over the mouth.
  reader: { y: -0.4, fov: 34 },
  // Opened two degrees over what the card alone needs, so the case's foot
  // sits above the fade along the bottom (see `FOOT`) and only the lead
  // runs into it.
  demo: { y: 3.07, fov: 38 },
  seated: { y: 1.45, fov: 29 },
};

/**
 * How much of the bottom of the picture dissolves.
 *
 * The lead leaves the frame there, and a cable cut off by a straight edge
 * looks cut off. Only the bottom: the top is never faded, because a card
 * arriving from above is meant to be seen whole, and every framing above
 * was chosen so that it is. As a fraction of the height, and small enough —
 * checked against each framing — that the case itself is always clear of
 * it, the closest by a couple of millimetres in the reading shot.
 */
const FOOT = 0.08;

function Rig({ state }: { state: ReaderState }) {
  const { camera } = useThree();
  const now = useRef({ ...FRAME.reader });
  useFrame((_, dt) => {
    const want =
      state === "ready" ? FRAME.demo : state === "reading" ? FRAME.seated : FRAME.reader;
    const cur = now.current;
    if (Math.abs(want.y - cur.y) < 5e-4 && Math.abs(want.fov - cur.fov) < 5e-3) return;
    const k = Math.min(1, dt * 2.4);
    cur.y += (want.y - cur.y) * k;
    cur.fov += (want.fov - cur.fov) * k;
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = cur.fov;
    cam.position.y = cur.y;
    cam.updateProjectionMatrix();
    cam.lookAt(0, cur.y, 0);
  });
  return null;
}

/**
 * The bench the reader stands on: the scene, its light and its camera.
 *
 * A white ambient at full strength carries almost all of it. Lambert shading
 * under uniform irradiance returns the albedo untouched, so that one light
 * is what makes the front of the case *be* the photograph instead of a
 * darkened copy of it; the tone curve is off for the same reason. The three
 * directionals are at a fifth of the usual strength and are not there to
 * light anything — they are what the clear coat has to catch.
 */
export function CardReader3D({
  state,
  tilt,
  width,
  height,
}: {
  state: ReaderState;
  tilt: React.MutableRefObject<{ x: number; y: number }>;
  width: number;
  height: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        WebkitMaskImage: `linear-gradient(#000 0%, #000 ${(1 - FOOT) * 100}%, transparent 100%)`,
        maskImage: `linear-gradient(#000 0%, #000 ${(1 - FOOT) * 100}%, transparent 100%)`,
      }}
    >
      <Canvas
        style={{ width, height, background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
        camera={{
          position: [0, FRAME.reader.y, 26],
          fov: FRAME.reader.fov,
          near: 0.1,
          far: 100,
        }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(0x000000, 0);
          // No tone curve: it exists to tame a scene brighter than the
          // screen, and this one is a photograph that is already graded.
          gl.toneMapping = THREE.NoToneMapping;
          camera.lookAt(0, FRAME.reader.y, 0);
        }}
      >
        <ambientLight intensity={1} />
        {/*
          Low, and placed side-on rather than in front. A lamp square to a
          face pours light into it and adds a highlight you cannot see; the
          same lamp swung out to the side barely lights it at all and puts
          the highlight right where the eye is — which is the whole of what
          these are for, the photograph having brought its own light.

          Lamps, not points. A point light near a surface lays a bright
          patch on it that falls off with distance, and on the matte black
          of the case that patch is a blotch the real moulding never has;
          a lamp at infinity leaves the photograph's own shading alone.
        */}
        <directionalLight position={[-13, 9, 5]} intensity={0.3} />
        <directionalLight position={[12, 5, 4]} intensity={0.2} />
        <directionalLight position={[0, -8, 6]} intensity={0.1} />

        <Rig state={state} />
        <Suspense fallback={null}>
          <Reader state={state} tilt={tilt} />
        </Suspense>
      </Canvas>
    </div>
  );
}
