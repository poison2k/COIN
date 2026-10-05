import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { darfKatalogSchreiben, ladeAngemeldetenBenutzer, type Benutzer } from '@/entities/benutzer'
import type { ApiErgebnis } from '@/shared/api'
import type { AnmeldeStatus, Anmeldung } from '@/shared/lib/anmeldung'
import type { BenutzerKontextWert } from './benutzer-kontext'

interface Anfrage {
  schluessel: string
  ergebnis: Promise<ApiErgebnis<Benutzer>>
}

/**
 * Lädt GET /api/me genau einmal pro Anmeldung (bzw. pro „Erneut versuchen“), nie anonym und nicht bei jeder
 * Navigation oder Token-Erneuerung (AK-28). Die laufende Anfrage wird wiederverwendet (auch im StrictMode).
 */
export function useBenutzer(anmeldung: Anmeldung): BenutzerKontextWert & { bereit: boolean } {
  const [versuch, setVersuch] = useState(0)
  const [geladen, setGeladen] = useState<{ schluessel: string; ergebnis: ApiErgebnis<Benutzer> } | null>(null)
  const anfrage = useRef<Anfrage | null>(null)

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

  return useMemo(() => ableiten(status, ergebnis, erneutVersuchen), [status, ergebnis, erneutVersuchen])
}

function ableiten(
  status: AnmeldeStatus,
  ergebnis: ApiErgebnis<Benutzer> | null,
  erneutVersuchen: () => void,
): BenutzerKontextWert & { bereit: boolean } {
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
    erfassen: darfKatalogSchreiben(benutzer.rolle) ? 'erlaubt' : 'keineBerechtigung',
    bereit: true,
  }
}
