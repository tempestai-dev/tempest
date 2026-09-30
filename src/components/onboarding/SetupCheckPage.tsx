import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { UiIcon } from "../../icons/UiIcon";
const XCircle = (p: any) => <UiIcon name="x-circle" {...p} />;
const RefreshCw = (p: any) => <UiIcon name="refresh-cw" {...p} />;
const ArrowRight = (p: any) => <UiIcon name="arrow-right" {...p} />;
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

interface Props { onComplete: () => void; }

type Stage = 'setup' | 'pass' | 'fail' | 'skipped';
type ItemStatus = 'pending' | 'running' | 'done' | 'fail';

interface CheckItem {
  id: string;
  label: string;
  status: ItemStatus;
  detail: string;
}

const BLOCKED_FEATURES = [
  { name: 'CLI Agents', desc: 'Run Claude Code and other agents in parallel across branches' },
  { name: 'Atlas', desc: 'Code intelligence and codebase understanding' },
  { name: 'Automations', desc: 'Scheduled and triggered agent automations' },
];

function ItemRow({ item, rowRef }: { item: CheckItem; rowRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div ref={rowRef} className="ob-check-row" style={{ opacity: 0, transform: 'translateY(10px)' }}>
      <div className="ob-check-icon-wrap">
        {item.status === 'running' || item.status === 'pending'
          ? <div className={`ob-check-spinner${item.status === 'pending' ? ' ob-check-spinner--idle' : ''}`} />
          : item.status === 'done'
            ? <svg className="ob-check-tick" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            : <svg className="ob-check-cross" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
        }
      </div>
      <span className="ob-check-label">{item.label}</span>
      {item.detail && item.status !== 'pending' && item.status !== 'running' && (
        <span className="ob-check-detail">{item.detail}</span>
      )}
    </div>
  );
}

