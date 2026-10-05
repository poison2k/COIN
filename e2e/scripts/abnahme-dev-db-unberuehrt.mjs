// Abnahmeprüfung Feature e2e-testdatenbank (manuell auszuführen, NICHT Teil von `npm run test:skripte`).
//
// Prüft:
// - AK-2: Zeilenzahl von coin_typ und coin_bild in der Dev-DB `coin` (Compose-Container coin-db-1)
//         ist nach einem vollständigen Playwright-Lauf unverändert.
// - AK-6/AK-7: Der Lauf erfolgt mit in der Shell gesetztem ConnectionStrings__CoinDb (Dev-DB),
//         ASPNETCORE_ENVIRONMENT=Development und ASPNETCORE_URLS=http://localhost:5172.
// - AK-9: Nach dem Lauf läuft kein Testcontainers-PostgreSQL-Container mehr (Wartezeit bis 30 s).
// - AK-12 (teilweise): Die Ausgabe des Laufs enthält weder `Password=` noch eine postgres://-URI mit Zugangsdaten.
//
// Aufruf (in e2e/):  node scripts/abnahme-dev-db-unberuehrt.mjs [--ci]
//   --ci   setzt CI=1 für den Playwright-Lauf (AK-11)
// Optional: ConnectionStrings__CoinDb vorab in der Shell auf die echte Dev-DB setzen; sonst setzt das Skript
// einen Dev-DB-String mit Platzhalter-Passwort.
//
// Sicherheit: Das Skript liest die Dev-DB nur (SELECT count(*)). Es startet Playwright nur, wenn die
// Konfiguration bereits das Startskript mit Wegwerf-Datenbank verwendet, damit ein Lauf mit der alten
// Konfiguration nicht in die Dev-DB schreibt.
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setTimeout as warte } from 'node:timers/promises'

const E2E_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEV_CONTAINER = 'coin-db-1'
const TABELLEN = ['coin_typ', 'coin_bild']
const MIT_CI = process.argv.includes('--ci')

function fehler(text) {
  console.error(`ABNAHME FEHLGESCHLAGEN: ${text}`)
}

async function pruefeKonfiguration() {
  const config = (await import(new URL('../playwright.config.ts', import.meta.url).href)).default
  const server = Array.isArray(config.webServer) ? config.webServer : [config.webServer]
  const api = server.find((s) => s?.command === 'node scripts/start-api.mjs')
  if (!api || server.some((s) => s?.reuseExistingServer !== false)) {
    throw new Error(
      'playwright.config.ts nutzt noch nicht das Startskript scripts/start-api.mjs mit reuseExistingServer: false. ' +
        'Abbruch, ohne Playwright zu starten, damit die Dev-DB nicht verändert wird.',
    )
  }
}

function zaehleDevDb() {
  const sql = TABELLEN.map((t) => `(select count(*) from ${t})`).join(` || '|' || `)
  const ausgabe = execFileSync('docker', ['exec', DEV_CONTAINER, 'psql', '-U', 'coin', '-d', 'coin', '-tAc', `select ${sql}`], {
    encoding: 'utf8',
  }).trim()
  const werte = ausgabe.split('|').map(Number)
  if (werte.length !== TABELLEN.length || werte.some((n) => !Number.isInteger(n))) {
    throw new Error(`Unerwartete Ausgabe von psql: ${ausgabe}`)
  }
  return Object.fromEntries(TABELLEN.map((t, i) => [t, werte[i]]))
}

function laufendeTestcontainer() {
  return execFileSync(
    'docker',
    ['ps', '-q', '--filter', 'label=org.testcontainers=true', '--filter', 'ancestor=postgres:17'],
    { encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .filter(Boolean)
}

function playwrightLauf() {
  const env = {
    ...process.env,
    ConnectionStrings__CoinDb:
      process.env.ConnectionStrings__CoinDb ?? 'Host=localhost;Port=5432;Database=coin;Username=coin;Password=platzhalter',
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: 'http://localhost:5172',
  }
  if (MIT_CI) env.CI = '1'
  return new Promise((resolve) => {
    let ausgabe = ''
    // Einzelner Befehlsstring mit shell: true (npx ist unter Windows ein .cmd); vermeidet DEP0190 (args + shell).
    const kind = spawn('npx playwright test', { cwd: E2E_DIR, env, shell: true })
    for (const strom of [kind.stdout, kind.stderr]) {
      strom.on('data', (chunk) => {
        ausgabe += chunk
        process.stdout.write(chunk)
      })
    }
    kind.on('close', (code) => resolve({ code: code ?? 1, ausgabe }))
  })
}

async function main() {
  let ok = true

  await pruefeKonfiguration()

  const vorher = zaehleDevDb()
  console.log(`Dev-DB vorher: ${JSON.stringify(vorher)}`)

  const { code, ausgabe } = await playwrightLauf()
  if (code !== 0) {
    ok = false
    fehler(`Playwright-Lauf endete mit Exit-Code ${code}.`)
  }

  const nachher = zaehleDevDb()
  console.log(`Dev-DB nachher: ${JSON.stringify(nachher)}`)
  for (const t of TABELLEN) {
    if (vorher[t] !== nachher[t]) {
      ok = false
      fehler(`AK-2: Zeilenzahl von ${t} in der Dev-DB hat sich geändert (${vorher[t]} -> ${nachher[t]}).`)
    }
  }

  // AK-12: Geprüft wird nur stdout/stderr des Laufs (inkl. webServer-Ausgabe), nicht der HTML-Report.
  // Playwright schreibt die webServer-Ausgabe nicht in den Report; den Report ggf. manuell durchsehen.
  if (/Password=/i.test(ausgabe) || /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i.test(ausgabe)) {
    ok = false
    fehler('AK-12: Die Ausgabe des Laufs enthält einen Connection-String oder ein Passwort.')
  }

  let container = laufendeTestcontainer()
  for (let i = 0; i < 30 && container.length > 0; i++) {
    await warte(1000)
    container = laufendeTestcontainer()
  }
  if (container.length > 0) {
    ok = false
    fehler(`AK-9: Nach 30 s laufen noch Systemtest-Container: ${container.join(', ')}`)
  }

  console.log(ok ? 'ABNAHME BESTANDEN (AK-2, AK-6, AK-7, AK-9, AK-12 Ausgabe).' : 'ABNAHME NICHT BESTANDEN.')
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => {
  fehler(e instanceof Error ? e.message : String(e))
  process.exitCode = 2
})
