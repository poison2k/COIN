// Reine Hilfsfunktionen und Konstanten für das Startskript der Systemtest-API (scripts/start-api.mjs).
// Feature e2e-testdatenbank, siehe docs/features/e2e-testdatenbank.md und ADR-0007.
// Keine Seiteneffekte: Die Funktionen bauen nur Werte zusammen und sind mit `node --test` prüfbar.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const E2E_API_URL = 'http://localhost:5182'
export const E2E_WEB_URL = 'http://localhost:5183'
export const E2E_DATENBANK = 'coin_e2e'
export const POSTGRES_IMAGE = 'postgres:17'
export const DOCKER_FEHLERMELDUNG =
  'Systemtest-Datenbank konnte nicht gestartet werden. Läuft Docker? Bitte Docker starten und den Lauf wiederholen.'

const REPO_WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const API_PROJEKT = path.join(REPO_WURZEL, 'src', 'Coin.Api')

// Variablen, die die Ziel-DB, Umgebung oder Adresse der API beeinflussen könnten (AK-6, AK-7).
// .NET liest Umgebungsvariablen case-insensitiv und behandelt `:` und `__` gleich. Zum Vergleich werden
// `:`, `__` und `_` auf `_` vereinheitlicht, damit z. B. auch `aspnetcore:environment` erfasst wird.
const normalisiere = (name) => name.replace(/:|__/g, '_').toLowerCase()
const UEBERSCHRIEBENE_VARIABLEN = [
  'ASPNETCORE_ENVIRONMENT',
  'ASPNETCORE_URLS',
  'ConnectionStrings__CoinDb',
  'POSTGRESQLCONNSTR_CoinDb',
  'CUSTOMCONNSTR_CoinDb',
].map(normalisiere)

function pflichtwert(name, wert) {
  if (wert === undefined || wert === null || String(wert).trim() === '') {
    throw new Error(`Connection-String: Pflichtwert "${name}" fehlt.`)
  }
  return String(wert)
}

function quote(wert) {
  return /[;"]/.test(wert) ? `"${wert.replaceAll('"', '""')}"` : wert
}

/** Baut einen Npgsql-Connection-String (Key-Value-Format, keine URI). */
export function baueConnectionString({ host, port, database, username, password } = {}) {
  const teile = [
    ['Host', pflichtwert('host', host)],
    ['Port', pflichtwert('port', port)],
    ['Database', pflichtwert('database', database)],
    ['Username', pflichtwert('username', username)],
    ['Password', pflichtwert('password', password)],
  ]
  return teile.map(([k, v]) => `${k}=${quote(v)}`).join(';')
}

/** Liefert eine neue Umgebung für den API-Prozess; die Basisumgebung bleibt unverändert. */
export function baueApiUmgebung(basis, connectionString) {
  if (typeof connectionString !== 'string' || connectionString.trim() === '') {
    throw new Error('Kein Connection-String für die Systemtest-Datenbank – API wird nicht gestartet.')
  }
  const umgebung = {}
  for (const [schluessel, wert] of Object.entries(basis ?? {})) {
    if (!UEBERSCHRIEBENE_VARIABLEN.includes(normalisiere(schluessel))) umgebung[schluessel] = wert
  }
  umgebung.ASPNETCORE_ENVIRONMENT = 'Testing'
  umgebung.ASPNETCORE_URLS = E2E_API_URL
  umgebung.ConnectionStrings__CoinDb = connectionString
  return umgebung
}

/** Argumente für `dotnet`: eigenes Release-Build, ohne Launch-Profil. */
export function baueDotnetArgumente() {
  return ['run', '--project', API_PROJEKT, '--no-launch-profile', '-c', 'Release']
}

/** Log-Zeile zur gestarteten Datenbank – ohne Passwort und ohne Connection-String (AK-12). */
export function beschreibeDatenbank({ host, port, database } = {}) {
  return `Systemtest-Datenbank "${database}" (${POSTGRES_IMAGE}) läuft auf ${host}:${port}.`
}

/** Verständliche Fehlermeldung, wenn Container oder API nicht starten (AK-8). */
export function startFehlerMeldung(fehler) {
  const ursache = fehler instanceof Error ? fehler.message : String(fehler)
  return `${DOCKER_FEHLERMELDUNG}\nUrsache: ${ursache}`
}
