import React, { useState } from 'react';
import { useOrgStore } from '../store/useOrgStore';
import { SketchPicker } from 'react-color';

const ColorPickerPopover = ({ color, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '6px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: color }} />
                <span style={{ fontSize: '14px', fontFamily: 'monospace', color: '#000' }}>{color}</span>
            </div>
            {isOpen && (
                <div style={{ position: 'absolute', zIndex: 9999, marginTop: '10px' }}>
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }} onClick={() => setIsOpen(false)} />
                    <SketchPicker color={color} onChange={c => onChange(c.hex)} disableAlpha />
                </div>
            )}
        </div>
    );
};

export const EmployeeModal = ({ onClose }) => {
    const { employees, divisions, verticals, addEmployee, updateEmployee, editingId } = useOrgStore();

    const editingEmp = editingId ? employees.find(e => e.id === editingId) : null;

    const [name, setName] = useState(editingEmp?.name || '');
    const [title, setTitle] = useState(editingEmp?.title || '');
    const [managerId, setManagerId] = useState(editingEmp?.managerId || '');
    const [divisionId, setDivisionId] = useState(editingEmp?.divisionId || '');
    const [picUrl, setPicUrl] = useState(editingEmp?.pic || '');
    const [selectedSubtopics, setSelectedSubtopics] = useState(editingEmp?.subtopics || []);

    // Handle file upload to base64
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPicUrl(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        if (!name) return alert('Name is required');

        const payload = { name, title, managerId: managerId || null, divisionId, pic: picUrl, subtopics: selectedSubtopics };
        if (editingEmp) {
            updateEmployee(editingId, payload);
        } else {
            addEmployee(payload);
        }
        onClose();
    };

    return (
        <ModalBase title={editingEmp ? "Edit Employee" : "Add Employee"} onClose={onClose} onSave={handleSave}>
            <FormGroup label="Name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" />
            </FormGroup>

            <FormGroup label="Title">
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Specialist" />
            </FormGroup>

            <FormGroup label="Profile Picture">
                <input type="file" accept="image/*" onChange={handleFileChange} />
            </FormGroup>

            <FormGroup label="Manager">
                <select value={managerId} onChange={e => setManagerId(e.target.value)}>
                    <option value="">-- No Manager (Root) --</option>
                    {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.title})</option>
                    ))}
                </select>
            </FormGroup>

            <FormGroup label="Division">
                <select value={divisionId} onChange={e => setDivisionId(e.target.value)}>
                    <option value="">-- None --</option>
                    {divisions.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </FormGroup>

            {/* Simplified subtopic selector for MVP */}
            <FormGroup label="Subtopics (Check all that apply)">
                <div style={{ height: '120px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px', backgroundColor: 'var(--bg-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {verticals.map(v => (
                        <div key={v.id}>
                            <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--main-color)', marginBottom: '5px' }}>{v.name}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                                {v.subtopics?.map(s => (
                                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            value={s.id}
                                            checked={selectedSubtopics.includes(s.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedSubtopics([...selectedSubtopics, s.id]);
                                                } else {
                                                    setSelectedSubtopics(selectedSubtopics.filter(id => id !== s.id));
                                                }
                                            }}
                                        />
                                        {s.text}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </FormGroup>
        </ModalBase>
    );
};


export const DivisionModal = ({ onClose }) => {
    const { addDivision, updateDivision, divisions, editingId } = useOrgStore();
    const editingDiv = editingId ? divisions.find(d => d.id === editingId) : null;

    const [name, setName] = useState(editingDiv?.name || '');
    const [color, setColor] = useState(editingDiv?.color || '#8b5cf6'); // Default purple

    const handleSave = () => {
        if (!name) return alert('Division name is required');

        if (editingDiv) {
            updateDivision(editingId, { name, color });
        } else {
            addDivision({ name, color });
        }
        onClose();
    };

    return (
        <ModalBase title={editingDiv ? "Edit Division" : "Add Division"} onClose={onClose} onSave={handleSave}>
            <FormGroup label="Division Name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales" />
            </FormGroup>
            <FormGroup label="Border Theme Color">
                <ColorPickerPopover color={color} onChange={setColor} />
            </FormGroup>
        </ModalBase>
    );
};

export const VerticalModal = ({ onClose }) => {
    const { addVertical, updateVertical, verticals, editingId } = useOrgStore();
    const editingVert = editingId ? verticals.find(v => v.id === editingId) : null;

    const [name, setName] = useState(editingVert?.name || '');
    const [color, setColor] = useState(editingVert?.color || '#10b981'); // Default green
    const [subtopics, setSubtopics] = useState(editingVert ? editingVert.subtopics.map(s => s.text).join(', ') : '');

    const handleSave = () => {
        if (!name) return alert('Vertical name is required');

        // Convert CSV to topic array
        const parsedSubtopics = subtopics.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .map(text => {
                // Try to preserve existing subtopic IDs if they match
                let existingId = 's_' + Math.random().toString(36).substr(2, 6);
                if (editingVert) {
                    const match = editingVert.subtopics.find(s => s.text.toLowerCase() === text.toLowerCase());
                    if (match) existingId = match.id;
                }
                return { id: existingId, text };
            });

        if (editingVert) {
            updateVertical(editingId, { name, color, subtopics: parsedSubtopics });
        } else {
            addVertical({ name, color, subtopics: parsedSubtopics });
        }
        onClose();
    };

    return (
        <ModalBase title={editingVert ? "Edit Vertical" : "Add Vertical"} onClose={onClose} onSave={handleSave}>
            <FormGroup label="Vertical Name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Onboarding" />
            </FormGroup>
            <FormGroup label="Pill / Marker Color">
                <ColorPickerPopover color={color} onChange={setColor} />
            </FormGroup>
            <FormGroup label="Subtopics (Comma Separated)">
                <input type="text" value={subtopics} onChange={e => setSubtopics(e.target.value)} placeholder="e.g. New Hires, M&A, Forms" />
            </FormGroup>
        </ModalBase>
    );
};

// ------------------------------------------------------------------
// Base Reusable Modal Layout
// ------------------------------------------------------------------

export const ModalBase = ({ title, onClose, onSave, children }) => (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)'
    }} onClick={onClose}>
        <div style={{
            backgroundColor: 'var(--bg-color-alt)', padding: '25px', width: '400px',
            borderRadius: '8px', border: `1px solid #e2e8f0`,
            boxShadow: `0 10px 25px rgba(0,0,0,0.1)`,
            color: 'var(--font-color)'
        }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, fontSize: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>{title}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', margin: '20px 0' }}>
                {children}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' }}>Cancel</button>
                <button onClick={onSave} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: 'var(--input-focus)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
            </div>
        </div>
    </div>
);

const FormGroup = ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}</label>
        {React.cloneElement(children, {
            style: { ...children.props.style, width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)' }
        })}
    </div>
);
