import { useState, useEffect } from 'react';
import { CircleArrowRight } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { TempestLogo } from '../../assets/TempestLogo';

interface Props { onComplete: () => void; }

// ── Page 0 — Welcome ────────────────────────────────────────────
export default function WelcomePage({ onComplete }: Props) {
  const [version, setVersion] = useState('');
  useEffect(() => { getVersion().then(setVersion); }, []);

  return (
    <div className="ob-blank">
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '18px', transform: 'translateY(3px)' }}>
        <TempestLogo style={{ height: '36px', width: 'auto', alignSelf: 'flex-start', transform: 'translateY(-6px)', color: 'var(--tempest-fg-default)' }} />
        <p style={{
          fontSize: '16px',
          fontWeight: 400,
          color: 'var(--tempest-fg-muted)',
          letterSpacing: '-0.2px',
          lineHeight: 1.4,
          maxWidth: '452px',
          margin: '-8px 0 0',
        }}>
          Run your AI coding agents in parallel with 64% fewer tokens and deeper codebase understanding
        </p>
        <div className="ob-metal">
          <button className="ob-blank-btn" onClick={onComplete}>
            Get Started
            <CircleArrowRight size={21} />
          </button>
        </div>
      </div>

      <div className="ob-box" />

      <div className="ob-footer">
        <div className="ob-blank-license">
          <button className="ob-license-link" onClick={() => openUrl('https://github.com/tempestai-dev/tempest/blob/main/LICENSE').catch(() => {})}>Apache 2.0 License</button>
          <span className="ob-license-sep">·</span>
          <button className="ob-license-link" onClick={() => openUrl('https://tempestai.dev/privacy-policy').catch(() => {})}>Privacy Policy</button>
          <span className="ob-license-sep">·</span>
          <button className="ob-license-link" onClick={() => openUrl('https://tempestai.dev/terms').catch(() => {})}>Terms &amp; Conditions</button>
        </div>
        {version && <span className="ob-blank-version">v{version}</span>}
      </div>
    </div>
  );
}
