/**
 * Stub für window.matchMedia (jsdom kennt es nicht). Der Theme-Provider (`prefers-color-scheme`, AK-16)
 * und der shadcn-Hook use-mobile fragen es ab. Standard in test/setup.ts: keine Media-Query trifft zu
 * (helles System, Desktop-Breite). Einzelne Tests überschreiben das mit `stubMatchMedia(...)`;
 * setup.ts setzt den Standard vor jedem Test neu.
 */
export function stubMatchMedia(trifftZu: (query: string) => boolean = () => false): void {
  const matchMedia = (query: string): MediaQueryList => ({
    matches: trifftZu(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia })
}

/** Media-Query, mit der das System-Farbschema abgefragt wird. */
export const DUNKEL_QUERY = '(prefers-color-scheme: dark)'
