import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom kennt keine Object-URLs; die Vorschau (AK-30) nutzt URL.createObjectURL.
beforeEach(() => {
  let zaehler = 0
  URL.createObjectURL = vi.fn(() => `blob:vorschau-${++zaehler}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
