import React, { useState } from 'react';
import { useThemeStore } from '../store/useThemeStore';
import { useOrgStore } from '../store/useOrgStore';
import { SketchPicker } from 'react-color';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';

const ColorPickerPopover = ({ color, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '6px', background: 'var(--bg-color)', border: '1px solid var(--card-border-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: color, border: '1px solid rgba(0,0,0,0.1)' }} />
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--font-color)' }}>{color}</span>
            </div>
            {isOpen && (
                <div style={{ position: 'absolute', zIndex: 9999, right: 0, marginTop: '10px' }}>
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }} onClick={() => setIsOpen(false)} />
                    <SketchPicker color={color} onChange={c => onChange(c.hex)} disableAlpha />
                </div>
            )}
        </div>
    );
};

const NumberInput = ({ label, name, value, onChange, min = -20, max = 20 }) => {
    // Strip "px" for viewing, but keep it for saving
    const numValue = parseInt(value, 10) || 0;

    const handleChange = (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 0;
        if (val < min) val = min;
        if (val > max) val = max;
        onChange({ target: { name, value: `${val}px` } });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '12px', color: 'var(--font-color)' }}>{label}: {value}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                    type="number"
                    value={numValue}
                    onChange={handleChange}
                    style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--font-color-sub)' }}>px</span>
            </div>
        </div>
    );
};

