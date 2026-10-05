import { useState } from "react";

/** Keeps the last non-null value so overlay content survives its exit animation. */
export function useLatest<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
