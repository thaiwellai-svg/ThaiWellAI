import type { PaymentMethod } from "./types";

/** stock item used during treatment (herbal compress, oil, towels…) */
export interface StockItem {
  id: string;
  name: string;
  unit: string;
  stock: number;
  /** alert when stock falls to this level */
  min: number;
  /** cost per unit (baht) */
  cost: number;
}
export interface StockMove {
  id: string;
  at: string;
  itemId: string;
  /** + received, − used / adjusted */
  qty: number;
  kind: "receive" | "use" | "adjust";
  note?: string;
  apptId?: string;
  by: string;
}
/** a course package the clinic sells */
export interface Package {
  id: string;
  name: string;
  serviceId: string;
  sessions: number;
  price: number;
  /** days the package stays valid after purchase */
  validDays: number;
  active: boolean;
}
export interface SalePayment {
  at: string;
  amount: number;
  method: PaymentMethod;
  kind: "deposit" | "full" | "balance";
}
export interface PackageSale {
  id: string;
  no: string;
  at: string;
  patientId: string;
  packageId: string;
  name: string;
  price: number;
  discount: number;
  net: number;
  payments: SalePayment[];
  member: boolean;
  by: string;
  void?: { at: string; reason: string };
}
/** commission rate per therapist */
export interface Rate {
  perCase: number;
  percent: number;
}
export interface DayClose {
  id: string;
  date: string;
  at: string;
  by: string;
  float: number;
  counted: number;
  expectedCash: number;
  diff: number;
  deposit: number;
  depositRef?: string;
  note?: string;
  totals: Record<PaymentMethod, number>;
  receipts: number;
}
export interface WaitEntry {
  id: string;
  at: string;
  patientId: string;
  serviceId: string;
  date: string;
  from: string;
  to: string;
  note?: string;
  status: "waiting" | "notified" | "booked" | "removed";
  notifiedAt?: string;
}
export interface IssuedDoc {
  id: string;
  no: string;
  kind: "cert" | "refer";
  at: string;
  patientId: string;
  apptId?: string;
  doctor: string;
  license?: string;
  diagnosis: string;
  /** cert: opinion + rest days · refer: destination + reason */
  opinion?: string;
  restFrom?: string;
  restDays?: number;
  referTo?: string;
  reason?: string;
  treatment?: string;
}

export interface Biz {
  items: StockItem[];
  moves: StockMove[];
  /** serviceId → items used per session */
  usage: Record<string, { itemId: string; qty: number }[]>;
  packages: Package[];
  sales: PackageSale[];
  memberDiscount: number;
  rates: Record<string, Rate>;
  closings: DayClose[];
  waitlist: WaitEntry[];
  docs: IssuedDoc[];
  seq: { sale: number; cert: number; refer: number; tax: number };
}

export const defaultBiz = (): Biz => ({
  items: [
    { id: "i1", name: "ลูกประคบสมุนไพร", unit: "ลูก", stock: 46, min: 20, cost: 35 },
    { id: "i2", name: "น้ำมันไพล", unit: "ml", stock: 1800, min: 500, cost: 0.6 },
    { id: "i3", name: "ยาหม่องสมุนไพร", unit: "กรัม", stock: 320, min: 100, cost: 1.2 },
    { id: "i4", name: "ผ้าขนหนู", unit: "ผืน", stock: 14, min: 20, cost: 8 },
    { id: "i5", name: "ครีมนวดเท้า", unit: "ml", stock: 900, min: 300, cost: 0.8 },
  ],
  moves: [],
  usage: {
    s1: [{ itemId: "i2", qty: 20 }, { itemId: "i4", qty: 1 }],
    s2: [{ itemId: "i2", qty: 25 }, { itemId: "i3", qty: 5 }, { itemId: "i4", qty: 1 }],
    s3: [{ itemId: "i1", qty: 2 }, { itemId: "i4", qty: 1 }],
    s4: [{ itemId: "i5", qty: 20 }, { itemId: "i4", qty: 1 }],
    s5: [{ itemId: "i1", qty: 2 }, { itemId: "i2", qty: 20 }, { itemId: "i4", qty: 2 }],
  },
  packages: [
    { id: "pk1", name: "นวดไทยเพื่อการรักษา 10 ครั้ง", serviceId: "s2", sessions: 10, price: 4000, validDays: 90, active: true },
    { id: "pk2", name: "ประคบสมุนไพร 6 ครั้ง", serviceId: "s3", sessions: 6, price: 1500, validDays: 60, active: true },
    { id: "pk3", name: "นวดไทยร่วมประคบ 6 ครั้ง", serviceId: "s5", sessions: 6, price: 3200, validDays: 60, active: true },
    { id: "pk4", name: "นวดเพื่อสุขภาพ 5 ครั้ง", serviceId: "s1", sessions: 5, price: 1600, validDays: 60, active: true },
  ],
  sales: [],
  memberDiscount: 10,
  rates: { t1: { perCase: 80, percent: 0 }, t2: { perCase: 150, percent: 5 }, t3: { perCase: 150, percent: 5 }, t4: { perCase: 80, percent: 0 }, t5: { perCase: 150, percent: 5 }, t6: { perCase: 150, percent: 5 } },
  closings: [],
  waitlist: [],
  docs: [],
  seq: { sale: 0, cert: 0, refer: 0, tax: 0 },
});

export const runNo = (prefix: string, n: number) => `${prefix}${new Date().getFullYear() + 543}-${String(n).padStart(5, "0")}`;
