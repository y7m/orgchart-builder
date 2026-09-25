import { useState } from 'react';
import type React from 'react';
import { ModalBase } from './Modals';
import { useOrgStore } from '../store/useOrgStore';
import { importCsv } from '../datasource/controller';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
    clampField, hasImportWarnings, IMPORT_FIELDS, normalizeRows,
    type HeaderMapping, type ImportField, type ImportMode, type ImportReport, type ImportRow,
} from '../domain/import';

const COLUMNS: { field: ImportField; label: string }[] = [
    { field: 'extId', label: 'ID' },
    { field: 'name', label: 'Name*' },
    { field: 'title', label: 'Title' },
    { field: 'manager', label: 'Manager (ID/Name)' },
    { field: 'division', label: 'Division' },
    { field: 'subtopics', label: 'Subtopics' },
    { field: 'email', label: 'Email' },
    { field: 'location', label: 'Location' },
    { field: 'team', label: 'Team' },
];

const PREVIEW_LIMIT = 200;

const ImportModal = ({ onClose }: { onClose: () => void }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Preview, 3: Report
    const [parsedData, setParsedData] = useState<ImportRow[]>([]);
    const [mapping, setMapping] = useState<HeaderMapping>({});
    // Default: merge when earlier imports exist (upsert by ID), else replace the sample data
    const [mode, setMode] = useState<ImportMode>(() =>
        useOrgStore.getState().employees.some(e => e.extId) ? 'merge' : 'replace');
    const [report, setReport] = useState<ImportReport | null>(null);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('');

    const accept = (raw: Record<string, unknown>[]) => {
        const { rows, mapping } = normalizeRows(raw);
        setParsedData(rows);
        setMapping(mapping);
        setStep(2);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError('');
        setFileName(file.name);
        const filename = file.name.toLowerCase();

        try {
            if (filename.endsWith('.csv') || filename.endsWith('.tsv') || filename.endsWith('.txt')) {
                Papa.parse<Record<string, unknown>>(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => accept(results.data),
                    error: (err) => setError('Failed to parse CSV: ' + err.message),
                });
            } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                accept(XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet));
            } else if (filename.endsWith('.json')) {
                const json: unknown = JSON.parse(await file.text());
                const arr = (Array.isArray(json) ? json : [json]).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
                accept(arr);
            } else {
                setError('Unsupported file format. Please upload CSV, TSV, XLSX, or JSON.');
            }
        } catch (err) {
            setError('Error reading file: ' + (err instanceof Error ? err.message : String(err)));
        }
    };

    const handleCellChange = (rowIndex: number, field: ImportField, value: string) => {
        setParsedData(prev => prev.map((r, i) => (i === rowIndex ? { ...r, [field]: clampField(field, value) } : r)));
    };

    const handleImport = async () => {
        const rows = parsedData.filter(r => r.name.trim());
        if (rows.length === 0) return setError('No valid data to import.');
        // A field counts as present if the file had the column or the user typed into it
        const effective: HeaderMapping = { ...mapping };
        for (const f of IMPORT_FIELDS) if (!effective[f] && rows.some(r => r[f])) effective[f] = f;
        const r = await importCsv(rows, mode, effective, fileName || undefined);
        if (!r) return setError('Import failed.');
        if (hasImportWarnings(r)) {
            setReport(r);
            setStep(3);
        } else {
            onClose();
        }
    };

    const recognized = IMPORT_FIELDS.filter(f => mapping[f] !== undefined);

    if (step === 3 && report) {
        return (
            <ModalBase title="Import finished with warnings" onClose={onClose} onSave={onClose} onSaveText="Done" width={520}>
                <ImportReportView report={report} />
            </ModalBase>
        );
    }

    return (
        <ModalBase title="Mass Import Data" onClose={onClose} onSave={step === 2 ? () => void handleImport() : null} onSaveText="Import Data" error={error} width={step === 2 ? 900 : 400}>
            {step === 1 && (
                <div style={{ padding: '20px', border: '2px dashed var(--card-border-color)', borderRadius: '8px', textAlign: 'center', backgroundColor: 'var(--bg-color)' }}>
                    <p style={{ fontSize: '14px', marginBottom: '15px' }}>Upload a .CSV, .XLSX, or .JSON file containing employee records.</p>
                    <p style={{ fontSize: '12px', color: 'var(--font-color-sub)', marginBottom: '10px' }}>
                        The file is read in your browser only and not kept after you close the tab. Use "Save project" to keep a copy.
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--font-color-sub)', marginBottom: '20px' }}>
                        Recognized columns: ID, Name, Title, Manager (ID or name), Division, Subtopics, Email, Location, Team.
                    </p>
                    <input
                        type="file"
                        aria-label="Import file"
                        accept=".csv,.tsv,.txt,.xlsx,.xls,.json"
                        onChange={handleFileUpload}
                        style={{ fontSize: '14px', color: 'var(--font-color)' }}
                    />
                </div>
            )}

            {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--font-color-sub)' }}>
                        {parsedData.length} rows. Columns used: {recognized.map(f => `${mapping[f]} → ${f}`).join(', ') || 'none'}.
                    </div>
                    <fieldset style={{ border: '1px solid var(--card-border-color)', borderRadius: 4, fontSize: 12, display: 'flex', gap: 16 }}>
                        <legend>Mode</legend>
                        <label><input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge (update by ID, add new)</label>
                        <label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace all employees</label>
                    </fieldset>
                    <div style={{ overflowX: 'auto', maxHeight: '350px', border: '1px solid var(--card-border-color)', borderRadius: '4px' }}>
                        <table style={{ minWidth: '900px', width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                            <thead style={{ backgroundColor: 'var(--bg-color)', position: 'sticky', top: 0, zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                <tr>
                                    {COLUMNS.map(c => <th key={c.field} style={thStyle}>{c.label}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.slice(0, PREVIEW_LIMIT).map((row, i) => (
                                    <tr key={i} style={{ backgroundColor: 'var(--bg-color-alt)', borderBottom: '1px solid var(--card-border-color)' }}>
                                        {COLUMNS.map(c => (
                                            <td key={c.field} style={tdStyle}>
                                                <Input value={row[c.field]} onChange={e => handleCellChange(i, c.field, e.target.value)} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {parsedData.length > PREVIEW_LIMIT && <p style={{ fontSize: '12px', color: 'var(--font-color-sub)', margin: 0 }}>Showing first {PREVIEW_LIMIT} of {parsedData.length} rows.</p>}
                    {parsedData.length === 0 && <p style={{ fontSize: '12px', color: '#dc3545' }}>No valid rows with a "Name" column found.</p>}
                </div>
            )}
        </ModalBase>
    );
};

const SAMPLE = 5;
const list = (items: string[]) => items.slice(0, SAMPLE).join('; ') + (items.length > SAMPLE ? `; +${items.length - SAMPLE} more` : '');

export const ImportReportView = ({ report: r }: { report: ImportReport }) => (
    <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }} data-testid="import-report">
        <li>{r.created} added, {r.updated} updated, {r.resolvedManagers} managers resolved.</li>
        {r.unresolvedManagers.length > 0 && <li>{r.unresolvedManagers.length} manager reference(s) not found; shown at top level: {list(r.unresolvedManagers.map(u => `${u.name} → ${u.manager}`))}</li>}
        {r.ambiguousManagers.length > 0 && <li>{r.ambiguousManagers.length} manager name(s) match several people; left unassigned: {list(r.ambiguousManagers.map(u => `${u.name} → ${u.manager}`))}</li>}
        {r.selfManaged > 0 && <li>{r.selfManaged} row(s) listed themselves as manager; treated as top level.</li>}
        {r.cyclesBroken > 0 && <li>{r.cyclesBroken} reporting cycle(s) broken.</li>}
        {r.duplicateNames.length > 0 && <li>Duplicate names: {list(r.duplicateNames)}</li>}
        {r.duplicateExtIds.length > 0 && <li>Duplicate IDs (later rows overwrote earlier): {list(r.duplicateExtIds)}</li>}
        {r.roots > 1 && <li>{r.roots} top-level people; shown under a shared "Organization" node.</li>}
    </ul>
);

const thStyle: React.CSSProperties = { padding: '8px', borderBottom: '1px solid var(--card-border-color)', color: 'var(--font-color-sub)' };
const tdStyle: React.CSSProperties = { padding: '0', borderRight: '1px solid var(--card-border-color)' };
const Input = ({ value, onChange }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <input
        type="text"
        value={value}
        onChange={onChange}
        style={{ width: '100%', padding: '8px', border: 'none', backgroundColor: 'transparent', color: 'var(--font-color)', fontSize: '12px', outline: 'none' }}
    />
);

export default ImportModal;
