import React, { useState } from 'react';
import { ModalBase } from './Modals';
import { useOrgStore } from '../store/useOrgStore';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Maximum sane length for text fields to prevent malicious gigantic payloads
const MAX_LENGTH = 150;

const sanitizeString = (str) => {
    if (str === null || str === undefined) return '';
    const s = String(str).trim();
    // Strip basic HTML angle brackets
    return s.replace(/[<>]/g, '').substring(0, MAX_LENGTH);
};

// Maps varied user columns to our internal predictable schema
const normalizeRow = (row) => {
    const norm = { extId: '', name: '', title: '', manager: '', division: '', subtopics: '' };

    for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined) continue;
        const k = key.toLowerCase().replace(/[^a-z0-ind]/g, ''); // alphanumeric only
        const v = sanitizeString(value);

        if (k === 'id' || k === 'extid' || k.includes('employeeid')) norm.extId = v;
        else if (k === 'name' || k.includes('fullname')) norm.name = v;
        else if (k === 'title' || k === 'role' || k.includes('job')) norm.title = v;
        else if (k === 'manager' || k.includes('reportsto') || k.includes('managerid')) norm.manager = v;
        else if (k === 'division' || k === 'department' || k === 'team') norm.division = v;
        else if (k === 'subtopics' || k === 'topics' || k === 'skills') norm.subtopics = v;
    }
    return norm;
};

const ImportModal = ({ onClose }) => {
    const { massImportEmployees } = useOrgStore();
    const [step, setStep] = useState(1); // 1: Upload, 2: Preview
    const [parsedData, setParsedData] = useState([]);
    const [error, setError] = useState('');

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setError('');
        const filename = file.name.toLowerCase();

        try {
            if (filename.endsWith('.csv') || filename.endsWith('.tsv') || filename.endsWith('.txt')) {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        const normalized = results.data.map(normalizeRow).filter(r => r.name); // require name
                        setParsedData(normalized);
                        setStep(2);
                    },
                    error: (err) => setError('Failed to parse CSV: ' + err.message)
                });
            } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(firstSheet);
                const normalized = json.map(normalizeRow).filter(r => r.name);
                setParsedData(normalized);
                setStep(2);
            } else if (filename.endsWith('.json')) {
                const text = await file.text();
                const json = JSON.parse(text);
                const arr = Array.isArray(json) ? json : [json];
                const normalized = arr.map(normalizeRow).filter(r => r.name);
                setParsedData(normalized);
                setStep(2);
            } else {
                setError('Unsupported file format. Please upload CSV, TSV, XLSX, or JSON.');
            }
        } catch (err) {
            setError('Error reading file: ' + err.message);
        }
    };

    const handleCellChange = (rowIndex, field, value) => {
        const newData = [...parsedData];
        newData[rowIndex][field] = sanitizeString(value);
        setParsedData(newData);
    };

    const handleImport = () => {
        if (parsedData.length === 0) return setError('No valid data to import.');
        massImportEmployees(parsedData);
        onClose();
    };

    return (
        <ModalBase title="Mass Import Data" onClose={onClose} onSave={step === 2 ? handleImport : null} onSaveText="Import Data" error={error}>
            {step === 1 && (
                <div style={{ padding: '20px', border: '2px dashed var(--card-border-color)', borderRadius: '8px', textAlign: 'center', backgroundColor: 'var(--bg-color)' }}>
                    <p style={{ fontSize: '14px', marginBottom: '15px' }}>Upload a .CSV, .XLSX, or .JSON file containing employee records.</p>
                    <p style={{ fontSize: '12px', color: 'var(--font-color-sub)', marginBottom: '20px' }}>
                        Recognized columns: Name, Title, ID, Manager, Division, Subtopics.
                    </p>
                    <input
                        type="file"
                        accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
                        onChange={handleFileUpload}
                        style={{ fontSize: '14px', color: 'var(--font-color)' }}
                    />
                </div>
            )}

            {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--font-color-sub)', margin: 0 }}>Review and edit the parsed data securely before importing.</p>
                    <div style={{ overflowX: 'auto', maxHeight: '350px', border: '1px solid var(--card-border-color)', borderRadius: '4px' }}>
                        <table style={{ minWidth: '800px', width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                            <thead style={{ backgroundColor: 'var(--bg-color)', position: 'sticky', top: 0, zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                <tr>
                                    <th style={thStyle}>ID (Optional)</th>
                                    <th style={thStyle}>Name*</th>
                                    <th style={thStyle}>Title</th>
                                    <th style={thStyle}>Manager (Name/ID)</th>
                                    <th style={thStyle}>Division</th>
                                    <th style={thStyle}>Subtopics (CSV)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.map((row, i) => (
                                    <tr key={i} style={{ backgroundColor: 'var(--bg-color-alt)', borderBottom: '1px solid var(--card-border-color)' }}>
                                        <td style={tdStyle}><Input value={row.extId} onChange={e => handleCellChange(i, 'extId', e.target.value)} /></td>
                                        <td style={tdStyle}><Input value={row.name} onChange={e => handleCellChange(i, 'name', e.target.value)} style={{ fontWeight: row.name ? 'normal' : 'bold', border: row.name ? 'none' : '1px solid #dc3545' }} /></td>
                                        <td style={tdStyle}><Input value={row.title} onChange={e => handleCellChange(i, 'title', e.target.value)} /></td>
                                        <td style={tdStyle}><Input value={row.manager} onChange={e => handleCellChange(i, 'manager', e.target.value)} /></td>
                                        <td style={tdStyle}><Input value={row.division} onChange={e => handleCellChange(i, 'division', e.target.value)} /></td>
                                        <td style={tdStyle}><Input value={row.subtopics} onChange={e => handleCellChange(i, 'subtopics', e.target.value)} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {parsedData.length === 0 && <p style={{ fontSize: '12px', color: '#dc3545' }}>No valid rows with "Name" column found.</p>}
                </div>
            )}
        </ModalBase>
    );
};

const thStyle = { padding: '8px', borderBottom: '1px solid var(--card-border-color)', color: 'var(--font-color-sub)' };
const tdStyle = { padding: '0', borderRight: '1px solid var(--card-border-color)' };
const Input = ({ value, onChange, style }) => (
    <input
        type="text"
        value={value}
        onChange={onChange}
        style={{ width: '100%', padding: '8px', border: 'none', backgroundColor: 'transparent', color: 'var(--font-color)', fontSize: '12px', outline: 'none', ...style }}
    />
);

export default ImportModal;
