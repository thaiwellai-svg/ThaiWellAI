/**
 * Scene description for the spa room photo, in image UV (0–1, origin top-left).
 * Positions were measured from the photo (bright-blob detection + manual check).
 * Swapping the photo = replace the two images and update these coordinates.
 */
import room from "../../assets/backdrop/spa-room.jpg";
import depth from "../../assets/backdrop/spa-depth.jpg";

export const SCENE = {
  image: room,
  /** Depth Anything V2 estimate · white = near, black = far */
  depth,
  aspect: 2560 / 1450,
  /** depth kept sharp by default — the front massage bed */
  focus: 0.74,
  /** real candle flames: flicker hard, light nearby surfaces. size = glow radius in image widths */
  flames: [
    { x: 0.808, y: 0.528, size: 0.016 },
    { x: 0.886, y: 0.524, size: 0.016 },
    { x: 0.897, y: 0.612, size: 0.013 },
    { x: 0.936, y: 0.607, size: 0.013 },
    { x: 0.853, y: 0.302, size: 0.012 },
    { x: 0.49, y: 0.494, size: 0.011 },
    { x: 0.537, y: 0.522, size: 0.01 },
  ],
  /** wall sconces & niche lights: slow breathing glow */
  glows: [
    { x: 0.426, y: 0.253, size: 0.03 },
    { x: 0.708, y: 0.297, size: 0.03 },
    { x: 0.434, y: 0.51, size: 0.022 },
    { x: 0.109, y: 0.124, size: 0.034 },
    { x: 0.048, y: 0.12, size: 0.03 },
    { x: 0.53, y: 0.205, size: 0.04 },
    { x: 0.615, y: 0.205, size: 0.04 },
  ],
  /** aroma smoke rising from these flames (strength 0–1) */
  smoke: [
    { x: 0.808, y: 0.522, strength: 1 },
    { x: 0.886, y: 0.518, strength: 0.8 },
    { x: 0.49, y: 0.488, strength: 0.7 },
  ],
};
