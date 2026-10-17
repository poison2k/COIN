import { holeToken } from '@/shared/lib/anmeldung'
import type { ProblemDetails } from './problem-details'

/** Grund einer 403-Antwort laut `code` (rollen-benutzerverwaltung, AK-6, AK-34). */
export type KeinZugriffGrund = 'deaktiviert' | 'keineBerechtigung'

/** Typisiertes Ergebnis eines API-Aufrufs. Es werden keine Ausnahmen geworfen. */
export type ApiErgebnis<T> =
  | { art: 'ok'; daten: T }
  | { art: 'validierung'; fehler: Record<string, string[]> }
  | { art: 'nichtAngemeldet' }
  | { art: 'keinZugriff'; grund: KeinZugriffGrund }
  | { art: 'konflikt'; code: string | null; detail?: string }
  | { art: 'zuGross' }
  | { art: 'formatUngueltig' }
  | { art: 'nichtGefunden' }
  | { art: 'fehler' }

/** Eine Seite einer Liste aus der API (Benutzerliste, Audit-Log). */
export interface Seite<T> {
  eintraege: T[]
  gesamt: number
  seite: number
  groesse: number
}

/** Optionen für `sende`/`bildeAb`. */
export interface SendeOptionen {
  /**
   * Bei 409 auch `detail` der ProblemDetails übernehmen (z. B. „… nicht unter 7 gesenkt …“, coin-ausgaben AK-25).
   * Nur für Texte, die der Server ohne Personendaten formuliert.
   */
  konfliktDetail?: boolean
}

/** Wird bei 401 auf einen schreibenden Aufruf ausgelöst (Sitzung abgelaufen, AK-27). */
let beiNichtAngemeldet: (() => void) | null = null

/** Wird bei 403 mit `code=benutzer_deaktiviert` auf einen beliebigen Aufruf ausgelöst (AK-32). */
let beiDeaktiviert: (() => void) | null = null

/** Registriert die Reaktion auf 401 bei schreibenden Aufrufen; `null` entfernt sie. */
export function setzeBeiNichtAngemeldet(callback: (() => void) | null): void {
  beiNichtAngemeldet = callback
}

/** Registriert die Reaktion auf 403 `benutzer_deaktiviert`; `null` entfernt sie. */
export function setzeBeiDeaktiviert(callback: (() => void) | null): void {
  beiDeaktiviert = callback
}

