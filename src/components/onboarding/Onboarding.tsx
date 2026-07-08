import { useState, useEffect } from 'react';
import { Minus, Square, X, Sun, Moon } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTheme } from '../../themes/ThemeContext';
import { checkAgentAvailability } from '../../store/agentAvailability';
import { getBindings, matchesEvent } from '../../store/keybindings';
import WelcomePage from './WelcomePage';
import AgentsPage from './AgentsPage';
import BYOKPage from './BYOKPage';
import SettingsPage from './SettingsPage';
import './Onboarding.css';

interface Props { onComplete: () => void; }

const win = getCurrentWindow();

export default function Onboarding({ onComplete }: Props) {
  const [page, setPage] = useState(0);
  const { theme, themes, setTheme } = useTheme();

  // Start agent availability checks immediately so page 3 is pre-populated.
  useEffect(() => { checkAgentAvailability(); }, []);

  // Mirror the global toggleTheme shortcut since WorkspaceView isn't mounted yet.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (matchesEvent(getBindings().toggleTheme, e)) { e.preventDefault(); toggleTheme(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  const isDark = theme.type === 'dark';

  function toggleTheme() {
    const next = themes.find(t => t.type !== theme.type);
    if (next) setTheme(next);
  }

  return (
    <div className="ob-root">

      {/* Drag region + window controls */}
      <div className="ob-drag">
        <button className="ob-win-btn" onClick={() => win.minimize()}>
          <Minus size={12} />
        </button>
        <button className="ob-win-btn" onClick={() => win.toggleMaximize()}>
          <Square size={10} />
        </button>
        <button className="ob-win-btn ob-win-btn--close" onClick={() => win.close()}>
          <X size={12} />
        </button>
      </div>

      {/* ── Page 0 — Welcome ── */}
      {page === 0 && (
        <WelcomePage
          onStart={() => setPage(1)}
          onSkip={onComplete}
        />
      )}

      {/* ── Page 1 — BYOK ── */}
      {page === 1 && (
        <BYOKPage
          onBack={() => setPage(0)}
          onComplete={() => setPage(2)}
        />
      )}

      {/* ── Page 2 — Agents ── */}
      {page === 2 && (
        <AgentsPage
          onBack={() => setPage(1)}
          onComplete={() => setPage(3)}
        />
      )}

      {/* ── Page 3 — Settings ── */}
      {page === 3 && (
        <SettingsPage
          onBack={() => setPage(2)}
          onComplete={onComplete}
        />
      )}

      {/* Theme toggle — bottom-right corner */}
      <button className="ob-theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

    </div>
  );
}
