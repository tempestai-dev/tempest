import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ChevronDown, Check } from 'lucide-react';

interface Props {
  onBack: () => void;
  onComplete: () => void;
}

const CDN = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/';

interface Provider {
  id: string;
  label: string;
  icon: string | null;
  invert: boolean;
  group: 'api' | 'local';
  keyLabel: string;
  keyPlaceholder: string;
  models: string[];
  customModels?: boolean;
  docs?: string;
}

const PROVIDERS: Provider[] = [
  { id: 'anthropic',  label: 'Anthropic',  icon: 'anthropic.svg',       invert: true,  group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'sk-ant-...',             models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'], docs: 'https://console.anthropic.com/' },
  { id: 'openai',     label: 'OpenAI',     icon: 'openai.svg',           invert: true,  group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'sk-...',                 models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'], docs: 'https://platform.openai.com/api-keys' },
  { id: 'gemini',     label: 'Gemini',     icon: 'gemini-color.svg',     invert: false, group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'AIza...',                models: ['gemini-2.5-pro', 'gemini-2.5-flash'], docs: 'https://aistudio.google.com/app/apikey' },
  { id: 'openrouter', label: 'OpenRouter', icon: 'openrouter.svg',       invert: true,  group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'sk-or-...',              models: [], customModels: true, docs: 'https://openrouter.ai/keys' },
  { id: 'mistral',    label: 'Mistral',    icon: 'mistral-color.svg',    invert: false, group: 'api',   keyLabel: 'API Key',  keyPlaceholder: '...',                    models: ['mistral-large-latest', 'mistral-small-latest'], docs: 'https://console.mistral.ai/' },
  { id: 'deepseek',   label: 'DeepSeek',   icon: 'deepseek-color.svg',   invert: false, group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'sk-...',                 models: ['deepseek-chat', 'deepseek-reasoner'], docs: 'https://platform.deepseek.com/' },
  { id: 'groq',       label: 'Groq',       icon: 'groq.svg',             invert: true,  group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'gsk_...',                models: ['llama-3.3-70b-versatile', 'moonshotai/kimi-k2'], docs: 'https://console.groq.com/keys' },
  { id: 'xai',        label: 'xAI',        icon: 'xai.svg',              invert: true,  group: 'api',   keyLabel: 'API Key',  keyPlaceholder: 'xai-...',                models: ['grok-3', 'grok-3-mini'], docs: 'https://console.x.ai/' },
  { id: 'ollama',     label: 'Ollama',     icon: 'ollama.svg',           invert: true,  group: 'local', keyLabel: 'Base URL', keyPlaceholder: 'http://localhost:11434', models: [], customModels: true },
  { id: 'lmstudio',   label: 'LM Studio',  icon: null,                   invert: false, group: 'local', keyLabel: 'Base URL', keyPlaceholder: 'http://localhost:1234',  models: [], customModels: true },
];

const fieldLabel: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--tempest-fg-subtle)',
  textTransform: 'uppercase',
  letterSpacing: '0.9px',
  fontWeight: 600,
};

function inputStyle(focused?: boolean): React.CSSProperties {
  return {
    background: 'var(--tempest-bg-input)',
    border: `1px solid ${focused ? 'var(--tempest-border-subtle)' : 'var(--tempest-border-default)'}`,
    borderRadius: '7px',
    color: 'var(--tempest-fg-default)',
    fontSize: '13px',
    padding: '9px 12px',
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  };
}

