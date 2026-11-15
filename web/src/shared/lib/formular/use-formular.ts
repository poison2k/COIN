import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { pruefeNachZeigerklick } from './zeiger'

// Formular-Hook ohne Bibliothek (formulare-detailseiten, Abschnitt 4.1, ADR-0039 Punkt 1/2). Regeln:
// - Ein Fehler erscheint erst nach dem Verlassen eines seit dem Laden geänderten Felds oder beim Absenden.
// - Ein angezeigter Fehler verschwindet bei der Eingabe, sobald der Wert gültig ist (oder die Meldung nicht mehr passt);
//   ein neuer oder anderer Fehler erscheint erst beim nächsten Verlassen oder Absenden.
// - Server-Feldfehler stehen am Feld, bis es geändert wird.
// - Absenden mit Fehlern ruft den Handler nicht auf und fokussiert das erste fehlerhafte Feld in Formularreihenfolge.
// Die Prüfregeln bleiben die Prüffunktionen der Slices; der Hook kennt keine eigenen Regeln oder Texte.

/** Fehlertexte je Feld. */
export type Formularfehler<W> = Partial<Record<keyof W & string, string>>

export interface FormularOptionen<W> {
  ausgangswerte: W
  /** Bestehende Prüffunktion des Slices; liefert je fehlerhaftem Feld eine Meldung. */
  pruefe: (werte: W) => Formularfehler<W>
  /** Feldreihenfolge im Formular (für den Fokus auf den ersten Fehler und die Zusammenfassung). */
  reihenfolge: ReadonlyArray<keyof W & string>
  /** Präfix der Feld-Ids (`<praefix>-<feld>`); ohne Angabe eine eindeutige Id. */
  idPraefix?: string
  /** Wird synchron aufgerufen, sobald sich „geändert“ ändert (z. B. für die Verlassen-Warnung der Seite). */
  onGeaendert?: (geaendert: boolean) => void
}

