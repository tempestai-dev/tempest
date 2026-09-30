import type { VscodeIconTheme } from "../extensions/types";

/**
 * Resolve a filename/foldername to an icon path (relative to the extension
 * root) using a VSCode icon theme JSON. Returns null if no icon matches AND
 * no default is set — caller should fall back to a generic glyph.
 */
export function resolveIconPath(
  theme: VscodeIconTheme,
  name: string,
  isDir: boolean,
  isOpen: boolean
): string | null {
  const lower = name.toLowerCase();

  let key: string | undefined;

  if (isDir) {
    if (isOpen) {
      key = theme.folderNamesExpanded?.[lower] ?? theme.folderNamesExpanded?.[name];
    }
    key = key ?? theme.folderNames?.[lower] ?? theme.folderNames?.[name];
    key = key ?? (isOpen ? theme.folderExpanded : undefined) ?? theme.folder;
  } else {
    key = theme.fileNames?.[lower] ?? theme.fileNames?.[name];
    if (!key) {
      // VSCode's fileExtensions matches by longest extension first, so probe
      // "a.b.c" → "b.c" → "c". Same behaviour Symbols relies on.
      const parts = lower.split(".");
      for (let i = 1; i < parts.length; i++) {
        const ext = parts.slice(i).join(".");
        const hit = theme.fileExtensions?.[ext];
        if (hit) {
          key = hit;
          break;
        }
      }
    }
    key = key ?? theme.file;
  }

  if (!key) return null;
  const def = theme.iconDefinitions[key];
  return def?.iconPath ?? null;
}
