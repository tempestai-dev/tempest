import { useSettings, updateSetting } from "../../store/appSettings";
import { SettingRow } from "../ui/SettingRow";

export function GitSection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Git</div>
      <p className="sp-section-desc">Configure how Tempest interacts with your repositories.</p>
      <div className="sp-rows">
        <SettingRow label="Branch prefix" hint="Prepended to new worktree branch names">
          <input
            className="sp-text-input"
            type="text"
            value={s.branchPrefix}
            placeholder="e.g. feat-"
            onChange={(e) => updateSetting("branchPrefix", e.target.value)}
          />
        </SettingRow>
        <SettingRow label="Commit message" hint="Used when pushing agent changes">
          <input
            className="sp-text-input"
            type="text"
            value={s.commitMessageTemplate}
            placeholder="Agent work"
            onChange={(e) => updateSetting("commitMessageTemplate", e.target.value)}
          />
        </SettingRow>
      </div>
    </div>
  );
}
