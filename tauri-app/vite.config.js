import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { version: APP_VERSION } = JSON.parse(readFileSync(path.resolve(__dirname, '../shared/version.json'), 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },

  resolve: {
    alias: {
      // Single source of truth: the JSX file in the parent folder
      '@app': path.resolve(__dirname, '../task-orchestrator.jsx'),
      // Explicit package paths — needed because task-orchestrator.jsx lives
      // outside tauri-app/ and Vite cannot find its bare imports otherwise
      'react':        path.resolve(__dirname, 'node_modules/react'),
      'react-dom':    path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      'react/jsx-runtime':     path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    // Existing node-only tests (schema, ulid, transactions) specify
    // their own environment via comment or work in both environments.
  },

  // ── Tauri-specific settings ───────────────────────────────────────────────
  // Prevent Vite from obscuring Rust errors
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; adjust in tauri.conf.json if you change this
    port: 1420,
    strictPort: true,
    watch: {
      // Include the parent Task Orchestrator folder in HMR watch
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    outDir: 'dist',
    // Tauri supports es2021+ and the listed browsers
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
