import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Übernimmt Plugins und den Alias `@/*` aus vite.config.ts (AK-12), damit vite.config.ts unverändert bleibt.
// Playwright-UI-Tests (ui-tests/) laufen nicht unter Vitest (AK-23).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, 'ui-tests/**'],
      restoreMocks: true,
      // design-fundament (ADR-0037 Punkt 2/3): Kontrast- und Gestaltungsregel-Test lesen index.css per `?raw`.
      // Ohne Freigabe liefert Vitest CSS als leeren String.
      css: { include: [/styles[\\/]index\.css/] },
    },
  }),
)
