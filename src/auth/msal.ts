import {
  BrowserCacheLocation,
  createStandardPublicClientApplication,
  LogLevel,
  type Configuration,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import type { EntraConfig } from './config';

export const msalConfiguration = (cfg: EntraConfig): Configuration => ({
  auth: {
    clientId: cfg.clientId,
    authority: cfg.authority, // single tenant
    redirectUri: cfg.redirectUri, // MSAL v5 bridge page (public/redirect.html)
    postLogoutRedirectUri: cfg.postLogoutRedirectUri,
  },
  cache: {
    // Tokens only, cleared when the tab closes. People data is never cached by MSAL.
    cacheLocation: BrowserCacheLocation.SessionStorage,
  },
  system: {
    loggerOptions: {
      logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
      piiLoggingEnabled: false,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
        else if (level === LogLevel.Warning) console.warn(message);
      },
    },
  },
});

/**
 * Create and initialize the MSAL client.
 *
 * TODO(teams): when running as a Teams tab, use Nested App Authentication:
 *   if (await isTeamsHost()) {            // @microsoft/teams-js: app.initialize() + app.getContext()
 *     return createNestablePublicClientApplication(msalConfiguration(cfg));
 *   }
 * (NAA needs a "brk-multihub://<domain>" SPA redirect URI on the app registration.)
 */
export const createMsalInstance = async (cfg: EntraConfig): Promise<IPublicClientApplication> =>
  createStandardPublicClientApplication(msalConfiguration(cfg));
