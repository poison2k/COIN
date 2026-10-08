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

// Leere Seite im Format von GET /api/coins (katalog-seiten, AK-1/F7).
const LEERE_SEITE = { eintraege: [], gesamt: 0, seite: 1, groesse: 25 }
const LEERE_SEITE_JSON = JSON.stringify(LEERE_SEITE)

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
  test('ist erfolgreich bei Status 200 und leerer Seite', async () => {
    await pruefeSystemtestDatenbankLeer({ fetch: antwort(200, LEERE_SEITE) })
  })

  test('fragt standardmäßig http://localhost:5183/api/coins ab (Kette Web → Proxy → API)', async () => {
    const aufrufe = []
    const fetch = async (url) => {
      aufrufe.push(String(url))
      return new Response(LEERE_SEITE_JSON, { status: 200 })
    }
    await pruefeSystemtestDatenbankLeer({ fetch })
    assert.deepEqual(aufrufe, ['http://localhost:5183/api/coins'])
  })

  test('verwendet eine übergebene URL', async () => {
    const aufrufe = []
    const fetch = async (url) => {
      aufrufe.push(String(url))
      return new Response(LEERE_SEITE_JSON, { status: 200 })
    }
    await pruefeSystemtestDatenbankLeer({ url: 'http://localhost:6000/api/coins', fetch })
    assert.deepEqual(aufrufe, ['http://localhost:6000/api/coins'])
  })

  test('bricht ab, wenn bereits Coins vorhanden sind', async () => {
    const coins = [{ id: 1, name: 'Synthetischer Coin', herausgeber: 'Testherausgeber' }]
    const seite = { eintraege: coins, gesamt: 1, seite: 1, groesse: 25 }
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, seite) }), erwarteAbbruch)
  })

  test('bricht ab, wenn gesamt Coins meldet, auch wenn eintraege leer ist', async () => {
    const seite = { eintraege: [], gesamt: 3, seite: 1, groesse: 25 }
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, seite) }), erwarteAbbruch)
  })

  test('bricht ab, wenn die Antwort noch das alte Array-Format hat', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, []) }), erwarteAbbruch)
  })

  test('bricht ab, wenn gesamt fehlt', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(200, { eintraege: [] }) }), erwarteAbbruch)
  })

  test('bricht bei Status 500 ab', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(500, LEERE_SEITE) }), erwarteAbbruch)
  })

  test('bricht bei Status 404 ab', async () => {
    await assert.rejects(pruefeSystemtestDatenbankLeer({ fetch: antwort(404, LEERE_SEITE) }), erwarteAbbruch)
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

  test('bricht ab, wenn die Antwort ein leeres Objekt ohne eintraege ist', async () => {
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
      return new Response(LEERE_SEITE_JSON, { status: 200 })
    }
    try {
      await pruefeSystemtestDatenbankLeer()
    } finally {
      globalThis.fetch = original
    }
    assert.ok(aufgerufen)
  })
})
