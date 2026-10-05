// Reine Hilfsfunktionen und Konstanten für das Startskript der Systemtest-API (scripts/start-api.mjs).
// Feature e2e-testdatenbank, siehe docs/features/e2e-testdatenbank.md und ADR-0007;
// Systemtest-Keycloak: Feature anmeldung-keycloak, ADR-0015.
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

// Systemtest-Keycloak (ADR-0015): fester Port, damit Vite und API die Authority schon vor dem Start kennen.
export const E2E_KEYCLOAK_PORT = 5184
export const E2E_KEYCLOAK_URL = `http://localhost:${E2E_KEYCLOAK_PORT}`
export const E2E_OIDC_AUTHORITY = `${E2E_KEYCLOAK_URL}/realms/coin`
export const E2E_OIDC_AUDIENCE = 'coin-api'
export const E2E_OIDC_CLIENT_ID = 'coin-web'
/** Bootstrap-Administrator der Systemtests (synthetischer Testbenutzer aus der Realm-Datei). */
export const E2E_BOOTSTRAP_ADMIN = 'admin@test.local'
/** Derselbe exakte Tag wie in compose.yaml (ein Test prüft die Gleichheit). */
export const KEYCLOAK_IMAGE = 'quay.io/keycloak/keycloak:26.8.0'
export const REALM_DATEI = path.join(REPO_WURZEL, 'infra', 'keycloak', 'coin-realm.json')
export const KEYCLOAK_FEHLERMELDUNG =
  'Systemtest-Keycloak konnte nicht gestartet werden. Läuft Docker, und ist Port 5184 frei?'

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

// Sektionen, die Anmeldung, Bootstrap, CORS oder die Token-Prüfung beeinflussen könnten (ADR-0015):
// geerbte Werte werden in jeder Schreibweise entfernt, danach werden nur die Systemtest-Werte gesetzt.
const ENTFERNTE_PRAEFIXE = ['Oidc_', 'Bootstrap_', 'Frontend_', 'Authentication_'].map(normalisiere)
// WebApplication liest auch ASPNETCORE_- und DOTNET_-präfixierte Variablen als Konfiguration (Präfix entfällt).
// Deshalb wird jeder Name zusätzlich ohne dieses Präfix verglichen; unbeteiligte Variablen wie
// DOTNET_CLI_TELEMETRY_OPTOUT bleiben erhalten.
const HOST_PRAEFIX = /^(aspnetcore|dotnet)_/
const istBetroffen = (name) =>
  UEBERSCHRIEBENE_VARIABLEN.includes(name) || ENTFERNTE_PRAEFIXE.some((praefix) => name.startsWith(praefix))
const wirdEntfernt = (schluessel) => {
  const name = normalisiere(schluessel)
  return istBetroffen(name) || istBetroffen(name.replace(HOST_PRAEFIX, ''))
}

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
    if (!wirdEntfernt(schluessel)) umgebung[schluessel] = wert
  }
  umgebung.ASPNETCORE_ENVIRONMENT = 'Testing'
  umgebung.ASPNETCORE_URLS = E2E_API_URL
  umgebung.ConnectionStrings__CoinDb = connectionString
  umgebung.Oidc__Authority = E2E_OIDC_AUTHORITY
  umgebung.Oidc__Audience = E2E_OIDC_AUDIENCE
  umgebung.Oidc__ClientId = E2E_OIDC_CLIENT_ID
  umgebung.Bootstrap__AdminEmails__0 = E2E_BOOTSTRAP_ADMIN
  return umgebung
}

/**
 * Umgebung des Systemtest-Keycloaks: Hostname wie im Browser und in der API (Issuer), Health-Endpunkte an.
 * Bewusst ohne KC_BOOTSTRAP_ADMIN_*: Die Admin-Konsole wird im Systemtest nicht gebraucht.
 */
export function baueKeycloakUmgebung() {
  return { KC_HOSTNAME: E2E_KEYCLOAK_URL, KC_HEALTH_ENABLED: 'true' }
}

/** Log-Zeile zum gestarteten Keycloak (ohne Zugangsdaten). */
export function beschreibeKeycloak() {
  return `Systemtest-Keycloak (${KEYCLOAK_IMAGE}) läuft auf ${E2E_KEYCLOAK_URL}, Realm „coin“.`
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
