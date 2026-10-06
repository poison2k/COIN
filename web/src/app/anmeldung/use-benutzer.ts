import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hatBerechtigung, ladeAngemeldetenBenutzer, type Benutzer } from '@/entities/benutzer'
import type { ApiErgebnis } from '@/shared/api'
import type { AnmeldeStatus, Anmeldung } from '@/shared/lib/anmeldung'
import type { ErneutPruefenErgebnis } from '@/pages/kein-zugriff'
import type { BenutzerKontextWert } from './benutzer-kontext'
import { zugriffsklasse } from './zugriffsklasse'

interface Anfrage {
  schluessel: string
  ergebnis: Promise<ApiErgebnis<Benutzer>>
}

export type BenutzerErgebnis = BenutzerKontextWert & {
  bereit: boolean
  /** Lädt /api/me still neu (z. B. nach 403 benutzer_deaktiviert auf einen anderen Aufruf, AK-32). */
  neuLaden: () => void
  /** Zeitpunkt (ms seit Epoche) der letzten gestarteten Prüfung über `erneutPruefen`/`neuLaden`, sonst 0. */
  zuletztGeprueft: () => number
}

/**
 * Lädt GET /api/me genau einmal pro Anmeldung (bzw. pro „Erneut versuchen“), nie anonym und nicht bei jeder Navigation
 * oder Token-Erneuerung (AK-28). Die laufende Anfrage wird wiederverwendet (auch im StrictMode).
 * 403 `benutzer_deaktiviert` führt zum Zustand „deaktiviert“; die Sitzung bleibt bestehen (AK-32).
 * `erneutPruefen` und `neuLaden` laden /api/me neu, ohne den bisherigen Zustand bis zur Antwort aufzugeben (Rev. 3,
 * AK-42, AK-45); bei Netzwerk- oder Serverfehlern bleibt er erhalten.
 */
export function useBenutzer(anmeldung: Anmeldung): BenutzerErgebnis {
  const [versuch, setVersuch] = useState(0)
  const [geladen, setGeladen] = useState<{ schluessel: string; ergebnis: ApiErgebnis<Benutzer> } | null>(null)
  const anfrage = useRef<Anfrage | null>(null)
  const pruefung = useRef<Promise<ErneutPruefenErgebnis> | null>(null)
  const letztePruefung = useRef(0)

  const schluessel = anmeldung.status === 'angemeldet' ? `${anmeldung.sitzung ?? ''}#${versuch}` : null

  useEffect(() => {
    if (schluessel === null) return
    if (anfrage.current?.schluessel !== schluessel) {
      anfrage.current = { schluessel, ergebnis: ladeAngemeldetenBenutzer() }
    }
    let aktiv = true
    void anfrage.current.ergebnis.then((ergebnis) => {
      if (aktiv) setGeladen({ schluessel, ergebnis })
    })
    return () => {
      aktiv = false
    }
  }, [schluessel])

  const ergebnis = geladen !== null && geladen.schluessel === schluessel ? geladen.ergebnis : null
  const tokenAbgelehnt = ergebnis?.art === 'nichtAngemeldet'
  const { sitzungVerwerfen } = anmeldung

  // Die API lehnt das Token ab: Sitzung verwerfen, die App zeigt dann „anonym“.
  useEffect(() => {
    if (tokenAbgelehnt) void sitzungVerwerfen()
  }, [tokenAbgelehnt, sitzungVerwerfen])

  const { status } = anmeldung
  const erneutVersuchen = useCallback(() => setVersuch((alt) => alt + 1), [])
  const abgeleitet = useMemo(() => ableiten(status, ergebnis, erneutVersuchen), [status, ergebnis, erneutVersuchen])

  // Für die Prüfung: der aktuelle Schlüssel und Zustand, ohne die Callback-Identität zu ändern.
  const aktuell = useRef({ schluessel, zustand: abgeleitet.zustand })
  useEffect(() => {
    aktuell.current = { schluessel, zustand: abgeleitet.zustand }
  }, [schluessel, abgeleitet.zustand])

  const erneutPruefen = useCallback((): Promise<ErneutPruefenErgebnis> => {
    if (pruefung.current !== null) return pruefung.current
    const { schluessel: geprueft, zustand } = aktuell.current
    if (geprueft === null) return Promise.resolve('unveraendert')
    const vorher = zugriffsklasse(zustand)
    // Gemeinsamer Zeitstempel für die 30-Sekunden-Sperre der Prüfung bei Rückkehr in das Fenster (AK-44).
    letztePruefung.current = Date.now()

    const laufend = ladeAngemeldetenBenutzer()
      .then((neu): ErneutPruefenErgebnis => {
        // Inzwischen abgemeldet oder neu angemeldet: Das Ergebnis gehört zu keiner aktuellen Sitzung mehr.
        if (aktuell.current.schluessel !== geprueft) return 'geaendert'
        if (istPruefFehler(neu)) return 'fehler'
        setGeladen({ schluessel: geprueft, ergebnis: neu })
        if (neu.art === 'nichtAngemeldet') return 'geaendert'
        return zugriffsklasse(ableiten('angemeldet', neu, erneutVersuchen).zustand) === vorher
          ? 'unveraendert'
          : 'geaendert'
      })
      .catch((): ErneutPruefenErgebnis => 'fehler')
      .finally(() => {
        pruefung.current = null
      })
    pruefung.current = laufend
    return laufend
  }, [erneutVersuchen])

  const neuLaden = useCallback(() => {
    void erneutPruefen()
  }, [erneutPruefen])

  const zuletztGeprueft = useCallback(() => letztePruefung.current, [])

  return useMemo(
    () => ({ ...abgeleitet, erneutPruefen, neuLaden, zuletztGeprueft }),
    [abgeleitet, erneutPruefen, neuLaden, zuletztGeprueft],
  )
}

