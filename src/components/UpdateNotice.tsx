import { UiIcon } from "../icons/UiIcon";
const X = (p: any) => <UiIcon name="x" {...p} />;

interface Props {
  version: string;
  /// Opens the release notes. Bound to the sentence, not the action word.
  onNotes: () => void;
  /// Starts the upgrade. Bound to the action word only.
  onUpdate: () => void;
  onDismiss: () => void;
}

/// One line of update text, shared by both surfaces: the footer that drops in
/// on Overview and the cycling row in the workspace status bar. Two separate
/// targets — the sentence reads the notes, the word does the work — so a stray
/// click never restarts the app.
export function UpdateNotice({ version, onNotes, onUpdate, onDismiss }: Props) {
  return (
    <div className="update-notice">
      <button className="update-notice-text" onClick={onNotes}>
        Version {version} is available
      </button>
      <button className="update-notice-action" onClick={onUpdate}>
        Update
      </button>
      <button className="update-notice-close" onClick={onDismiss} aria-label="Dismiss">
        <X size={11} strokeWidth={2.5} />
      </button>
    </div>
  );
}
