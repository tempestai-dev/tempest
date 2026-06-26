import type { Theme } from "./types";

// "bg.editor" → "--tempest-bg-editor"
function tokenToCssVar(token: string): string {
  return "--tempest-" + token.replace(/\./g, "-");
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [token, value] of Object.entries(theme.colors)) {
    root.style.setProperty(tokenToCssVar(token), value);
  }
  root.setAttribute("data-theme", theme.type);
}
