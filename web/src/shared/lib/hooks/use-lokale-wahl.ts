import { useCallback, useState } from 'react'

// Bedienvorliebe im localStorage (startseite-listen-pruefung, Abschnitt 4.6, ADR-0044): feste Positivliste, andere oder
// fehlende Werte ergeben den Standard. Wirft der Speicherzugriff (gesperrt, privater Modus), gilt der Wert nur im
// Zustand der Komponente, ohne Fehler.

function lies<T extends string>(schluessel: string, erlaubt: ReadonlyArray<T>, standard: T): T {
  try {
    const wert = window.localStorage.getItem(schluessel)
    return wert !== null && (erlaubt as ReadonlyArray<string>).includes(wert) ? (wert as T) : standard
  } catch {
    return standard
  }
}

export function useLokaleWahl<T extends string>(
  schluessel: string,
  erlaubt: ReadonlyArray<T>,
  standard: T,
): [T, (wert: T) => void] {
  const [wert, setWert] = useState<T>(() => lies(schluessel, erlaubt, standard))
  // Die Positivliste kommt oft als Literal; für die Abhängigkeit zählt ihr Inhalt, nicht die Identität.
  const erlaubtListe = erlaubt.join('|')

  const setze = useCallback(
    (neu: T) => {
      if (!erlaubtListe.split('|').includes(neu)) return
      setWert(neu)
      try {
        window.localStorage.setItem(schluessel, neu)
      } catch {
        // Speicher nicht verfügbar: Die Wahl gilt nur bis zum Verlassen der Seite.
      }
    },
    [schluessel, erlaubtListe],
  )

  return [wert, setze]
}
