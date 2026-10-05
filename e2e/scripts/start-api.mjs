// Startskript der Systemtest-API (webServer-Kommando in playwright.config.ts).
// Feature e2e-testdatenbank, ADR-0007:
// 1. Startet einen frischen PostgreSQL-Container (Testcontainers) mit zufälligem Passwort.
// 2. Startet die API (`dotnet run`, Release, ohne Launch-Profil, Umgebung Testing, Port 5182)
//    mit dem Connection-String dieses Containers. Migrationen laufen in Testing beim Start.
// 3. Beendet beim Abbruch (SIGINT/SIGTERM) oder Ende der API beide sauber; Ryuk räumt
//    den Container auf, falls dieser Prozess hart beendet wird (AK-9).
// Connection-String und Passwort werden nie ausgegeben (AK-12).
// Erwartet: Bei der ersten Migration auf der leeren DB protokolliert EF Core einmalig einen
// „fail … __ef_migrations_history“-Eintrag (Tabelle existiert noch nicht). Das SQL-Protokoll bleibt
// bewusst auf Warning statt ganz aus, damit echte Datenbankfehler in der Ausgabe sichtbar bleiben.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import {
  E2E_DATENBANK,
  POSTGRES_IMAGE,
  baueApiUmgebung,
  baueConnectionString,
  baueDotnetArgumente,
  beschreibeDatenbank,
  startFehlerMeldung,
} from './e2e-umgebung.mjs'

let container
let api
let beendet = false

// Playwright beendet den webServer per gracefulShutdown (SIGTERM) – unter POSIX greifen dann die
// Handler unten. Unter Windows beendet Playwright den Prozessbaum hart (taskkill /T /F); die
// Handler laufen dann nicht, und Ryuk entfernt den Container kurz danach (AK-9).
function stoppeApi() {
  if (!api || api.exitCode !== null || api.signalCode !== null) return
  if (process.platform === 'win32') {
    // `dotnet run` startet die API als eigenen Kindprozess; nur den ganzen Prozessbaum beenden,
    // sonst bleibt Coin.Api.exe auf Port 5182 übrig.
    spawnSync('taskkill', ['/pid', String(api.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    api.kill('SIGTERM')
  }
}

async function stoppeContainer() {
  const c = container
  container = undefined
  if (!c) return
  try {
    await c.stop({ timeout: 5_000 })
  } catch (e) {
    console.error(`Systemtest-Datenbank konnte nicht gestoppt werden (Ryuk räumt auf): ${e instanceof Error ? e.message : e}`)
  }
}

async function beenden(exitCode) {
  if (beendet) return
  beendet = true
  stoppeApi()
  await stoppeContainer()
  process.exit(exitCode)
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => void beenden(130))
}

async function main() {
  try {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase(E2E_DATENBANK)
      .withPassword(randomBytes(24).toString('hex'))
      .start()
  } catch (e) {
    console.error(startFehlerMeldung(e))
    await beenden(1)
    return
  }
  if (beendet) return

  const daten = {
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    username: container.getUsername(),
    password: container.getPassword(),
  }
  console.log(beschreibeDatenbank(daten))

  const umgebung = baueApiUmgebung(process.env, baueConnectionString(daten))
  // SQL-Protokoll wie in Development dämpfen, damit die Playwright-Ausgabe lesbar bleibt.
  umgebung['Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command'] = 'Warning'
  api = spawn('dotnet', baueDotnetArgumente(), { env: umgebung, stdio: 'inherit' })
  api.on('error', (e) => {
    console.error(`API konnte nicht gestartet werden (dotnet installiert?): ${e.message}`)
    void beenden(1)
  })
  api.on('exit', (code, signal) => {
    if (!beendet) console.error(`API beendet (Exit-Code ${code ?? signal}).`)
    void beenden(code ?? 1)
  })
}

main().catch(async (e) => {
  console.error(`Startskript der Systemtest-API fehlgeschlagen: ${e instanceof Error ? e.message : e}`)
  await beenden(1)
})