const Accordion = ({ title, defaultOpen = false, children }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: '1px solid #e2e8f0' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 600, fontSize: '14px', color: 'var(--font-color)' }}
            >
                {title}
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            {isOpen && (
                <div style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

const EditorSidebar = () => {
    const { theme, updateTheme, applyPreset, customThemes, saveCustomTheme, deleteCustomTheme } = useThemeStore();
    const { verticals, divisions, openModal } = useOrgStore();

    const handleInputChange = (e) => {
        let { name, value } = e.target;
        const pxFields = ['cardRadius', 'cardBorderWidth', 'cardShadowX', 'cardShadowY', 'cardShadowBlur', 'cardShadowSpread',
            'btnRadius', 'btnBorderWidth', 'btnShadowX', 'btnShadowY', 'btnShadowBlur', 'btnShadowSpread', 'picBorderWidth',
            'nameFontSize', 'titleFontSize', 'divFontSize', 'subFontSize'];

        if (pxFields.includes(name)) {
            value = `${value}px`;
        }

        updateTheme({ [name]: value });
    };

    const handleSaveTheme = () => {
        const name = prompt("Enter a name for this Custom Theme Preset:");
        if (name) {
            saveCustomTheme(name);
            alert(`Theme '${name}' saved successfully!`);
        }
    }

    return (
        <div
            className="hide-on-export"
            style={{
                width: '320px',
                height: '100vh',
                backgroundColor: 'var(--bg-color-alt)',
                borderLeft: `1px solid #e2e8f0`,
                boxShadow: `-2px 0 10px rgba(0,0,0,0.05)`,
                display: 'flex',
                flexDirection: 'column',
                zIndex: 100,
            }}
        >
            <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', backgroundColor: 'var(--bg-color-alt)', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--main-color)' }}>OrgChart Builder</h2>
                <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'var(--font-color-sub)' }}>Configure Data & Style</p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <Accordion title="Style Presets" defaultOpen={true}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => applyPreset('modern')}
                                style={{
                                    flex: 1, padding: '8px', cursor: 'pointer',
                                    backgroundColor: theme.name === 'Modern Soft' ? 'var(--input-focus)' : 'var(--bg-color)',
                                    color: theme.name === 'Modern Soft' ? '#fff' : 'var(--font-color)',
                                    border: '1px solid var(--card-border-color)', borderRadius: '4px',
                                    fontWeight: 600, fontSize: '12px'
                                }}
                            > Modern </button>
                            <button
                                onClick={() => applyPreset('brutalist')}
                                style={{
                                    flex: 1, padding: '8px', cursor: 'pointer',
                                    backgroundColor: theme.name === 'Neo Brutalist' ? 'var(--input-focus)' : 'var(--bg-color)',
                                    color: theme.name === 'Neo Brutalist' ? '#fff' : 'var(--font-color)',
                                    border: '3px solid #000', borderRadius: '0px', boxShadow: '2px 2px 0px #000',
                                    fontWeight: 800, fontSize: '12px', fontFamily: "'Space Mono', monospace"
                                }}
                            > Brutalist </button>
                        </div>

                        <div style={{ height: '1px', backgroundColor: 'var(--card-border-color)', margin: '5px 0' }} />
                        <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--font-color-sub)' }}>Custom Presets</h4>

                        {customThemes.length === 0 && <div style={{ fontSize: '12px', color: 'var(--font-color-sub)', fontStyle: 'italic' }}>No custom presets saved.</div>}
                        {customThemes.map(t => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                    onClick={() => applyPreset(t.id)}
                                    style={{
                                        flex: 1, padding: '8px', cursor: 'pointer', textAlign: 'left',
                                        backgroundColor: theme.id === t.id ? 'var(--input-focus)' : 'var(--bg-color)',
                                        color: theme.id === t.id ? '#fff' : 'var(--font-color)',
                                        border: '1px solid var(--card-border-color)', borderRadius: '4px 0 0 4px',
                                        fontWeight: 600, fontSize: '12px'
                                    }}
                                >
                                    {t.name}
                                </button>
                                <button
                                    onClick={() => deleteCustomTheme(t.id)}
                                    style={{ padding: '8px', cursor: 'pointer', backgroundColor: 'var(--bg-color)', border: '1px solid var(--card-border-color)', borderLeft: 'none', borderRadius: '0 4px 4px 0', color: '#dc3545' }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}

                        <button
                            onClick={handleSaveTheme}
                            className="btn-secondary"
                            style={{ padding: '8px', cursor: 'pointer', backgroundColor: 'var(--bg-color)', border: '1px dashed var(--font-color-sub)', borderRadius: '4px', color: 'var(--font-color)', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-family)' }}>
                            + Save Current Theme
                        </button>
                    </div>
                </Accordion>

                <Accordion title="Manage Data">
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--font-color-sub)' }}>Divisions</h4>
                            <button onClick={() => openModal('division')} className="btn-secondary" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--card-border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)', cursor: 'pointer', fontFamily: 'var(--font-family)' }}>+ Add</button>
                        </div>
                        {divisions.map(d => (
                            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', backgroundColor: 'var(--bg-color)', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--font-color)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: d.color }} />
                                    {d.name}
                                </div>
                                <button onClick={() => openModal('division', d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--font-color-sub)' }}><Pencil size={14} /></button>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--font-color-sub)' }}>Verticals</h4>
                            <button onClick={() => openModal('vertical')} className="btn-secondary" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--card-border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)', cursor: 'pointer', fontFamily: 'var(--font-family)' }}>+ Add</button>
                        </div>
                        {verticals.map(v => (
                            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', backgroundColor: 'var(--bg-color)', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--font-color)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: v.color }} />
                                    {v.name}
                                </div>
                                <button onClick={() => openModal('vertical', v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--font-color-sub)' }}><Pencil size={14} /></button>
                            </div>
                        ))}
                    </div>
                </Accordion>

                <Accordion title="Environment Canvas">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '5px', color: 'var(--font-color)' }}>Line Type</label>
                            <select
                                name="lineType"
                                value={theme.lineType}
                                onChange={handleInputChange}
                                style={{
                                    width: '100%', padding: '8px',
                                    border: `1px solid var(--card-border-color)`,
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--bg-color)', color: 'var(--font-color)'
                                }}
                            >
                                <option value="curve">Smooth Curves (Bezier)</option>
                                <option value="elbow">Step/Elbow (Orthogonal)</option>
                                <option value="straight">Direct (Straight Lines)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--font-color)' }}>Canvas Background</label>
                            <ColorPickerPopover color={theme.bgColor} onChange={(hex) => updateTheme({ bgColor: hex })} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--font-color)' }}>Accent / Focus</label>
                            <ColorPickerPopover color={theme.inputFocus} onChange={(hex) => updateTheme({ inputFocus: hex })} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--font-color)' }}>Font Primary</label>
                            <ColorPickerPopover color={theme.fontColor} onChange={(hex) => updateTheme({ fontColor: hex })} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--font-color)' }}>Line Color</label>
                            <ColorPickerPopover color={theme.lineColor || theme.mainColor || '#000'} onChange={(hex) => updateTheme({ lineColor: hex })} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '5px', color: 'var(--font-color)' }}>Font Family</label>
                            <select
                                name="fontFamily"
                                value={theme.fontFamily}
                                onChange={handleInputChange}
                                style={{
                                    width: '100%', padding: '8px',
                                    border: `1px solid var(--card-border-color)`,
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--bg-color)', color: 'var(--font-color)'
                                }}
                            >
                                <option value="'Inter', sans-serif">Inter</option>
                                <option value="'Roboto', sans-serif">Roboto</option>
                                <option value="'Space Mono', monospace">Space Mono</option>
                                <option value="'Playfair Display', serif">Playfair Display</option>
                            </select>
                        </div>
                    </div>
                </Accordion>

                <Accordion title="Card Aesthetics">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <NumberInput label="Border Radius" name="cardRadius" value={theme.cardRadius} onChange={handleInputChange} min={0} max={20} />
                        <NumberInput label="Border Width" name="cardBorderWidth" value={theme.cardBorderWidth} onChange={handleInputChange} min={0} max={20} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', color: 'var(--font-color)' }}>Border Color</label>
                            <ColorPickerPopover color={theme.cardBorderColor.startsWith('#') ? theme.cardBorderColor : '#000000'} onChange={(hex) => updateTheme({ cardBorderColor: hex })} />
                        </div>

                        <NumberInput label="Shadow X Offset" name="cardShadowX" value={theme.cardShadowX} onChange={handleInputChange} min={-20} max={20} />
                        <NumberInput label="Shadow Y Offset" name="cardShadowY" value={theme.cardShadowY} onChange={handleInputChange} min={-20} max={20} />
                        <NumberInput label="Shadow Blur" name="cardShadowBlur" value={theme.cardShadowBlur} onChange={handleInputChange} min={0} max={20} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--font-color)' }}>Card Background</label>
                            <ColorPickerPopover color={theme.cardBgColor || theme.bgColorAlt || '#ffffff'} onChange={(hex) => updateTheme({ cardBgColor: hex })} />
                        </div>
                        <NumberInput label="Name Font Size" name="nameFontSize" value={theme.nameFontSize || '14px'} onChange={handleInputChange} min={8} max={36} />
                        <NumberInput label="Title Font Size" name="titleFontSize" value={theme.titleFontSize || '11px'} onChange={handleInputChange} min={8} max={24} />
                        <NumberInput label="Division Font Size" name="divFontSize" value={theme.divFontSize || '10px'} onChange={handleInputChange} min={8} max={20} />
                        <NumberInput label="Subtopic Font Size" name="subFontSize" value={theme.subFontSize || '11px'} onChange={handleInputChange} min={8} max={20} />
                    </div>
                </Accordion>

                <Accordion title="Portrait Aesthetics">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <NumberInput label="Picture Radius" name="picRadius" value={theme.picRadius || '50%'} onChange={handleInputChange} min={0} max={100} />
                        <NumberInput label="Picture Border Width" name="picBorderWidth" value={theme.picBorderWidth || '2px'} onChange={handleInputChange} min={0} max={20} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '12px', color: 'var(--font-color)' }}>Border Color</label>
                            <ColorPickerPopover color={theme.picBorderColor || '#e2e8f0'} onChange={(hex) => updateTheme({ picBorderColor: hex })} />
                        </div>
                    </div>
                </Accordion>
                <div style={{ height: '30px' }} />
            </div>
        </div>
    );
};

export default EditorSidebar;
