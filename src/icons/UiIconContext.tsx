import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useExtensions } from "../extensions/ExtensionsContext";
import type { Extension, UiIconPackContribution } from "../extensions/types";

interface LoadedPack {
  extensionId: string;
  packId: string;
  displayName: string;
  /** Directory (relative to extension root) holding the SVGs. No trailing slash. */
  path: string;
}

interface Ctx {
  active: LoadedPack | null;
  available: { extensionId: string; pack: UiIconPackContribution }[];
  setActive: (extensionId: string, packId: string) => void;
  /** Returns an extension-relative SVG path, or null when no pack active. */
  resolvePath: (name: string) => string | null;
}

const UiIconContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "tempest.uiIconPack";

function collectPacks(extensions: Extension[]) {
  const out: { extensionId: string; pack: UiIconPackContribution }[] = [];
  for (const ext of extensions) {
    const packs = ext.manifest.contributes?.uiIconPacks ?? [];
    for (const pack of packs) {
      if (pack.format === "svg-directory") out.push({ extensionId: ext.id, pack });
    }
  }
  return out;
}

function stripTrailingSlash(p: string): string {
  return p.replace(/[\\/]+$/, "");
}

export function buildUiIconPath(dir: string, name: string): string {
  return `${stripTrailingSlash(dir)}/${name}.svg`;
}

export function UiIconProvider({ children }: { children: ReactNode }) {
  const { extensions, loading } = useExtensions();
  const available = useMemo(() => collectPacks(extensions), [extensions]);
  const [selection, setSelection] = useState<{ extensionId: string; packId: string } | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [active, setActiveLoaded] = useState<LoadedPack | null>(null);

  const target = useMemo(() => {
    if (loading) return null;
    if (selection) {
      const hit = available.find(
        (p) => p.extensionId === selection.extensionId && p.pack.id === selection.packId
      );
      if (hit) return hit;
    }
    return available[0] ?? null;
  }, [available, selection, loading]);

  useEffect(() => {
    if (!target) {
      setActiveLoaded(null);
      return;
    }
    setActiveLoaded({
      extensionId: target.extensionId,
      packId: target.pack.id,
      displayName: target.pack.displayName ?? target.pack.id,
      path: target.pack.path,
    });
  }, [target]);

  const setActive = (extensionId: string, packId: string) => {
    const next = { extensionId, packId };
    setSelection(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ponytail: localStorage may be blocked in private modes; ignore.
    }
  };

  const resolvePath = (name: string): string | null => {
    if (!active) return null;
    return buildUiIconPath(active.path, name);
  };

  return (
    <UiIconContext.Provider value={{ active, available, setActive, resolvePath }}>
      {children}
    </UiIconContext.Provider>
  );
}

export function useUiIconPack(): Ctx {
  const ctx = useContext(UiIconContext);
  if (!ctx) throw new Error("useUiIconPack must be inside UiIconProvider");
  return ctx;
}
