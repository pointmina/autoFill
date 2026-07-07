import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// popup/options/background는 vite.config.ts(@crxjs/vite-plugin, ESM)가 담당한다.
// content script는 chrome.scripting.executeScript({ files: [...] })로 직접 주입되므로
// import/export가 없는 단일 IIFE 파일이어야 해서 별도 빌드로 분리했다.
export default defineConfig({
  build: {
    outDir: 'dist/content',
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./extension/content/index.ts', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'autofill.js',
      },
    },
  },
})
