import type { CSSProperties } from "react";
import { clsx } from "clsx";

interface IconProps {
  /** URL of a Figma-exported SVG — used unmodified as a mask so it can be tinted. */
  src: string;
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  label?: string;
}

export function Icon({ src, size = 20, width, height, color, className, label }: IconProps) {
  const style = {
    "--icon": `url("${src}")`,
    width: width ?? size,
    height: height ?? size,
    color,
  } as CSSProperties;
  return (
    <span
      className={clsx("tw-icon", className)}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
