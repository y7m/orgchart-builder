import Papa from 'papaparse';

export const parseCsvText = (text: string): Record<string, unknown>[] => {
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  return res.data;
};
