import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { stubMatchMedia } from './matchMedia'

// jsdom kennt keine Object-URLs; die Vorschau (AK-30) nutzt URL.createObjectURL.
beforeEach(() => {
  let zaehler = 0
  URL.createObjectURL = vi.fn(() => `blob:vorschau-${++zaehler}`)
  URL.revokeObjectURL = vi.fn()
  // jsdom implementiert scrollTo nicht; der Router ruft es bei Navigationen auf (Scroll-Wiederherstellung).
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

// jsdom kennt kein matchMedia (Theme „System“, use-mobile). Standard: helles System, Desktop-Breite.
beforeEach(() => {
  stubMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  // Theme-Zustand (AK-16) darf nicht von einem Test in den nächsten wandern.
  localStorage.clear()
  // Anmeldung (anmeldung-keycloak): keine Sitzung und keine Browser-URL in den nächsten Test mitnehmen.
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  document.documentElement.classList.remove('light', 'dark')
})
