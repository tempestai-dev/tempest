import { ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AGENT_CONFIGS } from '../NewSessionMenu';
import { useAgentAvailability } from '../../store/agentAvailability';

interface Props {
  onBack: () => void;
  onComplete: () => void;
}

// ── Page 2 — Supported agents (informational) ────────────────────
export default function AgentsPage({ onBack, onComplete }: Props) {
  const available = useAgentAvailability();

  return (
    <div className="ob-page">
      <div className="ob-scrollable" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 8px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '580px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Heading */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--tempest-fg-default)' }}>
              Works with your agents
            </div>
            <div style={{ fontSize: '13px', color: 'var(--tempest-fg-muted)', lineHeight: 1.6 }}>
              Tempest runs your existing CLI agents — one per branch, in parallel. Install any below and they appear automatically.
            </div>
          </div>

          {/* Vertical agent list — fixed height, scrollable */}
          <div className="ob-scrollable" style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
            {AGENT_CONFIGS.map((a) => {
              const status    = available[a.hint];
              const isReady   = status === true;
              const isMissing = status === false;

              return (
                <div
                  key={a.hint}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '9px',
                    border: '1px solid var(--tempest-border-default)',
                    background: 'transparent',
                  }}
                >
                  {/* Icon */}
                  <img
                    src={a.iconSrc}
                    alt={a.name}
                    width={22}
                    height={22}
                    style={{ objectFit: 'contain', flexShrink: 0 }}
                    className={a.mono ? 'ob-icon--mono' : ''}
                  />

                  {/* Name + hint */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--tempest-fg-default)' }}>{a.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--tempest-fg-subtle)', fontFamily: 'monospace' }}>{a.hint}</span>
                  </div>

                  {/* Status badge */}
                  {status !== undefined && (
                    <span className={`ob-agent-badge ${isReady ? 'ob-agent-badge--ok' : 'ob-agent-badge--missing'}`}>
                      {isReady ? 'ready' : 'missing'}
                    </span>
                  )}

                  {/* Install button for missing agents */}
                  {isMissing && a.downloadUrl && (
                    <button
                      title={`Install ${a.name}`}
                      onClick={() => openUrl(a.downloadUrl!).catch(() => {})}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        background: 'transparent',
                        border: '1px solid var(--tempest-border-subtle)',
                        borderRadius: '5px',
                        color: 'var(--tempest-fg-muted)',
                        fontSize: '11px', fontWeight: 600,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                        transition: 'color 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--tempest-fg-default)'; el.style.borderColor = 'var(--tempest-fg-muted)'; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--tempest-fg-muted)'; el.style.borderColor = 'var(--tempest-border-subtle)'; }}
                    >
                      <Download size={11} /> Install
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: '12px', color: 'var(--tempest-fg-subtle)', lineHeight: 1.6 }}>
            Use the <strong style={{ color: 'var(--tempest-fg-default)', fontWeight: 500 }}>+</strong> button in the session bar to start a session with any installed agent.
          </p>

        </div>
      </div>

      {/* Footer nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px 36px',
        maxWidth: '580px', width: '100%', alignSelf: 'center',
      }}>
        <div />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="ob-btn-nav-secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </button>
          <button className="ob-btn-nav-primary" onClick={onComplete}>
            Next <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
