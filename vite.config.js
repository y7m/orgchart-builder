import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GH Pages build: `npm run build:pages` (sets VITE_BASE=/orgchart-builder/)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
})
