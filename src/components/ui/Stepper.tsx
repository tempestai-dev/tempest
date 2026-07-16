import { Tooltip } from "../Tooltip";

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="sp-stepper">
      <Tooltip content="Decrease" placement="top">
        <button className="sp-stepper-btn" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      </Tooltip>
      <span className="sp-stepper-val">{value}</span>
      <Tooltip content="Increase" placement="top">
        <button className="sp-stepper-btn" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </Tooltip>
    </div>
  );
}
