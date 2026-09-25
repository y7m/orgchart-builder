import type React from 'react';
import { useSourceStore } from '../store/useSourceStore';
import { sourceLabel } from '../datasource/status';
import { refresh, signInAndLoad, signOutEntra } from '../datasource/controller';

const SourceIndicator = () => {
  const s = useSourceStore();
  const busy = s.status === 'loading';
  const title = [
    s.activeSource === 'entra' && s.excludedCount ? `${s.excludedCount} directory accounts excluded (service/room/no employee ID or title)` : '',
    s.account ? `Signed in as ${s.account.username}` : '',
  ].filter(Boolean).join('\n') || undefined;

  return (
    <div className="hide-on-export" style={wrap}>
      <span data-testid="source-indicator" title={title} style={{ fontWeight: 600 }}>
        {sourceLabel(s)}
        {s.activeSource === 'entra' && s.status === 'offline' && <span style={{ color: '#b45309' }}> · offline</span>}
      </span>
      {!s.entraConfigured && <span style={muted} title="Set VITE_ENTRA_CLIENT_ID and VITE_ENTRA_TENANT_ID to enable">Entra not configured</span>}
      {s.entraConfigured && (
        <>
          {s.account ? (
            <button style={btn} disabled={busy} onClick={() => void refresh()} aria-label="Refresh from Entra">
              {busy ? 'Loading…' : s.activeSource === 'entra' ? 'Refresh' : 'Load from Entra'}
            </button>
          ) : (
            <button style={btn} disabled={busy} onClick={() => void signInAndLoad()}>Sign in</button>
          )}
          {s.account && <button style={{ ...btn, fontWeight: 400 }} onClick={() => void signOutEntra()} title={s.account.username}>Sign out</button>}
        </>
      )}
    </div>
  );
};

const wrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--font-color)',
  backgroundColor: 'var(--bg-color-alt)', padding: '6px 10px', borderRadius: 8,
  border: '1px solid #e2e8f0', pointerEvents: 'auto', fontFamily: 'var(--font-family)',
};
const muted: React.CSSProperties = { color: 'var(--font-color-sub)' };
const btn: React.CSSProperties = {
  padding: '3px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: '1px solid #e2e8f0', borderRadius: 6, background: 'var(--bg-color)', color: 'var(--font-color)',
};

export default SourceIndicator;
