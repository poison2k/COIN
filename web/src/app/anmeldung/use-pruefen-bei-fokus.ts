import { useEffect, useRef } from 'react'

/** Mindestabstand zwischen zwei Prüfungen bei Rückkehr in das Fenster (Annahme A4). */
const SPERRE_MS = 30_000

/**
 * Prüft bei Rückkehr in das Fenster (`focus` des Fensters oder `visibilitychange` auf „visible“) still neu, solange
 * `aktiv` gilt (rollen-benutzerverwaltung Rev. 3, AK-44). Höchstens eine Prüfung je 30 Sekunden; kein Timer, kein
 * Polling. Die Sperre gilt auch nach jeder anderen Prüfung (z. B. „Erneut prüfen“), deren Startzeit `zuletztGeprueft`
 * liefert. Parallele Prüfungen verhindert `pruefen` selbst. Die Listener werden entfernt, sobald `aktiv` endet.
 */
export function usePruefenBeiFokus(
  aktiv: boolean,
  pruefen: () => Promise<unknown>,
  zuletztGeprueft: () => number,
): void {
  const aktuell = useRef({ pruefen, zuletztGeprueft })
  useEffect(() => {
    aktuell.current = { pruefen, zuletztGeprueft }
  }, [pruefen, zuletztGeprueft])

  useEffect(() => {
    if (!aktiv) return
    // Der Zustand wurde gerade erst geladen: Die Sperre beginnt mit dem Aktivieren.
    let letzte = Date.now()

    function beiRueckkehr() {
      const jetzt = Date.now()
      if (jetzt - Math.max(letzte, aktuell.current.zuletztGeprueft()) < SPERRE_MS) return
      letzte = jetzt
      void aktuell.current.pruefen()
    }
    function beiSichtbarkeit() {
      if (document.visibilityState === 'visible') beiRueckkehr()
    }

    window.addEventListener('focus', beiRueckkehr)
    document.addEventListener('visibilitychange', beiSichtbarkeit)
    return () => {
      window.removeEventListener('focus', beiRueckkehr)
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
    }
  }, [aktiv])
}
