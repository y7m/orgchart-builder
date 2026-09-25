# Dynamic OrgChart Builder

A purely client-side, performant React application for building, customizing, and exporting dynamic organizational charts. Built with Vite, React, Zustand, and D3.js.

## Features

- **Card-Level Drag & Drop**: Easily reorganize your hierarchy by dragging and dropping employee cards onto their new managers. Built-in cycle detection prevents infinite loops.
- **Sub-tree Collapsing**: Click the `+/-` toggle on any manager card to prune their descendents from the view, allowing for cleaner high-level chart views.
- **Live Theme Editor**: Customize the aesthetics of the chart in real-time. Change border radiuses, shadows, padding, colors, and the curvature of the connecting lines (Bezier curve, Orthogonal elbow, or straight lines).
- **Entra ID / CSV / project files**: Load people live from Microsoft Entra ID, import a spreadsheet, or open a saved project. People data stays in memory only.
- **Custom Presets**: Save your styling combinations as Custom Themes in local storage to instantly switch between aesthetics without losing your design.
- **High-Resolution Export**: Generate full-quality, unclipped PNGs of your orgchart with a single click, automatically adjusting bounding boxes to capture out-of-bounds nodes.
- **Dynamic Interactive Canvas**: Middle-mouse panning to navigate the hierarchy smoothly.

## Stack

- **React:** Component architecture for robust UI elements and forms.
- **Vite:** Blazing fast build tool and dev server.
- **D3.js (d3-hierarchy):** Utilized exclusively for calculating mathematical tree layouts and coordinate positions to separate math from rendering.
- **Zustand:** State management. Only themes and org metadata are persisted.
- **MSAL (`@azure/msal-browser` v5, `@azure/msal-react`):** Entra ID sign-in. **zod** validates project files.
- **React-Color:** Provides precision Hex/RGBA inputs for theme configurations.

## Development

Node 22+.

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # vitest (watch); `npm test -- --run` for CI
npm run lint
npm run typecheck
npm run build        # -> dist/
npm run build:pages  # GitHub Pages build (base /orgchart-builder/)
```

Layout: `src/domain/` is pure TS logic (tree, cycles, import, Entra mapping, project file); `src/datasource/` holds the data-source adapters (Demo/CSV/File/Graph), the Graph client, photos and the load controller; `src/auth/` holds the MSAL config; `src/store/` holds the Zustand stores; `src/components/` holds React UI. Tests are in `tests/`.

## Import format

CSV, TSV, XLSX (first sheet) or JSON array. One row per person. Headers are case-, space- and punctuation-insensitive and must match an alias exactly:

| Field | Header aliases (first match wins) | Notes |
|---|---|---|
| ID | `id`, `extId`, `employeeId`, `employeeNumber` | Optional. Used for upsert and manager lookup. Case-insensitive. |
| Name | `name`, `fullName`, `displayName`, `employeeName` | Required. Max 200 chars. |
| Title | `title`, `jobTitle`, `role`, `position` | Max 200 chars. |
| Manager | `manager`, `managerId`, `reportsTo`, `supervisorId`, `managerEmployeeId` | Manager's ID (preferred) or name. |
| Division | `division`, `department`, `dept` | Created if missing. |
| Subtopics | `subtopics`, `topics`, `skills`, `tags` | Comma-separated. Unknown ones go to an "Imported Tags" vertical. Max 1000 chars. |
| Email / Location / Team | `email`, `mail` / `location`, `officeLocation` / `team`, `teamName` | Optional. |

Other columns are ignored. Sample files are in [`samples/`](samples/) (200, 2000 and 5000 people).

Modes: **Merge** updates rows whose ID already exists and adds the rest. **Replace** removes all employees first; divisions, verticals and themes are kept.

A manager is matched by ID first, then by name. A name shared by several people is not used. Unresolved managers, self-references and broken cycles make that person top-level, and a summary lists them after import. When there are several top-level people, the chart groups them under an "Organization" placeholder.

## Data sources

- **Entra ID (live)**: people, titles, managers, departments and photos from Microsoft Graph. Needs configuration (below).
- **CSV / XLSX / JSON import**: always available. See [Import format](#import-format).
- **Project file** (`.orgchart.json`): "Save project" / "Open project". Holds people, divisions, verticals, topic assignments, local edits and collapsed nodes. Files are validated on open; invalid ones are rejected with a message and current data is kept.
- **Sample data**: shown until one of the above is loaded.

The top bar shows the active source (`Source: Entra · loaded 14:05`, `Source: CSV (people.csv)`, ...) and a Refresh / Sign in button when Entra is configured.

Local changes to Entra people (title, manager, division, topics, ...) are kept as overlays and re-applied on refresh. They are lost on tab close unless you save a project file. Topic assignments from a CSV import carry over to Entra by employee ID or email.

## Privacy and storage

- People data (names, emails, titles, reporting lines, photos) is **held in memory only**. It is never written to `localStorage`, `sessionStorage`, IndexedDB or the Cache API. Closing the tab discards it.
- `localStorage` holds only non-personal settings: themes (`orgchart-theme-storage`) and division/vertical/topic names (`orgchart-data-storage`, schema v2).
- Upgrading from a version that stored people in `localStorage` (schema v0/v1) loads them once for that session and immediately rewrites storage without them.
- MSAL keeps tokens and the signed-in account in `sessionStorage` (`cacheLocation: sessionStorage`). This is cleared when the tab closes, and "Sign out" clears it.
- Photos are fetched as blobs into memory (`blob:` URLs), are revoked on reload/sign-out/page hide, and are never included in project files.
- A project file **contains personal data**. The save dialog warns about this. Store it only in approved locations.
- The app has no backend. Browser requests go only to `login.microsoftonline.com` and `graph.microsoft.com`.

## Entra ID setup

1. **App registration** (Entra admin center → App registrations → New):
   - Supported account types: **Single tenant**.
   - Platform: **Single-page application**, with the redirect URIs `http://localhost:5173/redirect.html` and `https://<prod-host>/redirect.html` (add `<base>` if the app is served from a sub-path). Leave implicit grant off.
