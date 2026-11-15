import { describe, expect, it } from 'vitest'

// Feature formulare-detailseiten, AK-36 (ADR-0039 bis ADR-0041): keine neue Laufzeit- oder Entwicklungsabhängigkeit,
// insbesondere keine Formular-, Tabellen- oder Validierungsbibliothek. Stand der Abhängigkeiten vor dem Feature.

const roh = import.meta.glob<string>('/package.json', { query: '?raw', import: 'default', eager: true })[
  '/package.json'
]
const paket = JSON.parse(roh) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
const laufzeit = Object.keys(paket.dependencies ?? {}).sort()
const entwicklung = Object.keys(paket.devDependencies ?? {}).sort()

const LAUFZEIT_VORHER = [
  '@base-ui/react',
  '@fontsource-variable/geist',
  '@tailwindcss/vite',
  '@tanstack/react-router',
  'class-variance-authority',
  'clsx',
  'date-fns',
  'framer-motion',
  'lucide-react',
  'oidc-client-ts',
  'react',
  'react-day-picker',
  'react-dom',
  'react-markdown',
  'react-oidc-context',
  'remark-breaks',
  'tailwind-merge',
  'tailwindcss',
  'tw-animate-css',
]

const ENTWICKLUNG_VORHER = [
  '@axe-core/playwright',
  '@eslint/js',
  '@feature-sliced/steiger-plugin',
  '@playwright/test',
  '@testing-library/dom',
  '@testing-library/jest-dom',
  '@testing-library/react',
  '@testing-library/user-event',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'eslint',
  'eslint-config-prettier',
  'eslint-plugin-prettier',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-refresh',
  'globals',
  'husky',
  'jsdom',
  'prettier',
  'prettier-plugin-tailwindcss',
  'shadcn',
  'steiger',
  'typescript',
  'typescript-eslint',
  'vite',
  'vitest',
]

describe('Abhängigkeiten (formulare-detailseiten, AK-36)', () => {
  it('fügt keine Laufzeitabhängigkeit hinzu', () => {
    expect(laufzeit.filter((name) => !LAUFZEIT_VORHER.includes(name))).toEqual([])
  })

  it('fügt keine Entwicklungsabhängigkeit hinzu', () => {
    expect(entwicklung.filter((name) => !ENTWICKLUNG_VORHER.includes(name))).toEqual([])
  })

  it('enthält keine Formular-, Tabellen- oder Validierungsbibliothek', () => {
    const verboten =
      /react-hook-form|formik|final-form|@tanstack\/(react-)?(form|table)|zod|valibot|yup|joi|superstruct|ag-grid|react-table|@radix-ui\/react-tabs|@radix-ui\/react-progress/i
    expect([...laufzeit, ...entwicklung].filter((name) => verboten.test(name))).toEqual([])
  })
})
