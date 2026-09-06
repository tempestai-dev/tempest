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

  // When the ws dies, tear down the bridge — otherwise the RpcPeer's store
  // subscriptions (session.updated, queue.changed, projects.changed, PTY
  // stream listeners) keep firing and spam InvalidState errors as they emit
  // into a dead socket.
  ws.addEventListener("close", () => {
    if (bridges.get(pairingId) === b) {
      b.close();
      bridges.delete(pairingId);
      console.log(`[bridge] torn down pairing=${pairingId.slice(0, 8)} (ws closed)`);
    }
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