// ── Page 4 — Setup check ─────────────────────────────────────────
export default function SetupCheckPage({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('setup');
  const [runKey, setRunKey] = useState(0);
  const [nodeVersion, setNodeVersion] = useState('');
  const [items, setItems] = useState<CheckItem[]>(freshItems());

  function freshItems(): CheckItem[] {
    return [
      { id: 'workspace', label: 'Initializing workspace',  status: 'pending', detail: 'Ready' },
      { id: 'node',      label: 'Checking for Node.js',    status: 'pending', detail: '' },
      { id: 'runtime',   label: 'Verifying agent runtime', status: 'pending', detail: 'All clear' },
    ];
  }

  const setupRef  = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const rowRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const versionRef = useRef<HTMLParagraphElement>(null);
  const readyRef   = useRef<HTMLDivElement>(null);

  function setItem(id: string, patch: Partial<CheckItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  // Sequence: workspace → node check → runtime → transition
  useEffect(() => {
    let cancelled = false;
    setItems(freshItems());

    async function run() {
      // Stagger rows in — tiny delay so refs are mounted
      await delay(80);
      if (cancelled) return;

      // Animate rows in sequentially
      for (let i = 0; i < rowRefs.current.length; i++) {
        const el = rowRefs.current[i];
        if (el) gsap.to(el, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', delay: i * 0.12 });
      }

      await delay(300);
      if (cancelled) return;

      // Step 1 — workspace (cosmetic)
      setItem('workspace', { status: 'running' });
      await delay(500);
      if (cancelled) return;
      setItem('workspace', { status: 'done' });

      await delay(180);
      if (cancelled) return;

      // Step 2 — real node check
      setItem('node', { status: 'running' });
      const version = await invoke<string | null>('get_node_version').catch(() => null);
      if (cancelled) return;

      if (version) {
        setNodeVersion(version);
        setItem('node', { status: 'done', detail: version });

        await delay(200);
        if (cancelled) return;

        // Step 3 — runtime (cosmetic, only on pass)
        setItem('runtime', { status: 'running' });
        await delay(500);
        if (cancelled) return;
        setItem('runtime', { status: 'done' });

        await delay(600);
        if (cancelled) return;

        // Transition to pass
        gsap.to(setupRef.current, { opacity: 0, y: -16, duration: 0.4, ease: 'power2.in', onComplete: () => {
          if (!cancelled) setStage('pass');
        }});
      } else {
        setItem('node', { status: 'fail', detail: 'Not found' });
        setItem('runtime', { status: 'fail', detail: 'Requires Node.js' });

        await delay(800);
        if (cancelled) return;

        gsap.to(setupRef.current, { opacity: 0, y: -16, duration: 0.4, ease: 'power2.in', onComplete: () => {
          if (!cancelled) setStage('fail');
        }});
      }
    }

    void run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  // Pass animation: version text → morph to "You're ready"
  useGSAP(() => {
    if (stage !== 'pass' || !resultRef.current) return;

    const tl = gsap.timeline();
    tl.from(resultRef.current, { opacity: 0, y: 20, duration: 0.4, ease: 'power2.out' })
      .from('.ob-pass-icon', { scale: 0, duration: 0.5, ease: 'elastic.out(1, 0.55)' }, '-=0.1')
      .from(versionRef.current, { opacity: 0, y: 6, duration: 0.3 }, '-=0.1')
      .to(versionRef.current, { opacity: 0, y: -8, duration: 0.25 }, '+=1.0')
      .fromTo(readyRef.current,
        { opacity: 0, y: 10, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power2.out', onComplete }
      );
  }, { dependencies: [stage] });

  // Fail animation
  useGSAP(() => {
    if (stage !== 'fail' || !resultRef.current) return;
    gsap.from(resultRef.current, { opacity: 0, y: 20, duration: 0.4, ease: 'power2.out' });
    gsap.from('.ob-fail-icon', { scale: 0, duration: 0.45, ease: 'back.out(1.4)', delay: 0.15 });
  }, { dependencies: [stage] });

  // ── Setup stage ───────────────────────────────────────────────
  if (stage === 'setup') {
    return (
      <div className="ob-blank" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div ref={setupRef} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '10px', width: '280px' }}>
          {items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              rowRef={el => { rowRefs.current[i] = el; }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Skipped stage ─────────────────────────────────────────────
  if (stage === 'skipped') {
    return (
      <div className="ob-page">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 8px', overflowY: 'auto' }}>
          <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--tempest-fg-default)' }}>
                Node.js not found
              </div>
              <div style={{ fontSize: '13px', color: 'var(--tempest-fg-muted)', lineHeight: 1.6 }}>
                You can still use Tempest, but these features won't work until Node.js is installed and in your PATH:
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {BLOCKED_FEATURES.map(f => (
                <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '12px 14px', borderRadius: '9px', border: '1px solid var(--tempest-border-default)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tempest-fg-default)' }}>{f.name}</span>
                  <span style={{ fontSize: '12px', color: 'var(--tempest-fg-muted)', lineHeight: 1.5 }}>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 36px', maxWidth: '480px', width: '100%', alignSelf: 'center' }}>
          <button className="ob-btn-skip" onClick={() => openUrl('https://nodejs.org').catch(() => {})}>
            Install Node.js ↗
          </button>
          <button className="ob-btn-nav-primary" onClick={onComplete}>
            Continue anyway <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  // ── Pass / Fail result ────────────────────────────────────────
  return (
    <div className="ob-page">
      <div ref={resultRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
        <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
          {stage === 'pass' ? (
            <>
              <svg className="ob-pass-icon" viewBox="0 0 56 56" fill="none" width={56} height={56}>
                <circle cx="28" cy="28" r="26" stroke="#22c55e" strokeWidth="2" />
                <path d="M18 29l7 7 13-13" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '52px', position: 'relative' }}>
                <p ref={versionRef} style={{ margin: 0, fontSize: '13px', color: 'var(--tempest-fg-muted)', position: 'absolute', width: '100%' }}>
                  {nodeVersion} detected
                </p>
                <div ref={readyRef} style={{ opacity: 0 }}>
                  <div style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--tempest-fg-default)' }}>
                    You're ready
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--tempest-fg-muted)' }}>
                    Tempest is fully set up and good to go.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <XCircle size={48} className="ob-fail-icon" style={{ color: '#ef4444' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--tempest-fg-default)' }}>
                  Node.js not found
                </div>
                <div style={{ fontSize: '13px', color: 'var(--tempest-fg-muted)', lineHeight: 1.6, maxWidth: '360px' }}>
                  Node.js is required for CLI agents, Atlas, and automations. Install it, then click Recheck.
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 36px', maxWidth: '480px', width: '100%', alignSelf: 'center' }}>
        {stage === 'fail'
          ? <button className="ob-btn-skip" onClick={() => setStage('skipped')}>Skip</button>
          : <div />
        }
        <div style={{ display: 'flex', gap: '10px' }}>
          {stage === 'fail' && (
            <>
              <button className="ob-btn-nav-secondary" onClick={() => openUrl('https://nodejs.org').catch(() => {})}>
                Install Node.js ↗
              </button>
              <button className="ob-btn-nav-secondary" onClick={() => { setStage('setup'); setRunKey(k => k + 1); }}>
                <RefreshCw size={14} /> Recheck
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
