import React from 'react';
import { useOrgStore } from '../store/useOrgStore';

const TopBar = () => {
    const { resetToDefault, openModal } = useOrgStore();

    const handleExport = (transparent) => {
        // This will trigger the html-to-image library we installed earlier
        // Attached to a global export function we will write in App.js or similar
        if (window.exportChart) window.exportChart(transparent);
    };

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
                onClick={() => openModal('division')}
                style={btnStyle}
            >+ Division</button>

            <button
                onClick={() => openModal('vertical')}
                style={btnStyle}
            >+ Vertical</button>

            <button
                onClick={() => openModal('employee')}
                style={{ ...btnStyle, backgroundColor: 'var(--input-focus)', color: '#fff' }}
            >+ Employee</button>

            <div style={{ width: '1px', backgroundColor: 'var(--card-border-color)', margin: '0 5px' }} />

            <button onClick={() => handleExport(false)} style={btnStyle}>Export (Solid)</button>
            <button onClick={() => handleExport(true)} style={btnStyle}>Export (Clear)</button>
            <div style={{ width: '1px', backgroundColor: '#e2e8f0', margin: '0 5px' }} />
            <button
                onClick={() => {
                    if (window.confirm('Reset all custom data?')) resetToDefault();
                }}
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
