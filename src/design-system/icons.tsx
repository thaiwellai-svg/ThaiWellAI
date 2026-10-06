import type { SVGProps } from "react";

/**
 * ThaiWell icon set — 24px grid, 1.8 round stroke. The primary shape reads
 * `--icon-fill`, so the active state becomes duotone without a second drawing.
 */
type P = SVGProps<SVGSVGElement>;

const base = (props: P): P => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});
const tone = { fill: "var(--icon-fill, none)" };

export const HomeIcon = (p: P) => (
  <svg {...base(p)}>
    <path style={tone} d="M3.8 10.4 12 4l8.2 6.4v8.3a2.3 2.3 0 0 1-2.3 2.3H6.1a2.3 2.3 0 0 1-2.3-2.3Z" />
    <path d="M9.6 21v-4.6a2.4 2.4 0 0 1 4.8 0V21" />
  </svg>
);

export const PatientsIcon = (p: P) => (
  <svg {...base(p)}>
    <circle style={tone} cx="9.2" cy="8.2" r="3.4" />
    <path style={tone} d="M3.4 19.6c.5-3.3 2.9-5.3 5.8-5.3s5.3 2 5.8 5.3a.9.9 0 0 1-.9 1H4.3a.9.9 0 0 1-.9-1Z" />
    <path d="M15.6 5.1a3.2 3.2 0 0 1 0 6.2" />
    <path d="M17.6 14.7c1.8.6 3 2.3 3.3 4.7" />
  </svg>
);

export const AppointmentsIcon = (p: P) => (
  <svg {...base(p)}>
    <rect style={tone} x="3.5" y="5" width="17" height="15.5" rx="3.6" />
    <path d="M3.5 9.8h17M8 3v3.6M16 3v3.6" />
    <path strokeWidth="2.4" d="M8 13.6h.01M12 13.6h.01M16 13.6h.01M8 17h.01M12 17h.01" />
  </svg>
);

export const PlannerIcon = (p: P) => (
  <svg {...base(p)}>
    <rect style={tone} x="3.5" y="5" width="17" height="15.5" rx="3.6" />
    <path d="M3.5 9.8h17M8 3v3.6M16 3v3.6" />
    <path d="M12 12.6v5M9.5 15.1h5" />
  </svg>
);

export const InsightsIcon = (p: P) => (
  <svg {...base(p)}>
    <rect style={tone} x="3.5" y="3.5" width="17" height="17" rx="3.6" />
    <path d="M7.5 15.5l3-3.4 2.6 2.2 3.9-5" />
    <path d="M14.4 9.3h2.6v2.6" />
  </svg>
);

export const VisitIcon = (p: P) => (
  <svg {...base(p)}>
    <rect style={tone} x="4.5" y="4" width="15" height="17" rx="3.4" />
    <path d="M9 3v2.4h6V3" />
    <path d="M8.6 13.2l2.3 2.3 4.6-4.6" />
  </svg>
);

export const BillingIcon = (p: P) => (
  <svg {...base(p)}>
    <path style={tone} d="M5.5 3.8h13v16.6l-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4-2.1-1.4-2.2 1.4Z" />
    <path d="M9 8.6h6M9 12h6M9 15.4h3.2" />
  </svg>
);

export const SettingsIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h7M17 7h3M4 17h3M13 17h7" />
    <circle style={tone} cx="14" cy="7" r="2.6" />
    <circle style={tone} cx="10" cy="17" r="2.6" />
  </svg>
);

