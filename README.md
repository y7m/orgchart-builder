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

## Development Setup

1. Clone the repository and navigate to the `orgchart-builder` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
