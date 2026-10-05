// Tests für die Leer-/Erreichbarkeitsprüfung, die globalSetup vor dem ersten Test ausführt.
// Feature e2e-testdatenbank: AK-1, AK-5.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ABBRUCH_MELDUNG, pruefeSystemtestDatenbankLeer } from './leer-pruefung.mjs'

const MELDUNG =
  'Systemtest-Datenbank ist nicht leer bzw. nicht erreichbar – Abbruch, um keine fremde Datenbank zu verändern'

function antwort(status, body) {
  return async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

function erwarteAbbruch(fehler) {
  assert.ok(fehler instanceof Error)
  assert.ok(fehler.message.startsWith(MELDUNG), `unerwartete Meldung: ${fehler.message}`)
  return true
}

describe('ABBRUCH_MELDUNG', () => {
  test('entspricht dem Wortlaut aus AK-5', () => {
    assert.equal(ABBRUCH_MELDUNG, MELDUNG)
  })
})

describe('pruefeSystemtestDatenbankLeer', () => {
  test('ist erfolgreich bei Status 200 und leerem Array', async () => {
    await pruefeSystemtestDatenbankLeer({ fetch: antwort(200, []) })
  })

  test('fragt standardmäßig http://localhost:5183/api/coins ab (Kette Web → Proxy → API)', async () => {
    const aufrufe = []
    const fetch = async (url) => {
      aufrufe.push(String(url))
      return new Response('[]', { status: 200 })
    }
    await pruefeSystemtestDatenbankLeer({ fetch })
    assert.deepEqual(aufrufe, ['http://localhost:5183/api/coins'])
  })

  test('verwendet eine übergebene URL', async () => {
    const aufrufe = []
    const fetch = async (url) => {
      aufrufe.push(String(url))
      return new Response('[]', { status: 200 })
    }
    await pruefeSystemtestDatenbankLeer({ url: 'http://localhost:6000/api/coins', fetch })
    assert.deepEqual(aufrufe, ['http://localhost:6000/api/coins'])
  })

  test('bricht ab, wenn bereits Coins vorhanden sind', async () => {
    const coins = [{ id: 1, name: 'Synthetischer Coin', herausgeber: 'Testherausgeber' }]
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, coins) }), erwarteAbbruch)
  })

  test('bricht bei Status 500 ab', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(500, []) }), erwarteAbbruch)
  })

  test('bricht bei Status 404 ab', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(404, []) }), erwarteAbbruch)
  })

  test('bricht bei Status 204 ohne Inhalt ab', async () => {
    const fetch = async () => new Response(null, { status: 204 })
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch }), erwarteAbbruch)
  })

  test('bricht ab, wenn der Server nicht erreichbar ist', async () => {
    const fetch = async () => {
      throw new TypeError('fetch failed')
    }
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch }), erwarteAbbruch)
  })

  test('bricht ab, wenn die Antwort kein JSON ist (z. B. index.html des Dev-Servers)', async () => {
    await assert.rejects(
      pruefeSystemtestDatenbankLeer({ fetch: antwort(200, '<!doctype html><html></html>') }),
      erwarteAbbruch,
    )
  })

  test('bricht ab, wenn die Antwort ein Objekt statt eines Arrays ist', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, {}) }), erwarteAbbruch)
  })

  test('bricht ab, wenn die Antwort null ist', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, null) }), erwarteAbbruch)
  })

  test('nutzt ohne übergebenes fetch das globale fetch zum Aufrufzeitpunkt', async () => {
    const original = globalThis.fetch
    let aufgerufen = false
    globalThis.fetch = async () => {
      aufgerufen = true
      return new Response('[]', { status: 200 })
    }
    try {
      await pruefeSystemtestDatenbankLeer()
    } finally {
      globalThis.fetch = original
    }
    assert.ok(aufgerufen)
  })
})
