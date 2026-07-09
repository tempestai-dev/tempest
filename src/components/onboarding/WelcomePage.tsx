import { ArrowRight } from 'lucide-react';
import { useTheme } from '../../themes/ThemeContext';
import { TempestLogo } from '../../assets/TempestLogo';
import screenshotDark from '../../assets/onboarding/screenshot-dark.png';
import screenshotLight from '../../assets/onboarding/screenshot-light.png';

// Preload both at module load time so they're decoded before the page renders
const _preloadDark = new Image(); _preloadDark.src = screenshotDark;
const _preloadLight = new Image(); _preloadLight.src = screenshotLight;

interface Props {
  onStart: () => void;
  onSkip: () => void;
}

// ── Page 0 — Welcome ────────────────────────────────────────────
export default function WelcomePage({ onStart, onSkip }: Props) {
  const { theme } = useTheme();
  const screenshot = theme.type === 'dark' ? screenshotDark : screenshotLight;

  return (
    <div className="ob-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 48px 28px', gap: 0 }}>

      {/* Hero heading */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>

        {/* Wordmark */}
        <TempestLogo style={{ height: '36px', width: 'auto', color: 'var(--tempest-fg-default)' }} />

        <p style={{
          fontSize: '20px',
          fontWeight: 600,
          color: 'var(--tempest-fg-default)',
          letterSpacing: '-0.3px',
          textAlign: 'center',
          lineHeight: 1.3,
          marginTop: '6px',
        }}>
          The Agentic IDE
        </p>

        <p style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--tempest-fg-default)',
          textAlign: 'center',
          lineHeight: 1.5,
          maxWidth: '340px',
        }}>
          Run parallel AI agents with 64% fewer tokens and deeper codebase understanding.
        </p>
      </div>

      {/* Hero screenshot */}
      <div style={{ width: '100%', maxWidth: '1020px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={screenshot}
          alt="Tempest — parallel AI agent sessions"
          style={{
            maxWidth: '100%',
            maxHeight: '480px',
            objectFit: 'contain',
            borderRadius: '6px',
            display: 'block',
            boxShadow: '0 4px 32px rgba(0, 0, 0, 0.35)',
          }}
        />
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '22px' }}>
        <button className="ob-btn-cta" onClick={onStart}>
          Get Started <ArrowRight size={17} />
        </button>
        <button className="ob-btn-skip" onClick={onSkip}>
          Skip setup
        </button>
      </div>

    </div>
  );
}
