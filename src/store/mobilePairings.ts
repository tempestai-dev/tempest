import { useSyncExternalStore } from "react";

// Mobile pairing store. Phase 1 populates real records after a
// libsodium-authenticated handshake through the CF Worker relay.
// Session-scoped for free tier: pairings persist across renders in the
// current process, and localStorage keeps them across app relaunches on
// the same device — but a paired phone can't reconnect once the laptop's
// ephemeral keypair (held only in memory by MobileSection) is gone.

export interface PairedPhone {
  id: string;
  name: string;
  pubkey: string;      // base64 X25519 pubkey the phone sent during pairing
  fingerprint: string; // SSH-style short id derived from pubkey
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

export function addPairedPhone(input: {
  name: string;
  pubkey: string;
  fingerprint: string;
}): void {
  const now = Date.now();
  _state = {
    ..._state,
    paired: [
      ..._state.paired,
      {
        id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: input.name,
        pubkey: input.pubkey,
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
