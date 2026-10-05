import { clsx } from "clsx";

const STAR = "M12 1.5C12.6 7.4 16.6 11.4 22.5 12 16.6 12.6 12.6 16.6 12 22.5 11.4 16.6 7.4 12.6 1.5 12 7.4 11.4 11.4 7.4 12 1.5Z";

/** the ThaiWell AI glass orb (same look as the dock button), any size */
export function AIBall({ size = 44, busy, className }: { size?: number; busy?: boolean; className?: string }) {
  return (
    <span className={clsx("aib", busy && "is-busy", className)} style={{ width: size, height: size, ["--s" as string]: `${size}px` }} aria-hidden>
      <span className="ai2__aura" />
      <span className="ai2__ball">
        <i className="ai2__swirl" />
        <i className="ai2__swirl ai2__swirl--b" />
        <i className="ai2__shine" />
      </span>
      <span className="ai2__star">
        <svg viewBox="0 0 28 28" style={{ width: size * 0.6, height: size * 0.6 }}>
          <g className="ai3__s ai3__s--1" transform="translate(1 6) scale(0.82)">
            <path d={STAR} fill="currentColor" />
          </g>
          <g className="ai3__s ai3__s--2" transform="translate(16 1) scale(0.46)">
            <path d={STAR} fill="currentColor" />
          </g>
          <g className="ai3__s ai3__s--3" transform="translate(18.5 17) scale(0.34)">
            <path d={STAR} fill="currentColor" />
          </g>
        </svg>
      </span>
    </span>
  );
}