// ── Model dropdown (portal) ──────────────────────────────────────
function ModelSelect({ options, value, onChange, extraOption }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  extraOption?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const allOptions = extraOption ? [...options, extraOption] : options;

  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    function onDown(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        style={{ ...inputStyle(open), display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {value || allOptions[0]}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: '8px', color: 'var(--tempest-fg-subtle)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
            background: 'var(--tempest-bg-panel)',
            border: '1px solid var(--tempest-border-default)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 99999, padding: '4px',
            maxHeight: '220px', overflowY: 'auto',
          }}
          className="ob-scrollable"
        >
          {allOptions.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              onMouseEnter={() => setHovered(opt)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                background: hovered === opt ? 'var(--tempest-bg-hover)' : 'transparent',
                color: value === opt ? 'var(--tempest-fg-default)' : 'var(--tempest-fg-muted)',
                fontSize: '13px', fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.1s',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
              {value === opt && <Check size={13} style={{ flexShrink: 0, marginLeft: '8px', color: 'var(--tempest-fg-default)' }} />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Provider card ────────────────────────────────────────────────
function ProviderCard({ p, selected, onClick }: { p: Provider; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`ob-agent-card ${selected ? 'ob-agent-card--selected' : ''}`}
      title={p.label}
    >
      <div className="ob-agent-icon-wrap">
        {p.icon
          ? <img
              src={CDN + p.icon}
              alt={p.label}
              width={32} height={32}
              style={{ objectFit: 'contain', filter: p.invert ? 'brightness(0) invert(1)' : 'none' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          : <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--tempest-bg-hover)', borderRadius: '7px', fontSize: '12px', fontWeight: 700, color: 'var(--tempest-fg-muted)' }}>
              {p.label.slice(0, 2)}
            </div>
        }
      </div>
      <span className="ob-agent-name">{p.label}</span>
    </button>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[0, 1].map(i => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="ob-skeleton" style={{ height: '9px', width: '52px' }} />
          <div className="ob-skeleton" style={{ height: '38px', width: '100%', borderRadius: '7px' }} />
          {i === 0 && <div className="ob-skeleton" style={{ height: '8px', width: '80px' }} />}
        </div>
      ))}
    </div>
  );
}

// ── Page 2 — BYOK ───────────────────────────────────────────────
export default function BYOKPage({ onBack, onComplete }: Props) {
  const [selected, setSelected]           = useState<Provider | null>(null);
  const [apiKey, setApiKey]               = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [showKey, setShowKey]             = useState(false);
  const [keyFocused, setKeyFocused]       = useState(false);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setSelectedModel(selected.models[0] ?? '');
  }, [selected]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    };
    update();
    el.addEventListener('scroll', update);
    return () => el.removeEventListener('scroll', update);
  }, []);

  function handleSelect(p: Provider) {
    if (selected?.id === p.id) return;
    setSelected(p);
    setApiKey('');
    setShowKey(false);
  }

  function handleComplete() {
    if (selected && apiKey.trim()) {
      localStorage.setItem(`tempest-byok-key-${selected.id}`, apiKey.trim());
      if (selectedModel) localStorage.setItem(`tempest-byok-model-${selected.id}`, selectedModel);
      localStorage.setItem('tempest-byok-provider', selected.id);
    }
    onComplete();
  }

  return (
    <div className="ob-page">
      <div className="ob-scrollable" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 8px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: '580px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Heading */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--tempest-fg-default)' }}>
              Bring your own key
            </div>
            <div style={{ fontSize: '13px', color: 'var(--tempest-fg-muted)', lineHeight: 1.6 }}>
              This powers the <strong style={{ color: 'var(--tempest-fg-default)', fontWeight: 600 }}>Chat tab</strong> — a direct conversation interface with the model of your choice, separate from your CLI agents. Your key stays on your machine and is never sent to Tempest's servers. You can add or change it later in Settings.
            </div>
          </div>

          {/* Provider grid */}
          <div style={{ position: 'relative' }}>
            {canScrollLeft  && <div className="ob-scroll-fade-left" />}
            {canScrollRight && <div className="ob-scroll-fade-right" />}
            <div ref={scrollRef} className="ob-scrollable" style={{ overflowX: 'auto', overflowY: 'hidden', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>
                {PROVIDERS.map(p => (
                  <ProviderCard
                    key={p.id}
                    p={p}
                    selected={selected?.id === p.id}
                    onClick={() => handleSelect(p)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <div style={{ borderTop: '1px solid var(--tempest-border-default)', paddingTop: '24px' }}>
            {!selected ? <Skeleton /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* API key / Base URL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={fieldLabel}>{selected.keyLabel}</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showKey || selected.group === 'local' ? 'text' : 'password'}
                      placeholder={selected.keyPlaceholder}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      onFocus={() => setKeyFocused(true)}
                      onBlur={() => setKeyFocused(false)}
                      style={{ ...inputStyle(keyFocused), paddingRight: selected.group !== 'local' ? '36px' : '12px' }}
                    />
                    {selected.group !== 'local' && (
                      <button
                        onClick={() => setShowKey(v => !v)}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--tempest-fg-subtle)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                  {selected.docs && (
                    <a
                      href={selected.docs}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '12px', color: 'var(--tempest-fg-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--tempest-fg-default)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--tempest-fg-muted)'; }}
                    >
                      Get API key ↗
                    </a>
                  )}
                </div>

                {/* Model */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={fieldLabel}>Model</div>
                  {selected.models.length > 0
                    ? <ModelSelect
                        options={selected.models}
                        value={selectedModel}
                        onChange={setSelectedModel}
                        extraOption={selected.customModels ? 'Custom model…' : undefined}
                      />
                    : <input
                        type="text"
                        placeholder={selected.group === 'local' ? 'llama3.2, mistral, gemma3…' : 'Model name'}
                        style={inputStyle()}
                      />
                  }
                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* Footer nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px 36px',
        maxWidth: '580px', width: '100%', alignSelf: 'center',
      }}>
        <button className="ob-btn-skip" onClick={onComplete}>Skip for now</button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="ob-btn-nav-secondary" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </button>
          <button className="ob-btn-nav-primary" onClick={handleComplete}>
            Next <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