/** Flaticon UIcons · Duotone Chubby · `fi-dc-sparkles` (faded layer 40%, as in the icon font). */
export const SparkleIcon = (p: P) => (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path opacity="0.4" d="M18.56 10.64Q17.28 10 15.76 9.44Q13.2 8.48 12.16 5.84Q11.6 4.24 10.96 2.96Q10.72 2.4 10.08 2.4Q9.44 2.4 9.2 2.96Q8.56 4.24 7.92 5.76Q6.96 8.48 4.4 9.44Q2.8 10 1.52 10.64Q1.04 10.96 1.04 11.56Q1.04 12.16 1.52 12.48Q2.8 13.12 4.4 13.68Q6.96 14.72 7.92 17.36Q8.56 18.88 9.2 20.16Q9.44 20.72 10.08 20.72Q10.72 20.72 10.96 20.16Q11.6 18.88 12.16 17.36Q13.2 14.72 15.76 13.68Q17.28 13.12 18.56 12.48Q19.12 12.16 19.12 11.56Q19.12 10.96 18.56 10.64Z" />
    <path d="M21.92 4.72Q21.76 4.64 21.44 4.56L21.04 4.32Q20.8 4.24 20.72 4Q20.48 3.36 20.32 3.12Q20 2.64 19.52 2.64Q19.04 2.64 18.72 3.12Q18.48 3.36 18.24 4Q18.16 4.24 18 4.32L17.12 4.8Q16.56 5.04 16.56 5.68Q16.56 6.32 17.12 6.56L18 6.96Q18.16 7.12 18.24 7.28Q18.48 7.92 18.72 8.16Q19.04 8.64 19.52 8.64Q20 8.64 20.32 8.16Q20.48 7.92 20.72 7.28Q20.8 7.12 21.04 6.96L21.92 6.56Q22.48 6.32 22.48 5.68Q22.48 5.04 21.92 4.72ZM22.48 17.2Q22.24 17.12 21.84 16.92Q21.44 16.72 21.16 16.56Q20.88 16.4 20.8 16.08L20.72 15.84Q20.48 15.2 20.32 14.96Q20 14.56 19.52 14.56Q19.04 14.56 18.72 14.96Q18.48 15.2 18.32 15.84L18.24 16.08Q18.08 16.4 17.84 16.56Q17.6 16.72 17.12 16.96L16.56 17.2Q16 17.44 16 18.08Q16 18.72 16.48 18.96Q16.96 19.2 17.52 19.36Q17.84 19.52 18 19.76Q18.16 20 18.32 20.48L18.64 21.04Q18.88 21.6 19.52 21.6Q20.16 21.6 20.4 21.12Q20.64 20.64 20.8 20.08Q20.88 19.76 21.16 19.6Q21.44 19.44 21.92 19.2L22.48 18.96Q22.96 18.72 22.96 18.08Q22.96 17.44 22.48 17.2Z" />
  </svg>
);

export const SearchIcon = (p: P) => (
  <svg {...base({ width: 18, height: 18, strokeWidth: 2, ...p })}>
    <circle style={tone} cx="11" cy="11" r="6.6" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

export const BellIcon = (p: P) => (
  <svg {...base({ width: 20, height: 20, ...p })}>
    <path style={tone} d="M6.2 9.6a5.8 5.8 0 0 1 11.6 0v3.3c0 .9.3 1.8.9 2.5l.6.8c.6.8 0 1.8-.9 1.8H5.6c-.9 0-1.5-1-.9-1.8l.6-.8c.6-.7.9-1.6.9-2.5Z" />
    <path d="M10 20.4a2.2 2.2 0 0 0 4 0" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base({ width: 12, height: 12, strokeWidth: 2.6, ...p })}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg {...base({ width: 14, height: 14, strokeWidth: 2, ...p })}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const CalendarSmallIcon = (p: P) => (
  <svg {...base({ width: 14, height: 14, strokeWidth: 2, ...p })}>
    <rect x="4" y="5.5" width="16" height="14.5" rx="3.4" />
    <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
  </svg>
);

export const LeafIcon = (p: P) => (
  <svg {...base({ width: 14, height: 14, strokeWidth: 2, ...p })}>
    <path d="M5 19c0-8 5.5-13.5 14-14 .4 8.6-5 14-13 14Z" />
    <path d="M5 19c3-4 6-6.5 9.5-8.5" />
  </svg>
);

export const CameraIcon = (p: P) => (
  <svg {...base({ width: 16, height: 16, strokeWidth: 2, ...p })}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5Z" />
    <circle cx="12" cy="12.4" r="3.4" />
  </svg>
);

export const ShieldCheckIcon = (p: P) => (
  <svg {...base({ width: 12, height: 12, strokeWidth: 2.2, ...p })}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6Z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </svg>
);
