// Tests für die reinen Hilfsfunktionen des Startskripts (scripts/start-api.mjs).
// Feature e2e-testdatenbank: AK-3, AK-6, AK-7, AK-8, AK-12.
// Alle Werte sind synthetisch; Passwörter sind Platzhalter, keine echten Zugangsdaten.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  E2E_API_URL,
  E2E_WEB_URL,
  E2E_DATENBANK,
  POSTGRES_IMAGE,
  DOCKER_FEHLERMELDUNG,
  baueConnectionString,
  baueApiUmgebung,
  baueDotnetArgumente,
  beschreibeDatenbank,
  startFehlerMeldung,
} from './e2e-umgebung.mjs'

const CONTAINER = Object.freeze({
  host: 'localhost',
  port: 49153,
  database: 'coin_e2e',
  username: 'test',
  password: 'zufallsPasswort123',
})

const CONTAINER_CS = 'Host=localhost;Port=49153;Database=coin_e2e;Username=test;Password=zufallsPasswort123'
const DEV_CS = 'Host=localhost;Port=5432;Database=coin;Username=coin;Password=devPlatzhalter'

function schluesselCaseInsensitiv(umgebung, name) {
  return Object.keys(umgebung).filter((k) => k.toLowerCase() === name.toLowerCase())
}

describe('Konstanten', () => {
  test('API-URL der Systemtests ist http://localhost:5182', () => {
    assert.equal(E2E_API_URL, 'http://localhost:5182')
  })

  test('Web-URL der Systemtests ist http://localhost:5183', () => {
    assert.equal(E2E_WEB_URL, 'http://localhost:5183')
  })

  test('Systemtest-Datenbank heißt coin_e2e und nicht wie die Dev-DB coin', () => {
    assert.equal(E2E_DATENBANK, 'coin_e2e')
  })

  test('Container-Image ist postgres:17', () => {
    assert.equal(POSTGRES_IMAGE, 'postgres:17')
  })
})

