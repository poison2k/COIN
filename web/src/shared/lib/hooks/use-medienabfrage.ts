import { useCallback, useSyncExternalStore } from 'react'

// Medienabfrage (formulare-detailseiten, ADR-0041 Punkt 2): liefert, ob eine Media-Query zutrifft, und folgt Änderungen.
// Ohne `matchMedia` (z. B. beim Vorrendern) gilt „trifft nicht zu“ (Desktop).

export function useMedienabfrage(query: string): boolean {
  const abonniere = useCallback(
    (beiAenderung: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const liste = window.matchMedia(query)
      liste.addEventListener('change', beiAenderung)
      return () => liste.removeEventListener('change', beiAenderung)
    },
    [query],
  )
  const trifftZu = useCallback(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    [query],
  )
  return useSyncExternalStore(abonniere, trifftZu, () => false)
}
