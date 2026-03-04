import React, { useState } from 'react';
import { useOrgStore } from '../store/useOrgStore';
import { SketchPicker } from 'react-color';

const ColorPickerPopover = ({ color, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '6px', background: 'var(--bg-color)', border: '1px solid var(--card-border-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: color }} />
                <span style={{ fontSize: '14px', fontFamily: 'monospace', color: 'var(--font-color)' }}>{color}</span>
            </div>
            {isOpen && (
                <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }} onClick={() => setIsOpen(false)} />
                    <div style={{ position: 'relative', zIndex: 10000 }}>
                        <SketchPicker color={color} onChange={c => onChange(c.hex)} disableAlpha />
                    </div>
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
    const [error, setError] = useState('');

    const managerRequired = employees.length > 0 && !(editingEmp && !editingEmp.managerId);

    // Auto-update division based on manager
    React.useEffect(() => {
        if (managerId && !editingEmp) {
            const manager = employees.find(e => e.id === managerId);
            if (manager && manager.divisionId) {
                setDivisionId(manager.divisionId);
            }
        }
    }, [managerId, employees, editingEmp]);

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
        if (!name) return setError('Name is required');

        const existingRoot = employees.find(e => !e.managerId);
        const isEditingRoot = editingEmp && !editingEmp.managerId;

        if (!managerId && existingRoot && !isEditingRoot) {
            return setError('Manager is required. Only one person can be at the top of the hierarchy.');
        }

        const payload = { name, title, managerId: managerId || null, divisionId, pic: picUrl, subtopics: selectedSubtopics };
        if (editingEmp) {
            updateEmployee(editingId, payload);
        } else {
            addEmployee(payload);
        }
        onClose();
    };

    return (
        <ModalBase title={editingEmp ? "Edit Employee" : "Add Employee"} onClose={onClose} onSave={handleSave} error={error}>
            <FormGroup label="Name">
                <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="Employee Name" />
            </FormGroup>

            <FormGroup label="Title">
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Role or Title" />
            </FormGroup>

            <FormGroup label="Profile Picture">
                <input type="file" accept="image/*" onChange={handleFileChange} />
            </FormGroup>

            <FormGroup label={`Manager ${managerRequired ? '*' : ''}`}>
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
    const { addDivision, updateDivision, deleteDivision, divisions, editingId } = useOrgStore();
    const editingDiv = editingId ? divisions.find(d => d.id === editingId) : null;

    const [name, setName] = useState(editingDiv?.name || '');
    const [color, setColor] = useState(editingDiv?.color || '#8b5cf6'); // Default purple
    const [error, setError] = useState('');

    const handleSave = () => {
        if (!name) return setError('Division name is required');

        if (editingDiv) {
            updateDivision(editingId, { name, color });
        } else {
            addDivision({ name, color });
        }
        onClose();
    };

    const handleDelete = () => {
        useOrgStore.getState().openModal('confirmDeleteDiv', editingId);
    };

    return (
        <ModalBase title={editingDiv ? "Edit Division" : "Add Division"} onClose={onClose} onSave={handleSave} onDelete={editingDiv ? handleDelete : null} error={error}>
            <FormGroup label="Division Name">
                <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="e.g. Division A" />
            </FormGroup>
            <FormGroup label="Border Theme Color">
                <ColorPickerPopover color={color} onChange={setColor} />
            </FormGroup>
        </ModalBase>
    );
};

export const VerticalModal = ({ onClose }) => {
    const { addVertical, updateVertical, deleteVertical, verticals, editingId } = useOrgStore();
    const editingVert = editingId ? verticals.find(v => v.id === editingId) : null;

    const [name, setName] = useState(editingVert?.name || '');
    const [color, setColor] = useState(editingVert?.color || '#10b981'); // Default green
    const [subtopics, setSubtopics] = useState(editingVert ? editingVert.subtopics.map(s => s.text).join(', ') : '');
    const [error, setError] = useState('');

    const handleSave = () => {
        if (!name) return setError('Vertical name is required');

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

    const handleDelete = () => {
        useOrgStore.getState().openModal('confirmDeleteVert', editingId);
    };

    return (
        <ModalBase title={editingVert ? "Edit Vertical" : "Add Vertical"} onClose={onClose} onSave={handleSave} onDelete={editingVert ? handleDelete : null} error={error}>
            <FormGroup label="Vertical Name">
                <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder="e.g. Placeholder Vertical" />
            </FormGroup>
            <FormGroup label="Pill / Marker Color">
                <ColorPickerPopover color={color} onChange={setColor} />
            </FormGroup>
            <FormGroup label="Subtopics (Comma Separated)">
                <input type="text" value={subtopics} onChange={e => setSubtopics(e.target.value)} placeholder="e.g. Topic A, Topic B, Topic C" />
            </FormGroup>
        </ModalBase>
    );
};

// ------------------------------------------------------------------
// Base Reusable Modal Layout
// ------------------------------------------------------------------

export const ModalBase = ({ title, onClose, onSave, onSaveText, onDelete, error, children }) => (
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
            <h2 style={{ marginTop: 0, fontSize: '20px', borderBottom: '1px solid var(--card-border-color)', paddingBottom: '10px' }}>{title}</h2>

            {error && <div style={{ padding: '10px', backgroundColor: 'rgba(220, 53, 69, 0.1)', color: '#dc3545', border: '1px solid #dc3545', borderRadius: '4px', fontSize: '12px', fontWeight: 600, marginBottom: '15px' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', margin: '20px 0' }}>
                {children}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                {onDelete && <button onClick={onDelete} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #dc3545', cursor: 'pointer', backgroundColor: 'var(--bg-color)', color: '#dc3545', marginRight: 'auto' }}>Delete</button>}
                <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--card-border-color)', cursor: 'pointer', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)' }}>Cancel</button>
                <button onClick={onSave} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>{onSaveText || 'Save'}</button>
            </div>
        </div>
    </div>
);

export const ConfirmModal = ({ title, message, onConfirm, onClose, isDestructive = false }) => (
    <ModalBase title={title} onClose={onClose} onSave={onConfirm} onSaveText="Confirm">
        <div style={{ fontSize: '14px', lineHeight: 1.5, color: isDestructive ? '#dc3545' : 'var(--font-color)' }}>
            {message}
        </div>
    </ModalBase>
);

export const PromptModal = ({ title, message, onConfirm, onClose, placeholder }) => {
    const [val, setVal] = useState('');
    const [error, setError] = useState('');

    const handleSave = () => {
        if (!val.trim()) return setError('Input cannot be empty');
        onConfirm(val.trim());
    };

    return (
        <ModalBase title={title} onClose={onClose} onSave={handleSave} error={error} onSaveText="Submit">
            {message && <p style={{ fontSize: '14px', marginTop: 0 }}>{message}</p>}
            <FormGroup label="">
                <input type="text" value={val} onChange={e => { setVal(e.target.value); setError(''); }} placeholder={placeholder} autoFocus />
            </FormGroup>
        </ModalBase>
    );
};

const FormGroup = ({ label, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {label && <label style={{ fontSize: '12px', fontWeight: 600 }}>{label}</label>}
        {React.cloneElement(children, {
            style: { ...children.props.style, width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: 'var(--bg-color)', color: 'var(--font-color)' }
        })}
    </div>
);
