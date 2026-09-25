/** Entra / Graph configuration from Vite env. Missing client/tenant id => Entra mode disabled. */
export interface EntraConfig {
  clientId: string;
  tenantId: string;
  /** Absolute URL of the MSAL v5 redirect bridge page (redirect.html). */
  redirectUri: string;
  /** Where to land after sign-out. */
  postLogoutRedirectUri: string;
  authority: string;
  scopes: string[];
  graphBaseUrl: string;
  excludePatterns?: string;
  requireEmployeeIdOrTitle?: string;
}

export const GRAPH_SCOPES = ['User.Read', 'User.Read.All'];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Env = Record<string, string | boolean | undefined>;

const appBase = (): string => {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  return new URL(base, window.location.origin).href;
};

/**
 * Read config. Single-tenant only: the tenant id must be a GUID or a verified
 * domain, never "common"/"organizations"/"consumers".
 */
export const readEntraConfig = (env: Env = import.meta.env as Env): EntraConfig | null => {
  const clientId = String(env.VITE_ENTRA_CLIENT_ID ?? '').trim();
  const tenantId = String(env.VITE_ENTRA_TENANT_ID ?? '').trim();
  if (!clientId || !tenantId) return null;
  if (!GUID.test(clientId)) {
    console.warn('VITE_ENTRA_CLIENT_ID is not a GUID; Entra disabled.');
    return null;
  }
  if (['common', 'organizations', 'consumers'].includes(tenantId.toLowerCase())) {
    console.warn('VITE_ENTRA_TENANT_ID must be a specific tenant (single-tenant app); Entra disabled.');
    return null;
  }
  const base = appBase();
  const redirectUri = String(env.VITE_ENTRA_REDIRECT_URI ?? '').trim() || new URL('redirect.html', base).href;
  return {
    clientId,
    tenantId,
    redirectUri,
    postLogoutRedirectUri: base,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    scopes: GRAPH_SCOPES,
    graphBaseUrl: 'https://graph.microsoft.com/v1.0',
    excludePatterns: env.VITE_ENTRA_EXCLUDE_PATTERNS as string | undefined,
    requireEmployeeIdOrTitle: env.VITE_ENTRA_REQUIRE_EMPLOYEE_ID_OR_TITLE as string | undefined,
  };
};