2. **API permissions** (Microsoft Graph, *delegated*): `User.Read`, `User.Read.All`. Then **Grant admin consent**. Until consent is granted, users can sign in (only `User.Read` is requested at sign-in), but loading shows "Admin consent pending for Entra access — using CSV mode." CSV and project files still work.
3. **Restrict access** (Enterprise applications → the app → Properties): set *Assignment required* = **Yes** and assign the HR security group under *Users and groups*.
4. Optional **app roles** `Viewer` and `Editor` (App registration → App roles, allowed member type Users/Groups). They can be assigned now, but the app does **not** enforce them yet.
5. Copy `.env.example` to `.env.local` and fill in `VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_TENANT_ID`, plus `VITE_ENTRA_REDIRECT_URI` for non-default hosts. Rebuild. The env vars are read at build time, so set them in the CI/hosting build settings (e.g. Azure Static Web Apps).

If the client or tenant ID is missing, Entra mode is off, the top bar shows "Entra not configured", and everything else works.

The Graph query is: `GET /v1.0/users?$top=999&$select=id,displayName,jobTitle,department,officeLocation,mail,userPrincipalName,employeeId,employeeType,accountEnabled,userType,employeeOrgData&$filter=accountEnabled eq true and userType eq 'Member'&$expand=manager($select=id)`. Pages are followed via `@odata.nextLink`. 429/503/504 responses honor `Retry-After` and otherwise use exponential backoff, and each request times out after 30 s. Division is `employeeOrgData.division`, or `department` when that is empty. Accounts without an `employeeId` and without a `jobTitle`, and accounts matching `svc-` / `room-` / `admin-` / `noreply`, are excluded (configurable in `.env.example`). The excluded count appears in the source tooltip. Photos load lazily through `$batch` (20 per request, at most 4 in parallel). A missing photo shows initials.

Teams tab (later): `src/auth/msal.ts` `createMsalInstance()` is the switch point for Nested App Auth (`createNestablePublicClientApplication` + `@microsoft/teams-js`).

### Offline behavior

At boot the app renders immediately with the sample data. If Entra is configured and an account is cached, it then loads silently. It never opens a popup at boot.

- Network error, timeout, 5xx or throttling shows the banner "Entra connection offline — people data may not be up to date." with **Retry / Import CSV / Open project file**.
- Missing consent (AADSTS65001 etc., or Graph 403) shows "Admin consent pending for Entra access — using CSV mode."
- When no one is signed in, the banner shows a **Sign in** button (popup, with a redirect fallback if popups are blocked).

The banner is dismissible and uses `role="alert"` (warnings) or `role="status"` (info).

### CSP

No inline scripts: the MSAL v5 redirect bridge is a separate bundled page (`redirect.html` → `src/auth/redirect.ts`). Suggested policy:

```
default-src 'self'; script-src 'self'; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com;
frame-src https://login.microsoftonline.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'
```

(`style-src 'unsafe-inline'` is needed for React inline styles.)

## Known limitations

- Every card is rendered, so charts with thousands of people are slow.
- Everything shown is lost on tab close unless it is saved as a project file (see Privacy).
- PNG export is the only export.
- The `xlsx@0.18` dependency has open advisories, and a replacement is pending. The CI audit step is non-blocking until then.
- Pan with the middle mouse button or wheel only. There is no touch support.
