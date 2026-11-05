import { type InputHTMLAttributes } from "react";
import { Minus, Plus } from "lucide-react";
export function MonoNumber({
  value,
  onValueChange,
  min = 1,
  max = 365,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value" | "min" | "max"
> & {
  value: number;
  min?: number;
  max?: number;
  onValueChange: (n: number) => void;
}) {
  const label = props["aria-label"] || "数値";
  return (
    <span className="mono-number">
      <input
        {...props}
        type="number"
        min={min}
        max={max}
        value={value || ""}
        onChange={(e) => onValueChange(e.currentTarget.valueAsNumber || 0)}
      />
      <span className="number-steps">
        <button
          type="button"
          aria-label={`${label}を減らす`}
          disabled={props.disabled || value <= min}
          onClick={() => onValueChange(Math.max(min, value - 1))}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label={`${label}を増やす`}
          disabled={props.disabled || value >= max}
          onClick={() => onValueChange(Math.min(max, Math.max(min, value + 1)))}
        >
          <Plus size={14} />
        </button>
      </span>
    </span>
  );
}
