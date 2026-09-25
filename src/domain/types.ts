export interface Employee {
  id: string;
  extId?: string;
  name: string;
  title: string;
  managerId: string | null;
  divisionId: string | null;
  pic?: string;
  subtopics: string[];
  email?: string;
  location?: string;
  team?: string;
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