/** Netzwerk- oder Serverfehler (alles außer Erfolg, 401 und 403 benutzer_deaktiviert): Zustand bleibt erhalten. */
function istPruefFehler(ergebnis: ApiErgebnis<Benutzer>): boolean {
  if (ergebnis.art === 'ok' || ergebnis.art === 'nichtAngemeldet') return false
  return !(ergebnis.art === 'keinZugriff' && ergebnis.grund === 'deaktiviert')
}

function ableiten(
  status: AnmeldeStatus,
  ergebnis: ApiErgebnis<Benutzer> | null,
  erneutVersuchen: () => void,
): Omit<BenutzerKontextWert, 'erneutPruefen'> & { bereit: boolean } {
  switch (status) {
    case 'nichtKonfiguriert':
      return { zustand: { art: 'nichtKonfiguriert' }, benutzer: null, erfassen: 'anmelden', bereit: true }
    case 'pruefe':
      return { zustand: { art: 'pruefe' }, benutzer: null, erfassen: 'unbekannt', bereit: false }
    case 'anonym':
      return { zustand: { art: 'anonym' }, benutzer: null, erfassen: 'anmelden', bereit: true }
  }

  if (ergebnis === null || ergebnis.art === 'nichtAngemeldet') {
    return { zustand: { art: 'pruefe' }, benutzer: null, erfassen: 'unbekannt', bereit: false }
  }
  if (ergebnis.art === 'keinZugriff' && ergebnis.grund === 'deaktiviert') {
    return { zustand: { art: 'deaktiviert' }, benutzer: null, erfassen: 'keineBerechtigung', bereit: true }
  }
  if (ergebnis.art !== 'ok') {
    return {
      zustand: { art: 'fehler', erneutVersuchen },
      benutzer: null,
      erfassen: 'unbekannt',
      bereit: true,
    }
  }

  const benutzer = ergebnis.daten
  return {
    zustand: { art: 'angemeldet', benutzer },
    benutzer,
    erfassen: hatBerechtigung(benutzer, 'coins.write') ? 'erlaubt' : 'keineBerechtigung',
    bereit: true,
  }
}
