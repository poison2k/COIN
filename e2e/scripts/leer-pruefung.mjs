// Leer- und Erreichbarkeitsprüfung der Systemtest-Datenbank (AK-1, AK-5).
// Wird von global-setup.ts vor dem ersten Test aufgerufen.
export const ABBRUCH_MELDUNG =
  'Systemtest-Datenbank ist nicht leer bzw. nicht erreichbar – Abbruch, um keine fremde Datenbank zu verändern'

function abbruch(grund) {
  return new Error(`${ABBRUCH_MELDUNG} (${grund})`)
}

/**
 * Prüft über die Kette Web → Proxy → API → DB, dass GET /api/coins 200 mit leerem Array liefert.
 * Wirft sonst einen Error, dessen Meldung mit ABBRUCH_MELDUNG beginnt.
 */
export async function pruefeSystemtestDatenbankLeer({ url = 'http://localhost:5183/api/coins', fetch } = {}) {
  const abrufen = fetch ?? globalThis.fetch

  let antwort
  try {
    antwort = await abrufen(url)
  } catch (e) {
    throw abbruch(`nicht erreichbar: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (antwort.status !== 200) {
    throw abbruch(`HTTP-Status ${antwort.status}`)
  }

  let daten
  try {
    daten = JSON.parse(await antwort.text())
  } catch {
    throw abbruch('Antwort ist kein JSON')
  }

  if (!Array.isArray(daten)) {
    throw abbruch('Antwort ist keine Liste')
  }
  if (daten.length !== 0) {
    throw abbruch(`${daten.length} Coin(s) bereits vorhanden`)
  }
}
