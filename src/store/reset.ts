import { ORG_STORAGE_KEY, useOrgStore } from './useOrgStore';
import { THEME_STORAGE_KEY, useThemeStore } from './useThemeStore';

/** Wipe employees/divisions/verticals and theme back to defaults, incl. localStorage. */
export const resetAllData = () => {
  try {
    useOrgStore.getState().resetToDefault();
    useThemeStore.getState().resetTheme();
  } finally {
    localStorage.removeItem(ORG_STORAGE_KEY);
    localStorage.removeItem(THEME_STORAGE_KEY);
  }
};

/** Wipe org data only (keeps themes). */
export const resetOrgData = () => {
  useOrgStore.getState().resetToDefault();
};
