import { useSettings, updateSetting, FONT_FAMILY_OPTIONS, type AppSettings } from "../../store/appSettings";
import { SettingRow } from "../ui/SettingRow";
import { Stepper } from "../ui/Stepper";
import { Segmented } from "../ui/Segmented";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { SpSelect } from "../ui/SpSelect";

export function TerminalSection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Terminal</div>
      <p className="sp-section-desc">Customize how the embedded terminal looks and behaves.</p>
      <div className="sp-rows">
        <SettingRow label="Font size" hint="10 – 20 px">
          <Stepper value={s.terminalFontSize} min={10} max={20}
            onChange={(v) => updateSetting("terminalFontSize", v)} />
        </SettingRow>
        <SettingRow label="Font family">
          <SpSelect
            value={s.terminalFontFamily}
            options={FONT_FAMILY_OPTIONS}
            onChange={(v) => updateSetting("terminalFontFamily", v)}
          />
        </SettingRow>
        <SettingRow label="Cursor style">
          <Segmented
            options={[
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Line" },
            ]}
            value={s.terminalCursorStyle}
            onChange={(v) => updateSetting("terminalCursorStyle", v as AppSettings["terminalCursorStyle"])}
          />
        </SettingRow>
        <SettingRow label="Cursor blink">
          <ToggleSwitch on={s.terminalCursorBlink}
            onChange={(v) => updateSetting("terminalCursorBlink", v)} />
        </SettingRow>
        <SettingRow label="Scrollback" hint="Lines kept in history">
          <input
            className="sp-number-input"
            type="number"
            min={100} max={50000} step={100}
            value={s.terminalScrollback}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 100 && n <= 50000) updateSetting("terminalScrollback", n);
            }}
          />
        </SettingRow>
      </div>
    </div>
  );
}
