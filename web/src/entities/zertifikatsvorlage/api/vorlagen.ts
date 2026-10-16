import { ladeDatei, sende, type ApiErgebnis, type Datei } from '@/shared/api'
import type { VorlagenStatus } from '../model/types'

/** URL der Vorlagen eines Coins (zertifikatsvorlagen, Abschnitt 5.1). */
export function vorlagenUrl(coinId: string): string {
  return `/api/coins/${encodeURIComponent(coinId)}/zertifikatsvorlage`
}

/** GET /api/coins/{id}/zertifikatsvorlage – Status und Versionen (nur coins.write). */
export function ladeVorlagenStatus(coinId: string): Promise<ApiErgebnis<VorlagenStatus>> {
  return sende<VorlagenStatus>(vorlagenUrl(coinId), { method: 'GET', headers: { Accept: 'application/json' } }, [200])
}

/** GET …/zertifikatsvorlage/datei – aktive Vorlage, ohne eigene die Standardvorlage. */
export function ladeAktuelleVorlage(coinId: string): Promise<ApiErgebnis<Datei>> {
  return ladeDatei(`${vorlagenUrl(coinId)}/datei`)
}

/** GET …/zertifikatsvorlage/versionen/{n}/datei – eine bestimmte Version (nur Herunterladen, F6). */
export function ladeVorlagenVersion(coinId: string, version: number): Promise<ApiErgebnis<Datei>> {
  return ladeDatei(`${vorlagenUrl(coinId)}/versionen/${encodeURIComponent(String(version))}/datei`)
}

/** GET /api/zertifikatsvorlagen/standard – Standardvorlage (nur coins.write). */
export function ladeStandardvorlage(): Promise<ApiErgebnis<Datei>> {
  return ladeDatei('/api/zertifikatsvorlagen/standard')
}

/**
 * Dateiname eines Downloads wie im `Content-Disposition` des Servers (Abschnitt 5.2): ohne Coin die Standardvorlage,
 * mit Version `…-v{n}.docx`, aktive Datei ohne eigene Vorlage (`null`) `…-standard.docx`. Nur ASCII, keine Eingaben.
 */
export function dateiname(coinId?: string, version?: number | null): string {
  if (coinId === undefined) return 'zertifikatsvorlage-standard.docx'
  return typeof version === 'number'
    ? `zertifikatsvorlage-${coinId}-v${version}.docx`
    : `zertifikatsvorlage-${coinId}-standard.docx`
}
