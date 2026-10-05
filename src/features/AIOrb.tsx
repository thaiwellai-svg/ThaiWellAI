import { clsx } from "clsx";
import "./ai-orb.css";

/** Siri-style living orb: coloured light swirling inside a glass sphere. */
export function AIOrb({ size = 40, active = false, className }: { size?: number; active?: boolean; className?: string }) {
  return (
    <span className={clsx("orb", active && "is-active", className)} style={{ ["--orb" as string]: `${size}px` }} aria-hidden>
      <span className="orb__glow" />
      <span className="orb__core">
        <i className="orb__b orb__b--1" />
        <i className="orb__b orb__b--2" />
        <i className="orb__b orb__b--3" />
        <i className="orb__b orb__b--4" />
        <i className="orb__ring" />
      </span>
      <span className="orb__glass" />
    </span>
  );
}
