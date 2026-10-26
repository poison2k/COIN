import { sende, type ApiErgebnis } from '@/shared/api'
import type { Konfiguration, KopfAnsicht, StartseiteAnsicht } from '../model/types'

/** Basis-URL der Startseiten-API (Abschnitt 5.1). */
export const STARTSEITE_URL = '/api/startseite'

/** URL der Konfiguration (GET/PUT, startpage.manage). */
export const KONFIGURATION_URL = `${STARTSEITE_URL}/konfiguration`

const JSON_LESEN: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } }

/** GET /api/startseite – aktive Blöcke mit Daten (coins.read, AK-20). */
export function ladeStartseite(): Promise<ApiErgebnis<StartseiteAnsicht>> {
  return sende<StartseiteAnsicht>(STARTSEITE_URL, JSON_LESEN, [200])
}

/** GET /api/startseite/kopf – öffentlicher Kopfbereich (AK-22, AK-37), auch ohne Anmeldung. */
export function ladeKopf(): Promise<ApiErgebnis<KopfAnsicht>> {
  return sende<KopfAnsicht>(`${STARTSEITE_URL}/kopf`, JSON_LESEN, [200])
}

/** GET /api/startseite/konfiguration – Konfiguration mit Vorschaudaten (startpage.manage, AK-7). */
export function ladeKonfiguration(): Promise<ApiErgebnis<Konfiguration>> {
  return sende<Konfiguration>(KONFIGURATION_URL, JSON_LESEN, [200])
}
