import type React from 'react';
import { useOrgStore } from '../store/useOrgStore';
import { pickAndOpenProject } from '../datasource/controller';
import SourceBanner from './SourceBanner';
import SourceIndicator from './SourceIndicator';

const TopBar = () => {
    const { openModal } = useOrgStore();

    return (
        <div className="hide-on-export" style={{
            position: 'absolute', top: '20px', left: '20px', right: '340px', zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px',
            pointerEvents: 'none',
        }}>
        <div style={{
            display: 'flex', gap: '10px', flexWrap: 'wrap', pointerEvents: 'auto',
            backgroundColor: 'var(--bg-color-alt)', padding: '10px',
            borderRadius: '8px',
            border: `1px solid #e2e8f0`,
            boxShadow: `0 4px 6px rgba(0,0,0,0.05)`
        }}>

            <button
                onClick={() => openModal('employee')}
                className="btn-primary"
                style={btnStyle}
            >+ Employee</button>

            <div style={{ width: '1px', backgroundColor: 'var(--card-border-color)', margin: '0 5px' }} />

            <button onClick={() => openModal('import')} className="btn-secondary" style={btnStyle}>Import CSV</button>
            <button onClick={() => void pickAndOpenProject()} className="btn-secondary" style={btnStyle}>Open project</button>
            <button onClick={() => openModal('saveProject')} className="btn-secondary" style={btnStyle}>Save project</button>

            <div style={{ width: '1px', backgroundColor: 'var(--card-border-color)', margin: '0 5px' }} />

            <button onClick={() => openModal('export')} className="btn-primary" style={btnStyle}>Export</button>

            <div style={{ width: '1px', backgroundColor: '#e2e8f0', margin: '0 5px' }} />
            <button
                onClick={() => openModal('confirmReset')}
                className="btn-secondary"
                style={{ ...btnStyle, color: '#dc3545', borderColor: '#dc3545' }}
            >Reset Data</button>
        </div>
        <SourceIndicator />
        <SourceBanner />
        </div>
    );
};

const btnStyle: React.CSSProperties = {
    padding: '8px 12px',
    cursor: 'pointer',
    backgroundColor: 'var(--bg-color)',
    color: 'var(--font-color)',
    border: `1px solid #e2e8f0`,
    borderRadius: '6px',
    boxShadow: `0 1px 2px rgba(0,0,0,0.05)`,
    fontWeight: 600,
    fontSize: '12px',
    fontFamily: 'var(--font-family)',
};

export default TopBar;
