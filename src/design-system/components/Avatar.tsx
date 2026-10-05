import { useState } from "react";
import type { CSSProperties } from "react";
import { clsx } from "clsx";

interface AvatarProps {
  name: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg" | "card" | "xl" | "2xl";
  shape?: "circle" | "squircle";
  variant?: "solid" | "glass";
  color?: string;
  /** status ring colour (white gap + coloured ring) */
  ring?: string;
  pulse?: boolean;
  className?: string;
}

const TITLES = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|คุณ|พท\.ป\.|นศ\.พท\.|พจ\.|Mr\.|Ms\.|Mrs\.)\s*/;

export function initialOf(name: string) {
  const bare = name.replace(TITLES, "").trim();
  // Thai leading vowels (เ แ โ ใ ไ) are not the initial consonant.
  const chars = [...bare];
  const first = chars.find((c) => !/[เแโใไ]/.test(c)) ?? chars[0] ?? "?";
  return first.toUpperCase();
}

/** Photo when available (fades in), initials on colour otherwise or on load error. */
export function Avatar({ name, src, size = "md", shape = "circle", variant = "solid", color, ring, pulse, className }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const showImg = src && failed !== src;
  const style: CSSProperties = { ...(color ? { background: color } : null), ...(ring ? { ["--ring" as string]: ring } : null) };
  return (
    <span
      className={clsx(
        "tw-avatar",
        size !== "md" && `tw-avatar--${size}`,
        shape === "squircle" && "tw-avatar--squircle",
        variant === "glass" && "tw-avatar--glass",
        ring && "tw-avatar--ring",
        pulse && "tw-avatar--pulse",
        className,
      )}
      style={style}
      aria-hidden
    >
      <span className="tw-avatar__initial">{initialOf(name)}</span>
      {showImg && (
        <img
          className={clsx("tw-avatar__img", loaded === src && "tw-avatar__img--in")}
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
      )}
    </span>
  );
}
