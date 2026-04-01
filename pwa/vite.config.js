import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Remap .js imports to .ts files when the .js doesn't exist (TypeScript project convention)
function tsExtensionPlugin() {
  return {
    name: 'ts-extension-remap',
    async resolveId(source, importer, options) {
      if (!source.endsWith('.js') || !importer) return null
      const resolution = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (resolution) return resolution
      const tsSource = source.replace(/\.js$/, '.ts')
      return this.resolve(tsSource, importer, { ...options, skipSelf: true })
    },
  }
}

export default defineConfig({
  plugins: [tsExtensionPlugin(), react()],
  resolve: {
    alias: [
      // Shared modules (monorepo root)
      { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
      // Main app component
      { find: '@app', replacement: path.resolve(__dirname, '..') },
      // Resolve relative imports from task-orchestrator.jsx (which lives at /workspace/)
      { find: /^\.\/tauri-app\/src\/(.*)/, replacement: path.resolve(__dirname, '../tauri-app/src/$1') },
      // Remap Tauri-specific imports to browser stubs
      { find: '@tauri-apps/api/core', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
      { find: '@tauri-apps/plugin-opener', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
      { find: '@tauri-apps/plugin-dialog', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
      { find: '@tauri-apps/plugin-sql', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
      { find: '@tauri-apps/api/path', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
      { find: '@tauri-apps/plugin-fs', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
      { find: '@tauri-apps/plugin-http', replacement: path.resolve(__dirname, 'src/stubs/tauri.js') },
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  server: {
    port: 3000,
  },
  // Resolve node_modules from tauri-app too (shared code imports lucide-react etc.)
  optimizeDeps: {
    include: ['lucide-react', 'react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})
