import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './extension/manifest.json'

export default defineConfig({
  root: 'extension',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [react(), crx({ manifest })],
})