describe('baueConnectionString', () => {
  test('baut Npgsql-Key-Value-Format aus den Containerdaten', () => {
    assert.equal(baueConnectionString(CONTAINER), CONTAINER_CS)
  })

  test('liefert kein postgres://-URI-Format', () => {
    assert.doesNotMatch(baueConnectionString(CONTAINER), /^postgres(ql)?:\/\//)
  })

  test('übernimmt den Port auch als Zeichenkette', () => {
    assert.equal(baueConnectionString({ ...CONTAINER, port: '49153' }), CONTAINER_CS)
  })

  test('setzt Passwort mit Semikolon in doppelte Anführungszeichen', () => {
    const cs = baueConnectionString({ ...CONTAINER, password: 'ab;cd' })
    assert.match(cs, /;Password="ab;cd"$/)
  })

  test('verdoppelt Anführungszeichen in einem gequoteten Passwort', () => {
    const cs = baueConnectionString({ ...CONTAINER, password: 'ab"c;d' })
    assert.match(cs, /;Password="ab""c;d"$/)
  })

  test('wirft bei fehlendem Passwort', () => {
    assert.throws(() => baueConnectionString({ ...CONTAINER, password: '' }))
  })

  test('wirft bei fehlendem Host', () => {
    assert.throws(() => baueConnectionString({ ...CONTAINER, host: undefined }))
  })
})

describe('baueApiUmgebung', () => {
  test('setzt ASPNETCORE_ENVIRONMENT auf Testing', () => {
    const env = baueApiUmgebung({}, CONTAINER_CS)
    assert.equal(env.ASPNETCORE_ENVIRONMENT, 'Testing')
  })

  test('überschreibt ein in der Shell gesetztes ASPNETCORE_ENVIRONMENT=Development', () => {
    const env = baueApiUmgebung({ ASPNETCORE_ENVIRONMENT: 'Development' }, CONTAINER_CS)
    assert.equal(env.ASPNETCORE_ENVIRONMENT, 'Testing')
  })

  test('setzt ASPNETCORE_URLS auf http://localhost:5182', () => {
    const env = baueApiUmgebung({}, CONTAINER_CS)
    assert.equal(env.ASPNETCORE_URLS, 'http://localhost:5182')
  })

  test('überschreibt ein in der Shell gesetztes ASPNETCORE_URLS', () => {
    const env = baueApiUmgebung({ ASPNETCORE_URLS: 'http://localhost:5172' }, CONTAINER_CS)
    assert.equal(env.ASPNETCORE_URLS, 'http://localhost:5182')
  })

  test('setzt ConnectionStrings__CoinDb auf den Container-Connection-String', () => {
    const env = baueApiUmgebung({}, CONTAINER_CS)
    assert.equal(env.ConnectionStrings__CoinDb, CONTAINER_CS)
  })

  test('überschreibt ein in der Shell gesetztes ConnectionStrings__CoinDb auf die Dev-DB', () => {
    const env = baueApiUmgebung({ ConnectionStrings__CoinDb: DEV_CS }, CONTAINER_CS)
    assert.equal(env.ConnectionStrings__CoinDb, CONTAINER_CS)
  })

  test('entfernt abweichend geschriebene Varianten von ConnectionStrings__CoinDb (Windows ist case-insensitiv)', () => {
    const env = baueApiUmgebung({ connectionstrings__coindb: DEV_CS }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ConnectionStrings__CoinDb'), ['ConnectionStrings__CoinDb'])
  })

  test('entfernt abweichend geschriebene Varianten von ASPNETCORE_ENVIRONMENT', () => {
    const env = baueApiUmgebung({ aspnetcore_environment: 'Development' }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ASPNETCORE_ENVIRONMENT'), ['ASPNETCORE_ENVIRONMENT'])
  })

  test('entfernt abweichend geschriebene Varianten von ASPNETCORE_URLS', () => {
    const env = baueApiUmgebung({ Aspnetcore_Urls: 'http://localhost:5172' }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ASPNETCORE_URLS'), ['ASPNETCORE_URLS'])
  })

  test('entfernt die Doppelpunkt-Schreibweise ConnectionStrings:CoinDb', () => {
    const env = baueApiUmgebung({ 'ConnectionStrings:CoinDb': DEV_CS }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ConnectionStrings:CoinDb'), [])
  })

  test('entfernt die Doppelpunkt-Schreibweise auch in Kleinschreibung (connectionstrings:coindb)', () => {
    const env = baueApiUmgebung({ 'connectionstrings:coindb': DEV_CS }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ConnectionStrings:CoinDb'), [])
  })

  test('behält nach dem Entfernen der Doppelpunkt-Schreibweise genau einen ConnectionStrings__CoinDb mit Container-String', () => {
    const env = baueApiUmgebung({ 'ConnectionStrings:CoinDb': DEV_CS }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ConnectionStrings__CoinDb'), ['ConnectionStrings__CoinDb'])
    assert.equal(env.ConnectionStrings__CoinDb, CONTAINER_CS)
  })

  test('entfernt die Doppelpunkt-Schreibweise ASPNETCORE:ENVIRONMENT', () => {
    const env = baueApiUmgebung({ 'aspnetcore:environment': 'Development' }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'ASPNETCORE:ENVIRONMENT'), [])
    assert.equal(env.ASPNETCORE_ENVIRONMENT, 'Testing')
  })

  test('entfernt POSTGRESQLCONNSTR_CoinDb, das sonst ebenfalls ConnectionStrings:CoinDb setzen würde', () => {
    const env = baueApiUmgebung({ POSTGRESQLCONNSTR_CoinDb: DEV_CS }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'POSTGRESQLCONNSTR_CoinDb'), [])
  })

  test('entfernt CUSTOMCONNSTR_CoinDb, das sonst ebenfalls ConnectionStrings:CoinDb setzen würde', () => {
    const env = baueApiUmgebung({ CUSTOMCONNSTR_CoinDb: DEV_CS }, CONTAINER_CS)
    assert.deepEqual(schluesselCaseInsensitiv(env, 'CUSTOMCONNSTR_CoinDb'), [])
  })

  test('übernimmt übrige Variablen der Basisumgebung unverändert', () => {
    const env = baueApiUmgebung({ PATH: 'C:\\bin', DOTNET_CLI_TELEMETRY_OPTOUT: '1' }, CONTAINER_CS)
    assert.equal(env.PATH, 'C:\\bin')
    assert.equal(env.DOTNET_CLI_TELEMETRY_OPTOUT, '1')
  })

  test('verändert die übergebene Basisumgebung nicht', () => {
    const basis = { ASPNETCORE_ENVIRONMENT: 'Development', ConnectionStrings__CoinDb: DEV_CS }
    baueApiUmgebung(basis, CONTAINER_CS)
    assert.deepEqual(basis, { ASPNETCORE_ENVIRONMENT: 'Development', ConnectionStrings__CoinDb: DEV_CS })
  })

  test('wirft bei leerem Connection-String statt die API ohne Datenbank zu starten', () => {
    assert.throws(() => baueApiUmgebung({}, ''))
  })
})

describe('baueDotnetArgumente', () => {
  test('startet per dotnet run', () => {
    assert.equal(baueDotnetArgumente()[0], 'run')
  })

  test('enthält --no-launch-profile', () => {
    assert.ok(baueDotnetArgumente().includes('--no-launch-profile'))
  })

  test('enthält kein --launch-profile', () => {
    assert.ok(!baueDotnetArgumente().includes('--launch-profile'))
  })

  test('baut in der Konfiguration Release', () => {
    const args = baueDotnetArgumente()
    const i = args.findIndex((a) => a === '-c' || a === '--configuration')
    assert.notEqual(i, -1)
    assert.equal(args[i + 1], 'Release')
  })

  test('verweist mit --project auf src/Coin.Api', () => {
    const args = baueDotnetArgumente()
    const i = args.indexOf('--project')
    assert.notEqual(i, -1)
    assert.match(args[i + 1].replaceAll('\\', '/'), /src\/Coin\.Api\/?$/)
  })
})

describe('beschreibeDatenbank (Log-Ausgabe, AK-12)', () => {
  test('enthält das Passwort nicht', () => {
    assert.ok(!beschreibeDatenbank(CONTAINER).includes(CONTAINER.password))
  })

  test('enthält keinen Connection-String', () => {
    const text = beschreibeDatenbank(CONTAINER)
    assert.ok(!text.includes(CONTAINER_CS))
    assert.doesNotMatch(text, /Password=/i)
  })

  test('nennt den gemappten Port, damit der Lauf nachvollziehbar bleibt', () => {
    assert.match(beschreibeDatenbank(CONTAINER), /49153/)
  })
})

describe('Docker-Fehlermeldung (AK-8)', () => {
  test('DOCKER_FEHLERMELDUNG enthält den Hinweis „Docker starten“', () => {
    assert.match(DOCKER_FEHLERMELDUNG, /Docker starten/)
  })

  test('startFehlerMeldung enthält den Hinweis „Docker starten“', () => {
    const text = startFehlerMeldung(new Error('Could not find a working container runtime strategy'))
    assert.match(text, /Docker starten/)
  })

  test('startFehlerMeldung enthält die ursprüngliche Fehlerursache', () => {
    const text = startFehlerMeldung(new Error('Could not find a working container runtime strategy'))
    assert.match(text, /Could not find a working container runtime strategy/)
  })

  test('startFehlerMeldung kommt auch mit Nicht-Error-Werten zurecht', () => {
    assert.match(startFehlerMeldung('kaputt'), /Docker starten/)
  })
})

// Feature anmeldung-keycloak (QA-Hinweis H7): WebApplication liest auch ASPNETCORE_- und DOTNET_-präfixierte
// Umgebungsvariablen als Konfiguration (Präfix wird entfernt). Geerbte Varianten dürfen die API nicht umkonfigurieren.
describe('baueApiUmgebung – präfixierte Varianten (ASPNETCORE_, DOTNET_)', () => {
  const praefixiert = [
    'ASPNETCORE_Bootstrap__AdminEmails__1',
    'DOTNET_Bootstrap__AdminEmails__0',
    'DOTNET_Oidc__Authority',
    'ASPNETCORE_Oidc__Audience',
    'dotnet_oidc__clientid',
    'ASPNETCORE_Frontend__Ursprung',
    'DOTNET_Authentication__Schemes__Bearer__Authority',
    'ASPNETCORE_Authentication__Schemes__Bearer__ValidAudiences__0',
    'DOTNET_ConnectionStrings__CoinDb',
    'ASPNETCORE_ConnectionStrings__CoinDb',
  ]

  for (const name of praefixiert) {
    test(`entfernt ${name}`, () => {
      const env = baueApiUmgebung({ [name]: 'http://boese.example' }, CONTAINER_CS)
      assert.deepEqual(schluesselCaseInsensitiv(env, name), [])
    })
  }

  test('behält die eigenen Werte, wenn präfixierte Varianten geerbt wurden', () => {
    const env = baueApiUmgebung({ DOTNET_Oidc__Authority: 'http://boese.example' }, CONTAINER_CS)
    assert.equal(env.Oidc__Authority, 'http://localhost:5184/realms/coin')
  })

  test('behält unbeteiligte ASPNETCORE_- und DOTNET_-Variablen (z. B. DOTNET_CLI_TELEMETRY_OPTOUT)', () => {
    const env = baueApiUmgebung({ DOTNET_CLI_TELEMETRY_OPTOUT: '1' }, CONTAINER_CS)
    assert.equal(env.DOTNET_CLI_TELEMETRY_OPTOUT, '1')
  })
})
