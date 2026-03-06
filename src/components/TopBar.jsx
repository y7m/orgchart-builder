import React from 'react';
import { useOrgStore } from '../store/useOrgStore';
import { useThemeStore } from '../store/useThemeStore';

const TopBar = () => {
    const { resetToDefault, openModal } = useOrgStore();
    const { resetTheme } = useThemeStore();

    return (
        <div style={{
            position: 'absolute', top: '20px', left: '20px', zIndex: 50,
            display: 'flex', gap: '10px',
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

            <button onClick={() => openModal('import')} className="btn-secondary" style={btnStyle}>Import Data</button>

            <div style={{ width: '1px', backgroundColor: 'var(--card-border-color)', margin: '0 5px' }} />

            <button onClick={() => openModal('export')} className="btn-primary" style={btnStyle}>Export / Share</button>

            <div style={{ width: '1px', backgroundColor: '#e2e8f0', margin: '0 5px' }} />
            <button
                onClick={() => openModal('confirmReset')}
                className="btn-secondary"
                style={{ ...btnStyle, color: '#dc3545', borderColor: '#dc3545' }}
            >Reset Data</button>
        </div>
    );
};

const btnStyle = {
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
