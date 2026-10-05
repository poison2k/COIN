// Tests für e2e/global-setup.ts (wird per Node-Type-Stripping geladen; nur löschbare TS-Syntax verwenden).
// Feature e2e-testdatenbank: AK-1, AK-5.
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'

const MELDUNG =
  'Systemtest-Datenbank ist nicht leer bzw. nicht erreichbar – Abbruch, um keine fremde Datenbank zu verändern'

const originalFetch = globalThis.fetch

async function ladeGlobalSetup() {
  const modul = await import('../global-setup.ts')
  assert.equal(typeof modul.default, 'function', 'global-setup.ts muss eine Funktion als default exportieren')
  return modul.default
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('globalSetup', () => {
  test('prüft GET http://localhost:5183/api/coins', async () => {
    const aufrufe = []
    globalThis.fetch = async (url) => {
      aufrufe.push(String(url))
      return new Response('[]', { status: 200 })
    }
    const globalSetup = await ladeGlobalSetup()
    await globalSetup({})
    assert.deepEqual(aufrufe, ['http://localhost:5183/api/coins'])
  })

  test('läuft durch, wenn die Systemtest-Datenbank leer ist', async () => {
    globalThis.fetch = async () => new Response('[]', { status: 200 })
    const globalSetup = await ladeGlobalSetup()
    await globalSetup({})
  })

  test('bricht mit der Meldung aus AK-5 ab, wenn bereits Coins vorhanden sind', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify([{ id: 1, name: 'Synthetischer Coin' }]), { status: 200 })
    const globalSetup = await ladeGlobalSetup()
    await assert.rejects(globalSetup({}), (e) => e instanceof Error && e.message.startsWith(MELDUNG))
  })

  test('bricht mit der Meldung aus AK-5 ab, wenn die Kette nicht erreichbar ist', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed')
    }
    const globalSetup = await ladeGlobalSetup()
    await assert.rejects(globalSetup({}), (e) => e instanceof Error && e.message.startsWith(MELDUNG))
  })
})
