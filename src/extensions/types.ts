export interface ExtensionManifest {
  id: string;
  displayName?: string;
  description?: string;
  version: string;
  publisher?: string;
  author?: string;
  license?: string;
  homepage?: string;
  engines?: Record<string, unknown>;
  contributes?: {
    iconPacks?: IconPackContribution[];
    uiIconPacks?: UiIconPackContribution[];
    [key: string]: unknown;
  };
}

export interface IconPackContribution {
  id: string;
  displayName?: string;
  /** Currently supported: "vscode-icon-theme" (the format Symbols and most VSCode icon extensions ship). */
  format: "vscode-icon-theme";
  /** Path to the icon theme JSON, relative to the extension root. */
  manifest: string;
}

export interface UiIconPackContribution {
  id: string;
  displayName?: string;
  /** "svg-directory": every `<name>.svg` under `path` is a UI icon reachable by that name. */
  format: "svg-directory";
  /** Directory (relative to extension root) holding the SVG files. */
  path: string;
}

export interface Extension {
  id: string;
  dir: string;
  builtin: boolean;
  manifest: ExtensionManifest;
}

/** Parsed VSCode icon theme JSON — only the subset we consume. */
export interface VscodeIconTheme {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileExtensions?: Record<string, string>;
  fileNames?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  file?: string;
  folder?: string;
  folderExpanded?: string;
  languageIds?: Record<string, string>;
}
