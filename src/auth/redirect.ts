// MSAL v5 redirect bridge. Entra redirects here (VITE_ENTRA_REDIRECT_URI);
// this hands the auth response to the opener (popup) / parent (silent iframe)
// via BroadcastChannel, or returns to the app for redirect flows.
// Kept tiny: it does not load the app bundle.
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

broadcastResponseToMainFrame().catch((e: unknown) => {
  console.error('Sign-in response could not be processed', e);
  const el = document.getElementById('msg');
  if (el) el.textContent = 'Sign-in could not complete. Close this window and try again.';
});
