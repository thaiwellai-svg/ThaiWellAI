import { Droplet, Flame, Mountain, Wind, type LucideProps } from "lucide-react";
import type { Element } from "../data/elements";

/** icon for each ธาตุ: ดิน = mountain, น้ำ = drop, ลม = wind, ไฟ = flame */
export function ElementIcon({ element, ...props }: { element: Element } & LucideProps) {
  const I = element === "ดิน" ? Mountain : element === "น้ำ" ? Droplet : element === "ลม" ? Wind : Flame;
  return <I {...props} />;
}
