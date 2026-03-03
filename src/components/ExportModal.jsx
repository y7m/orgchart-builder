import React, { useState } from 'react';

const ExportModal = ({ onClose }) => {
    const [embedCode, setEmbedCode] = useState('');

    const handleExportSolid = () => {
        if (window.exportChart) window.exportChart(false);
        onClose();
    };

    const handleExportClear = () => {
        if (window.exportChart) window.exportChart(true);
        onClose();
    };

    const handleGenerateEmbed = () => {
        const dataStr = localStorage.getItem('orgchart-data-storage') || '';
        const themeStr = localStorage.getItem('orgchart-theme-storage') || '';

        let payload = null;
        try {
            const parsedData = JSON.parse(dataStr);
            const parsedTheme = JSON.parse(themeStr);
            payload = JSON.stringify({ data: parsedData, theme: parsedTheme });
        } catch (e) {
            console.error("Failed to parse local storage data", e);
            payload = JSON.stringify({});
        }

        const encoded = btoa(encodeURIComponent(payload));
        const url = `https://y7m.github.io/orgchart-builder/?data=${encoded}`;

        const iframeCode = `<iframe src="${url}" width="100%" height="600px" style="border: 1px solid #e2e8f0; border-radius: 8px;"></iframe>`;
        setEmbedCode(iframeCode);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--bg-color-alt)', padding: '25px', width: '400px',
                borderRadius: '8px', border: `1px solid var(--card-border-color)`,
                boxShadow: `0 10px 25px rgba(0,0,0,0.1)`,
                color: 'var(--font-color)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border-color)', paddingBottom: '10px', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Export / Share</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--font-color-sub)' }}>&times;</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <button onClick={handleExportSolid} className="btn-primary" style={btnStylePrimary}>
                        Export PNG (Solid Background)
                    </button>
                    <button onClick={handleExportClear} className="btn-secondary" style={btnStyleSecondary}>
                        Export PNG (Transparent)
                    </button>
                    <button onClick={handleGenerateEmbed} className="btn-secondary" style={btnStyleSecondary}>
                        Generate Embed Snippet (iframe)
                    </button>

                    {embedCode && (
                        <div style={{ marginTop: '10px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '5px' }}>Embed Code:</label>
                            <textarea
                                readOnly
                                value={embedCode}
                                style={{ width: '100%', height: '80px', padding: '8px', fontSize: '11px', fontFamily: 'monospace', borderRadius: '4px', border: '1px solid var(--card-border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)', resize: 'none' }}
                                onClick={e => e.target.select()}
                            />
                            <p style={{ fontSize: '11px', color: 'var(--font-color-sub)', marginTop: '4px' }}>Click inside the box to select all, then copy.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const btnStylePrimary = {
    padding: '10px 16px',
    borderRadius: '6px',
    border: 'none',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center'
};

const btnStyleSecondary = {
    padding: '10px 16px',
    borderRadius: '6px',
    border: '1px solid var(--card-border-color)',
    backgroundColor: 'var(--bg-color)',
    color: 'var(--font-color)',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center'
};

export default ExportModal;
