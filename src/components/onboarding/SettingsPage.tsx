import { useState } from 'react';
import { UiIcon } from "../../icons/UiIcon";
const ArrowLeft = (p: any) => <UiIcon name="arrow-left" {...p} />;
const ArrowRight = (p: any) => <UiIcon name="arrow-right" {...p} />;
const Cpu = (p: any) => <UiIcon name="cpu" {...p} />;
const GitBranch = (p: any) => <UiIcon name="git-branch" {...p} />;
const ShieldCheck = (p: any) => <UiIcon name="shield-check" {...p} />;
const GitCommitHorizontal = (p: any) => <UiIcon name="git-commit-horizontal" {...p} />;
const BarChart3 = (p: any) => <UiIcon name="bar-chart-3" {...p} />;
const Sparkles = (p: any) => <UiIcon name="sparkles" {...p} />;
const Check = (p: any) => <UiIcon name="check" {...p} />;
import { useSettings, updateSetting } from '../../store/appSettings';
import { setTelemetryEnabled } from '../../lib/telemetry';
import { useAttribution, setAttribution } from '../../store/attribution';
import { downloadAtlasModel } from '../../lib/atlasModel';
import type { ReactNode } from 'react';

interface Props {
  onBack: () => void;
  onComplete: () => void;
}

interface RowProps {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

function SettingRow({ icon, title, description, enabled, onToggle, className }: RowProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 18px',
        borderRadius: '10px',
        border: '1px solid var(--tempest-border-default)',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={onToggle}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--tempest-border-subtle)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--tempest-border-default)')}
    >
      <div style={{ color: 'var(--tempest-fg-subtle)', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tempest-fg-default)' }}>{title}</span>
        <span style={{ fontSize: '12px', color: 'var(--tempest-fg-muted)', lineHeight: 1.5 }}>{description}</span>
      </div>
      <button
        className={`ob-toggle${enabled ? ' ob-toggle--on' : ''}`}
        onClick={e => { e.stopPropagation(); onToggle(); }}
        role="switch"
        aria-checked={enabled}
        aria-label={title}
      >
        <span className="ob-toggle-thumb" />
      </button>
    </div>
  );
}

// Semantic search sub-option: consent + one-time model download with progress.
// Rendered only when Token Intelligence is on (semantic builds on the index).
function SemanticRow({ enabled }: { enabled: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');

  async function enable() {
    setPhase('downloading'); setPct(0); setErr('');
    try {
      await downloadAtlasModel((p) => {
        if (typeof p.progress === 'number') setPct(Math.round(p.progress));
      });
      updateSetting('atlasSemantic', true);
      setPhase('idle');
    } catch (e) {
      setErr(String(e)); setPhase('error');
      updateSetting('atlasSemantic', false);
    }
  }

  function toggle() {
    if (phase === 'downloading') return;
    if (enabled) { updateSetting('atlasSemantic', false); return; }
    void enable();
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        margin: '-4px 0 0 24px', padding: '16px 18px',
        borderRadius: '10px', border: '1px solid var(--tempest-border-default)',
        cursor: phase === 'downloading' ? 'default' : 'pointer', transition: 'border-color 0.15s',
      }}
      onClick={toggle}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--tempest-border-subtle)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--tempest-border-default)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ color: 'var(--tempest-fg-subtle)', flexShrink: 0 }}><Sparkles size={18} /></div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tempest-fg-default)' }}>Semantic code search</span>
          <span style={{ fontSize: '12px', color: 'var(--tempest-fg-muted)', lineHeight: 1.5 }}>
            One-time ~25&nbsp;MB model so agents retrieve code by meaning. Runs offline.
          </span>
        </div>
        <button
          className={`ob-toggle${enabled ? ' ob-toggle--on' : ''}`}
          onClick={e => { e.stopPropagation(); toggle(); }}
          role="switch"
          aria-checked={enabled}
          aria-label="Semantic code search"
          disabled={phase === 'downloading'}
        >
          <span className="ob-toggle-thumb" />
        </button>
      </div>

      {phase === 'downloading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ height: '4px', borderRadius: '2px', background: 'var(--tempest-border-default)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(pct, 4)}%`, background: 'var(--tempest-accent, #6366f1)', transition: 'width 0.2s' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--tempest-fg-muted)' }}>
            {pct > 0 ? `Downloading model… ${pct}%` : 'Preparing download…'}
          </span>
        </div>
      )}
      {phase === 'idle' && enabled && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#22c55e' }}>
          <Check size={12} /> Model ready. Semantic search is on.
        </span>
      )}
      {phase === 'error' && (
        <span style={{ fontSize: '11px', color: '#ef4444' }}>Download failed: {err}. Click to retry.</span>
      )}
    </div>
  );
}

export default function SettingsPage({ onBack, onComplete }: Props) {
  const { atlasEnabled, atlasSemantic, isolateAgents, autoApprove, telemetryEnabled } = useSettings();
  const attribution = useAttribution();

  return (
    <div className="ob-page">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 8px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '540px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--tempest-fg-default)' }}>
              Configure Tempest
            </div>
            <div style={{ fontSize: '13px', color: 'var(--tempest-fg-muted)', lineHeight: 1.6 }}>
              You can change any of these later in Settings.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SettingRow
              icon={<Cpu size={18} />}
              title="Token Intelligence"
              description="Indexes your codebase so agents get targeted context instead of whole files: up to 64% fewer tokens."
              enabled={atlasEnabled}
              onToggle={() => updateSetting('atlasEnabled', !atlasEnabled)}
            />
            {atlasEnabled && <SemanticRow enabled={atlasSemantic} />}
            <SettingRow
              icon={<GitBranch size={18} />}
              title="Agent Isolation"
              description="Each agent gets its own git worktree, so parallel sessions never collide. Your main branch stays clean until you merge."
              enabled={isolateAgents}
              onToggle={() => updateSetting('isolateAgents', !isolateAgents)}
            />
            <SettingRow
              icon={<ShieldCheck size={18} />}
              title="Bypass agent permissions"
              description="Lets agents read, write, and run commands without stopping to ask. Recommended for sandboxed sessions."
              enabled={autoApprove}
              onToggle={() => updateSetting('autoApprove', !autoApprove)}
            />
            <SettingRow
              className="ob-card--shine"
              icon={<GitCommitHorizontal size={18} />}
              title="Tempest co-author"
              description="Adds a Co-authored-by: Tempest trailer to commits in your workspaces. No data is collected or sent."
              enabled={attribution}
              onToggle={() => setAttribution(!attribution)}
            />
            <SettingRow
              icon={<BarChart3 size={18} />}
              title="Share anonymous usage data"
              description="Anonymous usage counts and error signals only, never code, prompts, or repo names. Off by default."
              enabled={telemetryEnabled}
              onToggle={() => setTelemetryEnabled(!telemetryEnabled)}
            />
          </div>

        </div>
      </div>

      {/* Footer nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px 36px',
        maxWidth: '540px', width: '100%', alignSelf: 'center',
      }}>
        <div />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="ob-btn-nav-secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </button>
          <button className="ob-btn-nav-primary" onClick={onComplete}>
            Finish setup <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
