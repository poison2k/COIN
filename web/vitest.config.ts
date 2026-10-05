import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Eigene Testkonfiguration, damit vite.config.ts (Produktivkonfiguration) unverändert bleibt.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
