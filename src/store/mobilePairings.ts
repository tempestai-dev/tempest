import { useSyncExternalStore } from "react";

// Mobile pairing store. Phase 0 is UI-first: the "paired phones" list is
// seeded here and mutated locally so the Settings → Mobile pane has real
// data to render before the relay + libsodium handshake land in Phase 1.
//
// Persistence is intentionally lightweight — localStorage keyed by name —
// so we don't have to touch runtimeState for a scaffold that Phase 1 will
// replace with real handshake-completed records.

export interface PairedPhone {
  id: string;
  name: string;
  fingerprint: string; // SSH-style short id shown next to the name
  pairedAt: number;
  lastSeenAt: number | null;
}

interface MobileState {
  deviceName: string;
  paired: PairedPhone[];
}

const DEVICE_NAME_KEY = "tempest.mobile.deviceName";
const PAIRED_KEY = "tempest.mobile.paired";

function loadPaired(): PairedPhone[] {
  try {
    const raw = localStorage.getItem(PAIRED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let _state: MobileState = {
  deviceName: localStorage.getItem(DEVICE_NAME_KEY) ?? "",
  paired: loadPaired(),
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getMobileState(): MobileState {
  return _state;
}

export function setDeviceName(name: string): void {
  _state = { ..._state, deviceName: name };
  try { localStorage.setItem(DEVICE_NAME_KEY, name); } catch {}
  emit();
}

export function renamePairedPhone(id: string, name: string): void {
  _state = {
    ..._state,
    paired: _state.paired.map((p) => (p.id === id ? { ...p, name } : p)),
  };
  persist();
  emit();
}

export function forgetPairedPhone(id: string): void {
  _state = { ..._state, paired: _state.paired.filter((p) => p.id !== id) };
  persist();
  emit();
}

// Phase 0 helper: simulate a successful pair. Phase 1 replaces the caller
// with the real handshake-completion path, but the record shape stays.
export function addPairedPhone(input: { name: string; fingerprint: string }): void {
  const now = Date.now();
  _state = {
    ..._state,
    paired: [
      ...(_state.paired),
      {
        id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: input.name,
        fingerprint: input.fingerprint,
        pairedAt: now,
        lastSeenAt: now,
      },
    ],
  };
  persist();
  emit();
}

function persist(): void {
  try { localStorage.setItem(PAIRED_KEY, JSON.stringify(_state.paired)); } catch {}
}

export function useMobileState(): MobileState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => _state,
  );
}
