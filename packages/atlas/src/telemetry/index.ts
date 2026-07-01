export type UsageKind = 'mcp_tool' | 'cli_command';
export type LifecycleEvent = 'install' | 'index' | 'uninstall';

export interface ClientInfo {
  name?: string;
  version?: string;
}

export interface TelemetryStatus {
  enabled: boolean;
  decidedBy: 'DO_NOT_TRACK' | 'ATLAS_TELEMETRY' | 'config' | 'default';
  machineId: string | null;
  configPath: string;
}

class NoopTelemetry {
  getStatus(): TelemetryStatus {
    return { enabled: false, decidedBy: 'DO_NOT_TRACK', machineId: null, configPath: '' };
  }
  isEnabled(): boolean { return false; }
  recordUsage(_kind: UsageKind, _name: string, _ok: boolean, _client?: ClientInfo): void {}
  recordLifecycle(_event: LifecycleEvent, _props: Record<string, unknown>): void {}
  maybeFlush(): void {}
  async flushNow(_timeoutMs?: number): Promise<void> {}
  startInterval(_everyMs?: number): void {}
  stopInterval(): void {}
  persistSync(): void {}
  hasStoredChoice(): boolean { return true; }
  setEnabled(_enabled: boolean, _source: 'installer' | 'cli'): void {}
}

const singleton = new NoopTelemetry();

export function getTelemetry(): NoopTelemetry {
  return singleton;
}

export function recordIndexEvent(
  _cg: { getStats(): { filesByLanguage: Record<string, number> } },
  _result: { filesIndexed: number; durationMs: number },
): void {}
