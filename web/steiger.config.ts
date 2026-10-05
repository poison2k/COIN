import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

// Steiger (ADR-0008): empfohlene FSD-Regeln. Einzige genehmigte Ausnahme: insignificant-slice
// (Strukturempfehlung, keine Abhängigkeitsregel; Slices haben anfangs bewusst nur einen Verwender).
export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
])
