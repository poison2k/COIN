import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// Proxy für die API (kein CORS nötig). Ziel per VITE_API_PROXY_TARGET überschreibbar.
const apiZiel = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5172'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Bibliotheken in eigene Chunks aufteilen (kein Bundle über 500 kB, bessere Cache-Nutzung).
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'ui', test: /node_modules[\\/](@base-ui|@floating-ui)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: apiZiel, changeOrigin: true },
    },
  },
})
