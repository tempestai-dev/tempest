import { useState } from "react";

function NumericField({
  label, desc, unit, value, onChange, min, max, placeholder,
}: {
  label: string; desc: string; unit?: string;
  value: string; onChange: (v: string) => void;
  min?: number; max?: number; placeholder?: string;
}) {
  return (
    <div className="psp-field">
      <div className="psp-field-label">{label}</div>
      <div className="psp-field-desc">{desc}</div>
      <div className="psp-field-input-row">
        <input
          className="psp-input psp-input--sm"
          type="number"
          min={min}
          max={max}
          placeholder={placeholder ?? "unlimited"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span className="psp-field-unit">{unit}</span>}
      </div>
    </div>
  );
}

export function ResourcesSection() {
  const [maxMemory,  setMaxMemory]  = useState("");
  const [maxProcs,   setMaxProcs]   = useState("");
  const [diskLimit,  setDiskLimit]  = useState("");
  const [cpuWeight,  setCpuWeight]  = useState("");

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Resource Limits</div>
      <p className="sp-section-desc">
        Cap what agent sessions can consume per project. Leave blank for no limit.
        Enforced via OS-level Job Objects; applied at session spawn.
      </p>
      <div className="psp-fields">
        <NumericField
          label="Max memory"
          desc="Peak RSS limit per agent process."
          unit="MB"
          value={maxMemory}
          onChange={setMaxMemory}
          min={64}
        />
        <NumericField
          label="Max processes"
          desc="Maximum child processes an agent may spawn."
          value={maxProcs}
          onChange={setMaxProcs}
          min={1}
        />
        <NumericField
          label="Disk write limit"
          desc="Total bytes written to disk per session."
          unit="MB"
          value={diskLimit}
          onChange={setDiskLimit}
          min={1}
        />
        <NumericField
          label="CPU weight"
          desc="Relative scheduling priority (1–1024). Lower = less CPU share."
          value={cpuWeight}
          onChange={setCpuWeight}
          min={1}
          max={1024}
          placeholder="1024"
        />
      </div>
    </div>
  );
}
