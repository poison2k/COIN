import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Proxy für die API (kein CORS nötig). Ziel per VITE_API_PROXY_TARGET überschreibbar.
const apiZiel = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5172'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiZiel, changeOrigin: true },
    },
  },
})
