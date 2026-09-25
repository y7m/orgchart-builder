import { ModalBase } from './Modals';
import { saveProject } from '../datasource/controller';
import { useOrgStore } from '../store/useOrgStore';

export const PROJECT_PII_WARNING =
  'This file contains personal data (names, titles, emails, reporting lines). Store it only in approved locations (e.g. your OneDrive/SharePoint), and delete copies you no longer need.';

export const SaveProjectModal = ({ onClose }: { onClose: () => void }) => {
  const count = useOrgStore((s) => s.employees.length);
  return (
    <ModalBase title="Save project" onClose={onClose} onSave={() => { saveProject(); onClose(); }} onSaveText="Download .orgchart.json">
      <p style={{ margin: 0, fontSize: 14 }}>
        Saves {count} people, divisions, verticals, topic assignments and local edits to a file you can open later.
        People data is not kept in the browser, so this file is the only way to keep a CSV import or offline copy.
      </p>
      <div role="note" style={{ padding: 10, border: '1px solid #f59e0b', background: '#fff7e6', color: '#7c4a03', borderRadius: 6, fontSize: 13 }}>
        <strong>Personal data.</strong> {PROJECT_PII_WARNING}
      </div>
    </ModalBase>
  );
};
