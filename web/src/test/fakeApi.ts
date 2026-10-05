import { vi } from 'vitest'
import type { Coin } from '../api/types'

/** Eine vom Frontend an die API gesendete Anfrage, wie sie der Fake-Server gesehen hat. */
export interface Anfrage {
  methode: string
  pfad: string
  headers: Headers
  body: unknown
}

type Antwortgeber = (anfrage: Anfrage) => Response | Promise<Response>

/** Erzeugt eine JSON-Antwort. */
export function jsonAntwort(status: number, body: unknown, contentType = 'application/json'): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  })
}

/** Erzeugt eine ProblemDetails-Antwort (RFC 9457). */
export function problemAntwort(status: number, zusatz: Record<string, unknown> = {}): Response {
  return jsonAntwort(status, { type: 'about:blank', title: 'Fehler', status, ...zusatz }, 'application/problem+json')
}

/** Ein Promise, das der Test selbst auflöst (für Zustände „während des Sendens/Ladens“). */
export function offeneAntwort(): { promise: Promise<Response>; aufloesen: (antwort: Response) => void } {
  let aufloesen!: (antwort: Response) => void
  const promise = new Promise<Response>((resolve) => {
    aufloesen = resolve
  })
  return { promise, aufloesen }
}

/** Synthetischer Coin für Tests (keine echten Personendaten). */
export function testCoin(teil: Partial<Coin> = {}): Coin {
  return {
    id: '0199a1b2-0000-7000-8000-000000000001',
    name: 'Coin Alpha',
    herausgeber: 'Herausgeber Beta',
    auflage: 250,
    beschreibung: null,
    erstelltAm: '2026-10-05T12:00:00+00:00',
    bildUrl: null,
    ...teil,
  }
}

/** Synthetische Bilddatei; die Größe kann ohne echten Speicherbedarf vorgegeben werden. */
export function testDatei(typ = 'image/png', groesse?: number, name = 'motiv.png'): File {
  const datei = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: typ })
  if (groesse !== undefined) {
    Object.defineProperty(datei, 'size', { value: groesse })
  }
  return datei
}

function pfadVon(input: unknown): string {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as Request).url)
  return new URL(url, 'http://localhost').pathname
}

function bodyVon(init: RequestInit | undefined): unknown {
  const body = init?.body
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
  return body ?? null
}

/**
 * In-Memory-Nachbildung der Coin-API. Standardverhalten:
 * GET /api/coins → Liste (nach Name sortiert), POST /api/coins → 201,
 * PUT /api/coins/{id}/bild → 200 mit gesetzter bildUrl bzw. 404.
 * Mit `einmal(...)` lässt sich die nächste passende Antwort überschreiben.
 */
export function erstelleFakeApi(startCoins: Coin[] = []) {
  const coins: Coin[] = [...startCoins]
  const anfragen: Anfrage[] = []
  const ueberschreibungen: Array<{ methode: string; pfad: RegExp; antwort: Antwortgeber }> = []
  let zaehler = 0

  const standard: Antwortgeber = (anfrage) => {
    if (anfrage.methode === 'GET' && anfrage.pfad === '/api/coins') {
      const sortiert = [...coins].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      return jsonAntwort(200, sortiert)
    }
    if (anfrage.methode === 'POST' && anfrage.pfad === '/api/coins') {
      const daten = anfrage.body as { name: string; herausgeber: string; auflage: number | null; beschreibung: string | null }
      zaehler++
      const coin: Coin = {
        id: `0199a1b2-0000-7000-8000-${String(zaehler).padStart(12, '0')}`,
        name: daten.name.trim(),
        herausgeber: daten.herausgeber.trim(),
        auflage: daten.auflage ?? null,
        beschreibung: daten.beschreibung?.trim() || null,
        erstelltAm: '2026-10-05T12:00:00+00:00',
        bildUrl: null,
      }
      coins.push(coin)
      return jsonAntwort(201, coin)
    }
    const bild = /^\/api\/coins\/([^/]+)\/bild$/.exec(anfrage.pfad)
    if (anfrage.methode === 'PUT' && bild) {
      const coin = coins.find((c) => c.id === bild[1])
      if (!coin) {
        return problemAntwort(404)
      }
      zaehler++
      coin.bildUrl = `/api/coins/${coin.id}/bild?v=${String(zaehler).padStart(16, 'a')}`
      return jsonAntwort(200, { ...coin })
    }
    return problemAntwort(404)
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const anfrage: Anfrage = {
      methode: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
      pfad: pfadVon(input),
      headers: new Headers(init?.headers),
      body: bodyVon(init),
    }
    anfragen.push(anfrage)
    const index = ueberschreibungen.findIndex((u) => u.methode === anfrage.methode && u.pfad.test(anfrage.pfad))
    if (index >= 0) {
      const [ueberschreibung] = ueberschreibungen.splice(index, 1)
      return ueberschreibung.antwort(anfrage)
    }
    return standard(anfrage)
  })

  return {
    fetch: fetchMock,
    coins,
    anfragen,
    /** Überschreibt die nächste Antwort für Methode und Pfad (einmalig). */
    einmal(methode: string, pfad: RegExp, antwort: Antwortgeber | Promise<Response> | Response) {
      ueberschreibungen.push({
        methode,
        pfad,
        antwort: typeof antwort === 'function' ? antwort : () => antwort,
      })
    },
    /** Lässt die nächste passende Anfrage mit einem Netzwerkfehler scheitern. */
    netzwerkfehler(methode: string, pfad: RegExp) {
      ueberschreibungen.push({ methode, pfad, antwort: () => Promise.reject(new TypeError('Failed to fetch')) })
    },
    anfragenMit(methode: string, pfad?: RegExp): Anfrage[] {
      return anfragen.filter((a) => a.methode === methode && (!pfad || pfad.test(a.pfad)))
    },
    /** Wendet die Standard-Logik an (z. B. aus einer Überschreibung heraus verzögert). */
    standard,
  }
}

export type FakeApi = ReturnType<typeof erstelleFakeApi>
