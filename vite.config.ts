import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

const BUILD_ID = Date.now().toString(36)

/** Emits /version.json so open tabs (the test iPad) can notice a new build and reload themselves. */
function buildVersion(): Plugin {
  return {
    name: 'build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the repo at /ThaiWellAI/ — set by the deploy workflow; local builds stay at /
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), buildVersion()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
