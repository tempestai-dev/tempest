import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listExtensions, seedExtensions } from "./registry";
import type { Extension } from "./types";

interface Ctx {
  extensions: Extension[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ExtensionsContext = createContext<Ctx | null>(null);

export function ExtensionsProvider({ children }: { children: ReactNode }) {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const list = await listExtensions();
    setExtensions(list);
  };

  useEffect(() => {
    (async () => {
      try {
        await seedExtensions();
        await refresh();
      } catch (e) {
        console.error("extensions load failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ExtensionsContext.Provider value={{ extensions, loading, refresh }}>
      {children}
    </ExtensionsContext.Provider>
  );
}

export function useExtensions(): Ctx {
  const ctx = useContext(ExtensionsContext);
  if (!ctx) throw new Error("useExtensions must be inside ExtensionsProvider");
  return ctx;
}
