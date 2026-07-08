import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AGENT_CONFIGS } from '../components/NewSessionMenu';

// undefined = not checked yet; true/false = result
export type AvailabilityMap = Record<string, boolean | undefined>;

let _state: AvailabilityMap = {};
let _started = false;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach(l => l());
}

export function useAgentAvailability(): AvailabilityMap {
  return useSyncExternalStore(
    cb => { _listeners.add(cb); return () => _listeners.delete(cb); },
    () => _state,
  );
}

// Safe to call multiple times — only runs checks once.
export function checkAgentAvailability(): void {
  if (_started) return;
  _started = true;
  for (const a of AGENT_CONFIGS) {
    const program = a.hint.split(' ')[0]!;
    invoke<boolean>('check_program_available', { program })
      .then(ok  => { _state = { ..._state, [a.hint]: ok };    notify(); })
      .catch(()  => { _state = { ..._state, [a.hint]: false }; notify(); });
  }
}
