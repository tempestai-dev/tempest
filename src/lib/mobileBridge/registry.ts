// Module-level registry of live phone bridges. Bridges outlive the
// MobileSection component that spawned them — the paired phone should keep
// working after the user closes the settings panel.

import { attachBridge, type AttachedBridge } from "./bridge";

const bridges = new Map<string, AttachedBridge>();

export function registerBridge(pairingId: string, ws: WebSocket, sessionKey: Uint8Array): AttachedBridge {
  // Evict any prior bridge for the same pairing (shouldn't happen in a
  // healthy run, but a repeated pair from the same phone shouldn't leak).
  bridges.get(pairingId)?.close();

  const b = attachBridge(ws, sessionKey);
  bridges.set(pairingId, b);

  ws.addEventListener("close", () => {
    if (bridges.get(pairingId) === b) bridges.delete(pairingId);
  });

  return b;
}

export function getBridge(pairingId: string): AttachedBridge | undefined {
  return bridges.get(pairingId);
}

export function activeBridgeCount(): number {
  return bridges.size;
}

export function closeAllBridges(): void {
  for (const b of bridges.values()) b.close();
  bridges.clear();
}
