import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useExtensions } from "../extensions/ExtensionsContext";
import { readExtensionFile } from "../extensions/registry";
import type { Extension, IconPackContribution, VscodeIconTheme } from "../extensions/types";
import { resolveIconPath } from "./resolveIcon";

interface LoadedPack {
  extensionId: string;
  packId: string;
  displayName: string;
  theme: VscodeIconTheme;
}

interface Ctx {
  active: LoadedPack | null;
  /** All installed packs, for a future settings picker. */
  available: { extensionId: string; pack: IconPackContribution }[];
  setActive: (extensionId: string, packId: string) => void;
  /** Returns an extension-relative icon path, or null when no mapping and no default. */
  resolvePath: (name: string, isDir: boolean, isOpen: boolean) => string | null;
}

const IconPackContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "tempest.iconPack";

function collectPacks(extensions: Extension[]) {
  const out: { extensionId: string; pack: IconPackContribution }[] = [];
  for (const ext of extensions) {
    const packs = ext.manifest.contributes?.iconPacks ?? [];
    for (const pack of packs) {
      if (pack.format === "vscode-icon-theme") out.push({ extensionId: ext.id, pack });
    }
  }
  return out;
}

export function IconPackProvider({ children }: { children: ReactNode }) {
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
    // Default: first available pack. Keeps things working out of the box.
    return available[0] ?? null;
  }, [available, selection, loading]);

  useEffect(() => {
    if (!target) {
      setActiveLoaded(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await readExtensionFile(target.extensionId, target.pack.manifest);
        const theme = JSON.parse(raw) as VscodeIconTheme;
        if (!cancelled) {
          setActiveLoaded({
            extensionId: target.extensionId,
            packId: target.pack.id,
            displayName: target.pack.displayName ?? target.pack.id,
            theme,
          });
        }
      } catch (e) {
        console.error("icon pack load failed", target, e);
        if (!cancelled) setActiveLoaded(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  const setActive = (extensionId: string, packId: string) => {
    const next = { extensionId, packId };
    setSelection(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ponytail: localStorage may be blocked in private modes; ignore, next launch defaults.
    }
  };

  const resolvePath = (name: string, isDir: boolean, isOpen: boolean): string | null => {
    if (!active) return null;
    return resolveIconPath(active.theme, name, isDir, isOpen);
  };

  return (
    <IconPackContext.Provider value={{ active, available, setActive, resolvePath }}>
      {children}
    </IconPackContext.Provider>
  );
}

export function useIconPack(): Ctx {
  const ctx = useContext(IconPackContext);
  if (!ctx) throw new Error("useIconPack must be inside IconPackProvider");
  return ctx;
}
