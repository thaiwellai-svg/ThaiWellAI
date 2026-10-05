import { motion } from "framer-motion";
import { spring } from "../motion";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="tw-switch" onClick={() => onChange(!checked)}>
      <motion.span className="tw-switch__knob" animate={{ x: checked ? 18 : 0 }} transition={spring.snappy} />
    </button>
  );
}
