import type React from 'react';
import { useSourceStore } from '../store/useSourceStore';
import { bannerModel, type BannerModel } from '../datasource/status';
import { useOrgStore } from '../store/useOrgStore';
import { pickAndOpenProject, refresh, signInAndLoad } from '../datasource/controller';

const TONES: Record<BannerModel['tone'], React.CSSProperties> = {
  warn: { background: '#fff7e6', borderColor: '#f59e0b', color: '#7c4a03' },
  error: { background: '#fdecee', borderColor: '#dc3545', color: '#7f1d1d' },
  info: { background: '#eef4ff', borderColor: '#3b82f6', color: '#1e3a8a' },
};

const SourceBanner = () => {
  const s = useSourceStore();
  const openModal = useOrgStore((st) => st.openModal);
  const model = bannerModel(s);
  const dismiss = () => useSourceStore.setState({ bannerDismissed: true });
  const dismissNotice = () => useSourceStore.setState({ notice: null });

  return (
    <>
      {s.notice && (
        <div role={s.notice.kind === 'error' ? 'alert' : 'status'} className="hide-on-export" style={{ ...box, ...TONES[s.notice.kind === 'error' ? 'error' : 'info'] }}>
          <span style={{ flex: 1 }}>{s.notice.text}</span>
          <button onClick={dismissNotice} aria-label="Dismiss message" style={closeBtn}>×</button>
        </div>
      )}
      {model && !s.bannerDismissed && (
        <div
          role={model.tone === 'info' ? 'status' : 'alert'}
          aria-live={model.tone === 'info' ? 'polite' : 'assertive'}
          data-testid="source-banner"
          className="hide-on-export"
          style={{ ...box, ...TONES[model.tone] }}
        >
          <span style={{ flex: 1 }} title={model.detail}>{model.text}</span>
          {model.primary === 'retry' && <button onClick={() => void refresh()} style={actionBtn}>Retry</button>}
          {model.primary === 'signin' && <button onClick={() => void signInAndLoad()} style={actionBtn}>Sign in</button>}
          {model.primary && (
            <>
              <button onClick={() => openModal('import')} style={actionBtn}>Import CSV</button>
              <button onClick={() => void pickAndOpenProject()} style={actionBtn}>Open project file</button>
            </>
          )}
          {s.status !== 'loading' && <button onClick={dismiss} aria-label="Dismiss" style={closeBtn}>×</button>}
        </div>
      )}
    </>
  );
};

const box: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  padding: '8px 12px', border: '1px solid', borderRadius: 8, fontSize: 13, fontWeight: 500,
  maxWidth: 760, boxShadow: '0 2px 6px rgba(0,0,0,0.06)', pointerEvents: 'auto',
};
const actionBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: '1px solid currentColor', borderRadius: 6, background: 'rgba(255,255,255,0.7)', color: 'inherit',
};
const closeBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'inherit', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 4px',
};

export default SourceBanner;
