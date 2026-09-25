# Dynamic OrgChart Builder

A purely client-side, performant React application for building, customizing, and exporting dynamic organizational charts. Built with Vite, React, Zustand, and D3.js.

## Features

- **Card-Level Drag & Drop**: Easily reorganize your hierarchy by dragging and dropping employee cards onto their new managers. Built-in cycle detection prevents infinite loops.
- **Sub-tree Collapsing**: Click the `+/-` toggle on any manager card to prune their descendents from the view, allowing for cleaner high-level chart views.
- **Live Theme Editor**: Customize the aesthetics of the chart in real-time. Change border radiuses, shadows, padding, colors, and the curvature of the connecting lines (Bezier curve, Orthogonal elbow, or straight lines).
- **Custom Presets**: Save your styling combinations as Custom Themes in local storage to instantly switch between aesthetics without losing your design.
- **High-Resolution Export**: Generate full-quality, unclipped PNGs of your orgchart with a single click, automatically adjusting bounding boxes to capture out-of-bounds nodes.
- **Dynamic Interactive Canvas**: Middle-mouse panning to navigate the hierarchy smoothly.

## Stack

- **React:** Component architecture for robust UI elements and forms.
- **Vite:** Blazing fast build tool and dev server.
- **D3.js (d3-hierarchy):** Utilized exclusively for calculating mathematical tree layouts and coordinate positions to separate math from rendering.
- **Zustand:** Lightweight, un-opinionated state management with `localstorage` persistence for data and styling.
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

Layout: `src/domain/` is pure TS logic (tree, cycles, import); `src/store/` holds the Zustand stores; `src/components/` holds React UI. Tests are in `tests/`.

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

## Data storage

Everything stays in the browser's `localStorage` (`orgchart-data-storage` and `orgchart-theme-storage`). Nothing is sent to a server. Clearing site data or using "Reset Data" wipes it. Photos are stored inline as base64, so large photos fill the storage quota quickly.

## Known limitations

- Every card is rendered, so charts with thousands of people are slow.
- The `localStorage` quota is about 5 MB.
- PNG export is the only export.
- The `xlsx@0.18` dependency has open advisories, and a replacement is pending. The CI audit step is non-blocking until then.
- Pan with the middle mouse button or wheel only. There is no touch support.