/** Eigenschaften eines Felds für `Formularfeld` und das Eingabeelement. */
export interface FeldBindung<V> {
  id: string
  value: V
  onChange: (ereignis: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
  onBlur: () => void
  fehler: string | undefined
}

export interface Formular<W> {
  werte: W
  feld: <K extends keyof W & string>(name: K) => FeldBindung<W[K]>
  /** Id des Eingabeelements eines Felds. */
  feldId: (name: keyof W & string) => string
  /** Setzt einen Wert direkt (Radiogruppe, Datei, Auswahl). */
  setzeWert: <K extends keyof W & string>(name: K, wert: W[K]) => void
  /** Meldet das Verlassen eines Felds, dessen Element kein `onBlur` aus `feld` nutzt. */
  verlasse: (name: keyof W & string) => void
  /** Angezeigte Fehler (Server vor Client). */
  fehler: Formularfehler<W>
  /** Angezeigte Fehler in Formularreihenfolge. */
  fehlerListe: Array<{ feld: keyof W & string; feldId: string; text: string }>
  /** Mindestens ein Wert weicht vom Ausgangswert ab. */
  geaendert: boolean
  /** Es wurde seit dem Laden bzw. Zurücksetzen mindestens einmal abgesendet (für die Zusammenfassung). */
  versucht: boolean
  /** Erzeugt den Submit-Handler: prüft, zeigt Fehler und fokussiert, sonst ruft er den Handler mit den Werten auf. */
  absenden: (handler: (werte: W) => void | Promise<void>) => (ereignis?: FormEvent) => void
  /** Setzt Server-Feldfehler und fokussiert das erste betroffene Feld. */
  setzeServerFehler: (fehler: Formularfehler<W>) => void
  /** Fokussiert das erste angezeigte fehlerhafte Feld. */
  fokussiereErstenFehler: () => void
  /** Neue Ausgangswerte (Standard: die aktuellen Werte); setzt alle Fehler zurück, sofort wirksam (vor Navigation). */
  zuruecksetzen: (neueAusgangswerte?: W) => void
}

function gleich<W>(a: W, b: W): boolean {
  for (const schluessel of Object.keys(a as object) as Array<keyof W>) {
    if (!Object.is(a[schluessel], b[schluessel])) return false
  }
  return true
}

function ohne<W>(fehler: Formularfehler<W>, feld: keyof W & string): Formularfehler<W> {
  if (!(feld in fehler)) return fehler
  const kopie = { ...fehler }
  delete kopie[feld]
  return kopie
}

function fokussiere(id: string | undefined) {
  if (!id) return
  const element = document.getElementById(id)
  element?.focus()
}

export function useFormular<W extends object>({
  ausgangswerte,
  pruefe,
  reihenfolge,
  idPraefix,
  onGeaendert,
}: FormularOptionen<W>): Formular<W> {
  const eigeneId = useId()
  const praefix = idPraefix ?? `formular${eigeneId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [werte, setWerte] = useState<W>(ausgangswerte)
  const [ausgang, setAusgang] = useState<W>(ausgangswerte)
  const [angezeigt, setAngezeigt] = useState<Formularfehler<W>>({})
  const [server, setServer] = useState<Formularfehler<W>>({})
  const [fokusAnfrage, setFokusAnfrage] = useState(0)
  const [versucht, setVersucht] = useState(false)

  // Aktuelle Werte für Handler, die im selben Takt wie eine Eingabe laufen (blur direkt nach change).
  const werteRef = useRef(werte)
  const ausgangRef = useRef(ausgang)
  const geaenderteFelder = useRef(new Set<string>())
  const gemeldetGeaendert = useRef(false)
  const onGeaendertRef = useRef(onGeaendert)
  const pruefeRef = useRef(pruefe)
  useEffect(() => {
    onGeaendertRef.current = onGeaendert
    pruefeRef.current = pruefe
  })

  // Beim Aushängen (z. B. Reiterwechsel) gilt das Formular nicht mehr als geändert.
  useEffect(
    () => () => {
      if (gemeldetGeaendert.current) onGeaendertRef.current?.(false)
    },
    [],
  )

  const feldId = useCallback((name: keyof W & string) => `${praefix}-${name}`, [praefix])

  const melde = useCallback((neueWerte: W, neuerAusgang: W) => {
    const jetzt = !gleich(neueWerte, neuerAusgang)
    if (jetzt !== gemeldetGeaendert.current) {
      gemeldetGeaendert.current = jetzt
      onGeaendertRef.current?.(jetzt)
    }
  }, [])

  const setzeWert = useCallback(
    <K extends keyof W & string>(name: K, wert: W[K]) => {
      const neu = { ...werteRef.current, [name]: wert }
      werteRef.current = neu
      geaenderteFelder.current.add(name)
      setWerte(neu)
      setServer((alt) => ohne(alt, name))
      // Angezeigte Fehler verschwinden, sobald ihr Feld gültig ist oder die Meldung nicht mehr passt (auch bei
      // abhängigen Feldern, z. B. Exemplar-Nummer nach Wechsel der Exemplar-Wahl); neue Fehler erst beim Verlassen.
      setAngezeigt((alt) => {
        const schluessel = Object.keys(alt) as Array<keyof W & string>
        if (schluessel.length === 0) return alt
        const pruefung = pruefeRef.current(neu)
        let geaendert = false
        const naechste: Formularfehler<W> = {}
        for (const feld of schluessel) {
          if (pruefung[feld] !== undefined && pruefung[feld] === alt[feld]) naechste[feld] = alt[feld]
          else geaendert = true
        }
        return geaendert ? naechste : alt
      })
      melde(neu, ausgangRef.current)
    },
    [melde],
  )

  const verlasse = useCallback((name: keyof W & string) => {
    if (!geaenderteFelder.current.has(name)) return
    pruefeNachZeigerklick(() => {
      if (!geaenderteFelder.current.has(name)) return
      const meldung = pruefeRef.current(werteRef.current)[name]
      setAngezeigt((alt) => {
        if (meldung === undefined) return ohne(alt, name)
        return alt[name] === meldung ? alt : { ...alt, [name]: meldung }
      })
    })
  }, [])

  const fehler: Formularfehler<W> = { ...angezeigt, ...server }
  const fehlerListe = reihenfolge.flatMap((name) => {
    const text = fehler[name]
    return text ? [{ feld: name, feldId: feldId(name), text }] : []
  })

  const ersterFehlerId = fehlerListe[0]?.feldId
  const ersterFehlerRef = useRef<string | undefined>(ersterFehlerId)
  useEffect(() => {
    ersterFehlerRef.current = ersterFehlerId
  })

  // Fokus nach dem Rendern, damit Fehlertexte und aria-invalid schon im DOM stehen.
  useEffect(() => {
    if (fokusAnfrage > 0) fokussiere(ersterFehlerRef.current)
  }, [fokusAnfrage])

  const absenden = useCallback(
    (handler: (werte: W) => void | Promise<void>) => (ereignis?: FormEvent) => {
      ereignis?.preventDefault()
      const aktuell = werteRef.current
      const pruefung = pruefeRef.current(aktuell)
      setAngezeigt(pruefung)
      setServer({})
      setVersucht(true)
      if (Object.keys(pruefung).length > 0) {
        setFokusAnfrage((n) => n + 1)
        return
      }
      void handler(aktuell)
    },
    [],
  )

  const setzeServerFehler = useCallback((neu: Formularfehler<W>) => {
    setServer(neu)
    if (Object.keys(neu).length > 0) setFokusAnfrage((n) => n + 1)
  }, [])

  const fokussiereErstenFehler = useCallback(() => setFokusAnfrage((n) => n + 1), [])

  const zuruecksetzen = useCallback(
    (neueAusgangswerte?: W) => {
      const neu = neueAusgangswerte ?? werteRef.current
      werteRef.current = neu
      ausgangRef.current = neu
      geaenderteFelder.current.clear()
      // Sofort wirksam, damit eine anschließende Navigation nicht mehr blockiert wird (ADR-0040 Punkt 3).
      flushSync(() => {
        setWerte(neu)
        setAusgang(neu)
        setAngezeigt({})
        setServer({})
        setVersucht(false)
        melde(neu, neu)
      })
    },
    [melde],
  )

  const feld = <K extends keyof W & string>(name: K): FeldBindung<W[K]> => ({
    id: feldId(name),
    value: werte[name],
    onChange: (ereignis) => setzeWert(name, ereignis.target.value as W[K]),
    onBlur: () => verlasse(name),
    fehler: fehler[name],
  })

  return {
    werte,
    feld,
    feldId,
    setzeWert,
    verlasse,
    fehler,
    fehlerListe,
    geaendert: !gleich(werte, ausgang),
    versucht,
    absenden,
    setzeServerFehler,
    fokussiereErstenFehler,
    zuruecksetzen,
  }
}

/**
 * Synchrone Sendesperre (ADR-0039 Punkt 1, AK-10): verwirft weitere Aufrufe, solange eine Aktion läuft; `sendet` dient
 * dem Ladezustand des Buttons (`Button laedt`).
 */
export function useSendeSperre() {
  const sperre = useRef(false)
  const [sendet, setSendet] = useState(false)

  const mitSperre = useCallback(async <T>(aktion: () => Promise<T>): Promise<T | undefined> => {
    if (sperre.current) return undefined
    sperre.current = true
    setSendet(true)
    try {
      return await aktion()
    } finally {
      sperre.current = false
      setSendet(false)
    }
  }, [])

  const gesperrt = useCallback(() => sperre.current, [])

  return { sendet, mitSperre, gesperrt }
}
