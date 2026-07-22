import { ArrowLeft, ArrowRight, Cpu, GitBranch, ShieldCheck, GitCommitHorizontal } from 'lucide-react';
import { useSettings, updateSetting } from '../../store/appSettings';
import { useAttribution, setAttribution } from '../../store/attribution';
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

export default function SettingsPage({ onBack, onComplete }: Props) {
  const { atlasEnabled, isolateAgents, autoApprove } = useSettings();
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
              description="Builds a knowledge graph of your codebase so agents receive precise, targeted context instead of whole files — reducing token usage by up to 64% without losing accuracy."
              enabled={atlasEnabled}
              onToggle={() => updateSetting('atlasEnabled', !atlasEnabled)}
            />
            <SettingRow
              icon={<GitBranch size={18} />}
              title="Agent Isolation"
              description="Each agent session gets its own git worktree, so parallel agents never touch each other's files. Your main branch stays clean until you choose to merge."
              enabled={isolateAgents}
              onToggle={() => updateSetting('isolateAgents', !isolateAgents)}
            />
            <SettingRow
              icon={<ShieldCheck size={18} />}
              title="Bypass agent permissions"
              description="Passes the auto-approve flag to agents (e.g. --dangerously-skip-permissions) so they can read, write, and run commands without stopping to ask. Recommended for sandboxed sessions."
              enabled={autoApprove}
              onToggle={() => updateSetting('autoApprove', !autoApprove)}
            />
            <SettingRow
              className="ob-card--shine"
              icon={<GitCommitHorizontal size={18} />}
              title="Tempest co-author"
              description="Appends a Co-authored-by: Tempest trailer to commits made inside your workspaces. On GitHub, that means every commit shows Tempest next to your name — a quiet signal to other developers that this project was built with the help of Tempest. No data is collected and nothing is sent anywhere."
              enabled={attribution}
              onToggle={() => setAttribution(!attribution)}
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