/** Das Token geht nur an die eigene API: gleiche Origin und Pfad unter /api/ (kein Token-Abfluss an Dritte). */
function istEigeneApi(url: string): boolean {
  try {
    const ziel = new URL(url, window.location.origin)
    return ziel.origin === window.location.origin && ziel.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

const LESENDE_METHODEN = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function leseJson(antwort: Response): Promise<unknown> {
  try {
    return await antwort.json()
  } catch {
    return null
  }
}

/** `code` einer ProblemDetails-Antwort; `null`, wenn der Body fehlt, kein JSON ist oder keinen Text-`code` hat. */
async function leseCode(antwort: Response): Promise<string | null> {
  const problem = (await leseJson(antwort)) as ProblemDetails | null
  return typeof problem?.code === 'string' ? problem.code : null
}

export async function bildeAb<T>(
  antwort: Response,
  erfolgsStatus: number[],
  optionen: SendeOptionen = {},
): Promise<ApiErgebnis<T>> {
  if (erfolgsStatus.includes(antwort.status)) {
    const daten = await leseJson(antwort)
    return daten === null ? { art: 'fehler' } : { art: 'ok', daten: daten as T }
  }
  switch (antwort.status) {
    case 400: {
      const problem = (await leseJson(antwort)) as ProblemDetails | null
      return { art: 'validierung', fehler: problem?.errors ?? {} }
    }
    case 401:
      return { art: 'nichtAngemeldet' }
    case 403: {
      // Ausgewertet wird der code, nie der deutsche Text (ADR-0016 Punkt 7).
      const code = await leseCode(antwort)
      return { art: 'keinZugriff', grund: code === 'benutzer_deaktiviert' ? 'deaktiviert' : 'keineBerechtigung' }
    }
    case 404:
      return { art: 'nichtGefunden' }
    case 409: {
      if (!optionen.konfliktDetail) return { art: 'konflikt', code: await leseCode(antwort) }
      const problem = (await leseJson(antwort)) as ProblemDetails | null
      const code = typeof problem?.code === 'string' ? problem.code : null
      return typeof problem?.detail === 'string'
        ? { art: 'konflikt', code, detail: problem.detail }
        : { art: 'konflikt', code }
    }
    case 413:
      return { art: 'zuGross' }
    case 415:
      return { art: 'formatUngueltig' }
    default:
      return { art: 'fehler' }
  }
}

/**
 * Sendet eine Anfrage an die API. Angemeldet mit `Authorization: Bearer` (AK-27); das Token wird bei jedem Aufruf
 * neu gelesen. Das Motivbild lädt der Browser per <img src> ohne diesen Weg (öffentlich, ADR-0014).
 */
export async function sende<T>(
  url: string,
  init: RequestInit,
  erfolgsStatus: number[],
  optionen: SendeOptionen = {},
): Promise<ApiErgebnis<T>> {
  try {
    const headers = new Headers(init.headers)
    const token = await holeToken()
    if (token && istEigeneApi(url)) headers.set('Authorization', `Bearer ${token}`)

    const antwort = await fetch(url, { ...init, headers })
    const methode = (init.method ?? 'GET').toUpperCase()
    if (antwort.status === 401 && !LESENDE_METHODEN.has(methode)) beiNichtAngemeldet?.()
    const ergebnis = await bildeAb<T>(antwort, erfolgsStatus, optionen)
    if (ergebnis.art === 'keinZugriff' && ergebnis.grund === 'deaktiviert') beiDeaktiviert?.()
    return ergebnis
  } catch {
    // Netzwerkfehler: keine technischen Details nach außen geben.
    return { art: 'fehler' }
  }
}

/** Heruntergeladene Datei mit dem Namen aus `Content-Disposition` (`null`, wenn keiner angegeben ist). */
export interface Datei {
  blob: Blob
  dateiname: string | null
}

/**
 * Dateiname aus einem `Content-Disposition`-Header (RFC 6266): `filename*` (RFC 5987, prozentkodiert) vor
 * `filename`; `null` ohne Header, ohne Namen oder bei ungültiger Kodierung. Die Prüfung, ob der Name verwendet
 * werden darf, liegt beim Aufrufer.
 */
export function dateinameAusContentDisposition(header: string | null): string | null {
  if (header === null) return null
  let einfach: string | null = null
  let erweitert: string | null = null
  for (const teil of header.split(';')) {
    const gleich = teil.indexOf('=')
    if (gleich < 0) continue
    const name = teil.slice(0, gleich).trim().toLowerCase()
    const wert = teil.slice(gleich + 1).trim()
    if (name === 'filename*') {
      const apostroph = wert.indexOf("'", wert.indexOf("'") + 1)
      try {
        erweitert = decodeURIComponent(apostroph < 0 ? wert : wert.slice(apostroph + 1))
      } catch {
        erweitert = null
      }
    } else if (name === 'filename') {
      einfach = wert.length >= 2 && wert.startsWith('"') && wert.endsWith('"') ? wert.slice(1, -1) : wert
    }
  }
  const ergebnis = erweitert ?? einfach
  return ergebnis === null || ergebnis.length === 0 ? null : ergebnis
}

/**
 * Lädt eine Datei per `fetch` mit Bearer-Token wie `sende` und liefert sie als Blob samt Dateiname aus
 * `Content-Disposition` (zertifikatsvorlagen, AK-30). Das Token steht nie in der URL. Fehler werden wie bei
 * `bildeAb` abgebildet (mit `optionen`, z. B. `konfliktDetail`); 403 `benutzer_deaktiviert` löst die
 * Deaktiviert-Reaktion aus.
 */
export async function ladeDatei(url: string, optionen: SendeOptionen = {}): Promise<ApiErgebnis<Datei>> {
  try {
    const headers = new Headers()
    const token = await holeToken()
    if (token && istEigeneApi(url)) headers.set('Authorization', `Bearer ${token}`)

    const antwort = await fetch(url, { method: 'GET', headers })
    if (antwort.status === 200) {
      const dateiname = dateinameAusContentDisposition(antwort.headers.get('Content-Disposition'))
      return { art: 'ok', daten: { blob: await antwort.blob(), dateiname } }
    }
    const ergebnis = await bildeAb<Datei>(antwort, [], optionen)
    if (ergebnis.art === 'keinZugriff' && ergebnis.grund === 'deaktiviert') beiDeaktiviert?.()
    return ergebnis
  } catch {
    // Netzwerkfehler: keine technischen Details nach außen geben.
    return { art: 'fehler' }
  }
}
