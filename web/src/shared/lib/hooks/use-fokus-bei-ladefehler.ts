import { useEffect, useRef } from 'react'

/**
 * Fokus beim Blättern mit Ladefehler (WCAG 2.4.3): Ein Ladefehler hängt die Seitennavigation aus. Lag der Fokus beim
 * Blättern darin, wandert er auf den Alarm (`tabIndex={-1}`) statt auf `body`.
 *
 * @param ergebnisDa Die Antwort zur aktuellen Anfrage liegt vor (Erfolg oder Fehler).
 * @param fehlgeschlagen Die aktuelle Antwort ist ein Fehler; der Alarm ist eingehängt.
 * @returns `bereichRef` um die Seitennavigation, `alarmRef` am Alarm und `merkeFokus`, das vor dem Seitenwechsel
 *   aufzurufen ist.
 */
export function useFokusBeiLadefehler(ergebnisDa: boolean, fehlgeschlagen: boolean) {
  const bereichRef = useRef<HTMLDivElement>(null)
  const alarmRef = useRef<HTMLParagraphElement>(null)
  const fokusBeimBlaettern = useRef(false)

  useEffect(() => {
    if (!ergebnisDa) return
    if (fehlgeschlagen && fokusBeimBlaettern.current) alarmRef.current?.focus()
    fokusBeimBlaettern.current = false
  }, [ergebnisDa, fehlgeschlagen])

  function merkeFokus() {
    fokusBeimBlaettern.current = bereichRef.current?.contains(document.activeElement) ?? false
  }

  return { bereichRef, alarmRef, merkeFokus }
}
