import type { CSSProperties, ReactElement } from "react";

const s = (style?: CSSProperties): CSSProperties => ({ flexShrink: 0, ...style });

export const Icon = {
  search: (): ReactElement => (
    <svg viewBox="0 0 24 24" className="search-icon" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={s()}>
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  caret: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  ),
  bolt: (): ReactElement => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" /></svg>
  ),
  more: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
  ),
  extLink: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
  ),
  copy: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
  ),
  close: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  check: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ),
  issueOpen: (): ReactElement => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="8" cy="8" r="3.5" /><circle cx="8" cy="8" r="6.75" /></svg>
  ),
  issueClosed: (): ReactElement => (
    <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="4" /><path fill="none" stroke="currentColor" strokeWidth={1.25} d="M2 8a6 6 0 1 0 12 0A6 6 0 0 0 2 8Z" /></svg>
  ),
  prOpen: (): ReactElement => (
    <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" /><path stroke="currentColor" strokeWidth={1.25} fill="none" d="M5 5.5v5M11 6.5V11M8 3h1a2 2 0 0 1 2 2v1.5" /></svg>
  ),
  prMerged: (): ReactElement => (
    <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="10" r="1.5" /><path fill="none" stroke="currentColor" strokeWidth={1.25} d="M5 5.5v5M11 8V5.5A2.5 2.5 0 0 0 8.5 3H8" /></svg>
  ),
  prClosed: (): ReactElement => (
    <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" /><path fill="none" stroke="currentColor" strokeWidth={1.25} d="M5 5.5v5M11 6.5V11" /><path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M9.3 2.3l2.4 2.4m0-2.4-2.4 2.4" /></svg>
  ),
  prDraft: (): ReactElement => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="5" cy="4" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" /><path d="M5 5.5v5M11 6.5V11" /></svg>
  ),
  sBacklog: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="1.6 1.6"><circle cx="7" cy="7" r="5.5" /></svg>
  ),
  sTodo: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="7" cy="7" r="5.5" /></svg>
  ),
  sInprog: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="7" cy="7" r="5.5" /><path d="M7 7 L7 2 A5 5 0 0 1 12 7 Z" fill="currentColor" stroke="none" /></svg>
  ),
  sReview: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="7" cy="7" r="5.5" /><path d="M7 7 L7 2 A5 5 0 1 1 3.6 10.6 Z" fill="currentColor" stroke="none" /></svg>
  ),
  sDone: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="5.5" /><path d="M4.5 7l2 2 3.2-3.6" fill="none" stroke="#0a0a0a" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  sCancel: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="5.5" /><path d="M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8" fill="none" stroke="#0a0a0a" strokeWidth={1.6} strokeLinecap="round" /></svg>
  ),
  pUrgent: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="4" width="12" height="6" rx="1" /><rect x="6.25" y="5.5" width="1.5" height="2" fill="#0a0a0a" /><rect x="6.25" y="8" width="1.5" height="1" fill="#0a0a0a" /></svg>
  ),
  pHigh: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="8" width="2" height="4" /><rect x="6" y="5" width="2" height="7" /><rect x="10" y="2" width="2" height="10" /></svg>
  ),
  pMed: (): ReactElement => (
    <svg viewBox="0 0 14 14"><rect x="2" y="8" width="2" height="4" fill="currentColor" /><rect x="6" y="5" width="2" height="7" fill="currentColor" /><rect x="10" y="2" width="2" height="10" fill="currentColor" opacity=".25" /></svg>
  ),
  pLow: (): ReactElement => (
    <svg viewBox="0 0 14 14"><rect x="2" y="8" width="2" height="4" fill="currentColor" /><rect x="6" y="5" width="2" height="7" fill="currentColor" opacity=".25" /><rect x="10" y="2" width="2" height="10" fill="currentColor" opacity=".25" /></svg>
  ),
  pNone: (): ReactElement => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.25}><path d="M3 7h8" strokeLinecap="round" /></svg>
  ),
  checkX: (): ReactElement => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  checkOk: (): ReactElement => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ),
  clock: (): ReactElement => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  cycle: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /></svg>
  ),
  project: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  ),
  branch: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>
  ),
  ghMark: (): ReactElement => (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
  ),
  linearMark: (): ReactElement => (
    <svg viewBox="0 0 100 100" width="12" height="12" aria-hidden><path fill="currentColor" d="M1.22 61.16a49.86 49.86 0 0 0 37.62 37.62L1.22 61.16Zm-1.2-9.7L48.53 100a49.7 49.7 0 0 0 9.11-.83L.85 42.35c-.6 3-.83 6-.83 9.11ZM4.19 33.32 66.68 95.8a50.1 50.1 0 0 0 13.36-6.61L10.8 19.96a50.1 50.1 0 0 0-6.61 13.36Zm11.9-19.13L85.8 83.9a50.35 50.35 0 0 0 8.16-8.16L24.24 6.03a50.35 50.35 0 0 0-8.15 8.16ZM50 0a50 50 0 1 0 50 50A50 50 0 0 0 50 0Z" /></svg>
  ),
  refresh: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
  ),
  settings: (): ReactElement => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
  ),
  tabUnified: (): ReactElement => (
    <svg viewBox="0 0 16 16" className="tab-glyph" aria-hidden><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth={1.25} /><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>
  ),
};

export function priGlyph(id: string): ReactElement {
  return ({ urgent: Icon.pUrgent(), high: Icon.pHigh(), med: Icon.pMed(), low: Icon.pLow() } as Record<string, ReactElement>)[id] ?? Icon.pNone();
}
export function statusGlyph(id: string): ReactElement {
  return ({ backlog: Icon.sBacklog(), todo: Icon.sTodo(), inprog: Icon.sInprog(), review: Icon.sReview(), done: Icon.sDone(), cancel: Icon.sCancel() } as Record<string, ReactElement>)[id] ?? Icon.sTodo();
}
