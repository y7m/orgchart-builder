import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import type { EntraConfig } from './config';
import { createMsalInstance } from './msal';
import { classifyError, SourceLoadError } from '../datasource/errors';

/** Sign-in asks only for User.Read so users can sign in while admin consent for User.Read.All is pending. */
const LOGIN_SCOPES = ['User.Read'];

let pca: IPublicClientApplication | null = null;
let config: EntraConfig | null = null;

export const getMsal = (): IPublicClientApplication | null => pca;
export const getEntraConfig = (): EntraConfig | null => config;

/** Create (or adopt) the MSAL instance, finish any redirect sign-in, pick the account. */
export const initAuth = async (cfg: EntraConfig, instance?: IPublicClientApplication): Promise<IPublicClientApplication> => {
  config = cfg;
  pca = instance ?? (await createMsalInstance(cfg));
  try {
    const r = await pca.handleRedirectPromise();
    if (r?.account) pca.setActiveAccount(r.account);
  } catch (e) {
    console.warn('Redirect sign-in failed', classifyError(e).message);
  }
  if (!pca.getActiveAccount()) {
    const all = pca.getAllAccounts();
    if (all.length) pca.setActiveAccount(all[0]);
  }
  return pca;
};

export const resetAuth = () => {
  pca = null;
  config = null;
};

export const getAccount = (): AccountInfo | null => pca?.getActiveAccount() ?? null;

const isPopupBlocked = (e: unknown): boolean => {
  const code = (e as { errorCode?: string } | null)?.errorCode;
  return code === 'popup_window_error' || code === 'empty_window_error';
};

/** Interactive sign-in. Popup first (keeps in-memory data); redirect if popups are blocked. */
export const signIn = async (): Promise<AccountInfo | null> => {
  if (!pca) throw new SourceLoadError('signin', 'Entra is not configured.');
  try {
    const r = await pca.loginPopup({ scopes: LOGIN_SCOPES, prompt: 'select_account' });
    pca.setActiveAccount(r.account);
    return r.account;
  } catch (e) {
    if (isPopupBlocked(e)) {
      await pca.loginRedirect({ scopes: LOGIN_SCOPES, prompt: 'select_account' });
      return null;
    }
    throw e;
  }
};

export const signOut = async (): Promise<void> => {
  if (!pca) return;
  const account = pca.getActiveAccount();
  // Clears MSAL's sessionStorage token cache for this app.
  await pca.clearCache({ account: account ?? undefined });
  pca.setActiveAccount(null);
};

/**
 * Access token for Graph. Silent first; on InteractionRequiredAuthError a popup
 * is used only when `interactive` (i.e. from a user click), else the error is
 * surfaced (consent/signin) so boot never pops windows.
 */
export const getGraphToken = async (interactive: boolean): Promise<string> => {
  if (!pca || !config) throw new SourceLoadError('signin', 'Entra is not configured.');
  const account = pca.getActiveAccount();
  if (!account) {
    if (!interactive) throw new SourceLoadError('signin', 'Not signed in.');
    const a = await signIn();
    if (!a) throw new SourceLoadError('signin', 'Redirecting to sign in…');
  }
  const request = { scopes: config.scopes, account: pca.getActiveAccount()! };
  try {
    return (await pca.acquireTokenSilent(request)).accessToken;
  } catch (e) {
    const silent = classifyError(e);
    if (!(e instanceof InteractionRequiredAuthError) || !interactive) {
      throw new SourceLoadError(e instanceof InteractionRequiredAuthError && silent.kind !== 'consent' ? 'signin' : silent.kind, silent.message, { cause: e });
    }
    try {
      return (await pca.acquireTokenPopup(request)).accessToken;
    } catch (e2) {
      if (isPopupBlocked(e2)) {
        await pca.acquireTokenRedirect(request);
        throw new SourceLoadError('signin', 'Redirecting to sign in…');
      }
      const c = classifyError(e2);
      // Closing the "Need admin approval" popup reports user_cancelled; keep the consent reason.
      const kind = silent.kind === 'consent' && c.kind === 'signin' ? 'consent' : c.kind;
      throw new SourceLoadError(kind, c.message, { cause: e2 });
    }
  }
};
