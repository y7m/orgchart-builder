/** Where people data came from. */
export type SourceId = 'entra' | 'csv' | 'file' | 'demo';

/**
 * A person. Held in memory only (never in browser storage); saved only to an
 * explicit project file.
 */
export interface Employee {
  id: string;
  extId?: string;
  name: string;
  title: string;
  managerId: string | null;
  divisionId: string | null;
  /** User-supplied picture (data URL). */
  pic?: string;
  subtopics: string[];
  email?: string;
  location?: string;
  team?: string;
  source?: SourceId;
  /** Entra object id. For Entra-loaded people this equals `id`. */
  entraId?: string;
  department?: string;
  officeLocation?: string;
  employeeId?: string;
  employeeType?: string;
  /**
   * Blob URL of a fetched photo. Memory only, never serialized. Prefer
   * `usePhoto(id)` from src/datasource/photos.ts.
   */
  photoUrl?: string;
}

export interface Division {
  id: string;
  name: string;
  color: string;
}

export interface Subtopic {
  id: string;
  text: string;
}

export interface Vertical {
  id: string;
  name: string;
  color: string;
  subtopics: Subtopic[];
}

export interface OrgData {
  employees: Employee[];
  divisions: Division[];
  verticals: Vertical[];
}

export type LineType = 'curve' | 'elbow' | 'straight';

export interface Theme {
  id?: string;
  name: string;
  cardRadius: string;
  cardBorderWidth: string;
  cardBorderColor: string;
  cardShadowX: string;
  cardShadowY: string;
  cardShadowBlur: string;
  cardShadowSpread: string;
  cardShadowColor: string;
  btnRadius: string;
  btnBorderWidth: string;
  btnBorderColor: string;
  btnShadowX: string;
  btnShadowY: string;
  btnShadowBlur: string;
  btnShadowSpread: string;
  btnShadowColor: string;
  bgColor: string;
  bgColorAlt: string;
  mainColor: string;
  inputFocus: string;
  fontColor: string;
  fontColorSub: string;
  fontFamily: string;
  lineType: LineType;
  lineColor: string;
  picRadius: string;
  picBorderWidth: string;
  picBorderColor: string;
  cardBgColor: string;
  nameFontSize: string;
  titleFontSize: string;
  divFontSize: string;
  subFontSize: string;
}
