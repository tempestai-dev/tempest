export function Segmented({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sp-segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={`sp-segmented-btn${value === o.value ? " sp-segmented-btn--active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
