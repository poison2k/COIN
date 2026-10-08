import { vi } from 'vitest'
import type { AuditEintrag } from '@/entities/audit'
import type { Benutzer, BenutzerEintrag, Rolle } from '@/entities/benutzer'
import type { Coin } from '@/entities/coin'

/** Eine vom Frontend an die API gesendete Anfrage, wie sie der Fake-Server gesehen hat. */
export interface Anfrage {
  methode: string
  pfad: string
  /** Query-Parameter der URL (rollen-benutzerverwaltung: Suche, Paging). */
  query: URLSearchParams
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

function urlVon(input: unknown): URL {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as Request).url)
  return new URL(url, 'http://localhost')
}

/** Synthetischer Eintrag der Benutzerliste (rollen-benutzerverwaltung, AK-11; keine echten Personendaten). */
export function testBenutzerEintrag(teil: Partial<BenutzerEintrag> = {}): BenutzerEintrag {
  return {
    id: '0199a1b2-0000-7000-8000-00000000b001',
    name: 'Test Person',
    email: 'person@test.local',
    rolle: 'keine',
    aktiv: true,
    erstelltAm: '2026-10-05T12:00:00+00:00',
    ...teil,
  }
}

/** Synthetischer Audit-Eintrag (rollen-benutzerverwaltung, AK-14). */
export function testAuditEintrag(teil: Partial<AuditEintrag> = {}): AuditEintrag {
  return {
    id: '0199a1b2-0000-7000-8000-00000000c001',
    zeitpunkt: '2026-10-05T12:34:56+00:00',
    akteur: { id: '0199a1b2-0000-7000-8000-00000000a001', name: 'Test Administrator' },
    benutzer: { id: '0199a1b2-0000-7000-8000-00000000b001', name: 'Test Person' },
    art: 'Rolle',
    alt: 'keine',
    neu: 'Betrachter',
    ...teil,
  }
}

/** Antwort 403 laut AK-6 (ProblemDetails mit code). */
export function keinZugriffAntwort(code: 'benutzer_deaktiviert' | 'keine_berechtigung'): Response {
  return problemAntwort(403, {
    title: 'Kein Zugriff',
    code,
    detail:
      code === 'benutzer_deaktiviert'
        ? 'Ihr Benutzerkonto ist deaktiviert.'
        : 'Ihr Benutzerkonto ist nicht berechtigt, Benutzer zu verwalten.',
  })
}

/** Antwort 409 laut AK-15/AK-16 (ProblemDetails mit code). */
export function konfliktAntwort(code: 'letzter_administrator' | 'eigenes_konto'): Response {
  return problemAntwort(409, { title: 'Änderung nicht möglich', code })
}

/** Eine Seite im Format der API (Benutzerliste, Audit-Log, seit katalog-seiten auch GET /api/coins). */
export function seiteAntwort<T>(eintraege: T[], teil: { gesamt?: number; seite?: number; groesse?: number } = {}) {
  return { eintraege, gesamt: teil.gesamt ?? eintraege.length, seite: teil.seite ?? 1, groesse: teil.groesse ?? 25 }
}

function seiteVon<T>(alle: T[], query: URLSearchParams) {
  const seite = Number(query.get('seite') ?? '1')
  const groesse = Number(query.get('groesse') ?? '25')
  return { eintraege: alle.slice((seite - 1) * groesse, seite * groesse), gesamt: alle.length, seite, groesse }
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
 * In-Memory-Nachbildung der Coin-API. Standardverhalten (rollen-benutzerverwaltung zusätzlich:
 * GET /api/benutzer mit Suche und Paging, PUT /api/benutzer/{id}/rolle|status, GET /api/audit):
 * GET /api/coins → Seite { eintraege, gesamt, seite, groesse } mit Suche (katalog-seiten, AK-1),
 * GET /api/coins/{id} → Coin bzw. 404, POST /api/coins → 201,
 * PUT /api/coins/{id}/bild → 200 mit gesetzter bildUrl bzw. 404,
 * GET /api/me → 200 mit `optionen.me` bzw. 401 ohne angemeldeten Benutzer (anmeldung-keycloak).
 * Mit `einmal(...)` lässt sich die nächste passende Antwort überschreiben.
 */
export function erstelleFakeApi(
  startCoins: Coin[] = [],
  optionen: { me?: Benutzer | null | 'deaktiviert'; benutzer?: BenutzerEintrag[]; audit?: AuditEintrag[] } = {},
) {
  const coins: Coin[] = [...startCoins]
  let me: Benutzer | null | 'deaktiviert' = optionen.me ?? null
  const benutzer: BenutzerEintrag[] = [...(optionen.benutzer ?? [])]
  const audit: AuditEintrag[] = [...(optionen.audit ?? [])]
  const anfragen: Anfrage[] = []
  const ueberschreibungen: Array<{ methode: string; pfad: RegExp; antwort: Antwortgeber }> = []
  let zaehler = 0

  const standard: Antwortgeber = (anfrage) => {
    if (anfrage.methode === 'GET' && anfrage.pfad === '/api/me') {
      if (me === 'deaktiviert') return keinZugriffAntwort('benutzer_deaktiviert')
      return me ? jsonAntwort(200, me) : problemAntwort(401, { title: 'Nicht angemeldet' })
    }
    if (anfrage.methode === 'GET' && anfrage.pfad === '/api/benutzer') {
      const suche = (anfrage.query.get('suche') ?? '').trim().toLowerCase()
      const treffer = benutzer
        .filter((b) => !suche || b.name.toLowerCase().includes(suche) || (b.email ?? '').toLowerCase().includes(suche))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
      return jsonAntwort(200, seiteVon(treffer, anfrage.query))
    }
    const benutzerAenderung = /^\/api\/benutzer\/([^/]+)\/(rolle|status)$/.exec(anfrage.pfad)
    if (anfrage.methode === 'PUT' && benutzerAenderung) {
      const index = benutzer.findIndex((b) => b.id === benutzerAenderung[1])
      if (index < 0) return problemAntwort(404, { title: 'Benutzer nicht gefunden' })
      const alt = benutzer[index]
      const daten = anfrage.body as { rolle?: Rolle; aktiv?: boolean }
      const istRolle = benutzerAenderung[2] === 'rolle'
      const neu: BenutzerEintrag = istRolle ? { ...alt, rolle: daten.rolle as Rolle } : { ...alt, aktiv: !!daten.aktiv }
      benutzer[index] = neu
      zaehler++
      audit.unshift({
        id: `0199a1b2-0000-7000-8000-${String(zaehler).padStart(12, 'c')}`,
        zeitpunkt: '2026-10-05T13:00:00+00:00',
        akteur: me && me !== 'deaktiviert' ? { id: me.id, name: me.name } : null,
        benutzer: { id: alt.id, name: alt.name },
        art: istRolle ? 'Rolle' : 'Status',
        alt: istRolle ? alt.rolle : alt.aktiv ? 'aktiv' : 'deaktiviert',
        neu: istRolle ? neu.rolle : neu.aktiv ? 'aktiv' : 'deaktiviert',
      })
      return jsonAntwort(200, neu)
    }
    if (anfrage.methode === 'GET' && anfrage.pfad === '/api/audit') {
      const benutzerId = anfrage.query.get('benutzerId')
      const treffer = audit.filter((a) => !benutzerId || a.benutzer.id === benutzerId)
      return jsonAntwort(200, seiteVon(treffer, anfrage.query))
    }
    if (anfrage.methode === 'GET' && anfrage.pfad === '/api/coins') {
      // katalog-seiten (AK-1 bis AK-3): Seiten-Format, Suche in Name oder Herausgeber, Sortierung Name, dann id.
      const suche = (anfrage.query.get('suche') ?? '').trim().toLowerCase()
      const treffer = coins
        .filter((c) => !suche || c.name.toLowerCase().includes(suche) || c.herausgeber.toLowerCase().includes(suche))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
      return jsonAntwort(200, seiteVon(treffer, anfrage.query))
    }
    const einzeln = /^\/api\/coins\/([^/]+)$/.exec(anfrage.pfad)
    if (anfrage.methode === 'GET' && einzeln) {
      // katalog-seiten (AK-17): GET /api/coins/{id}; unbekannt → 404 „Coin nicht gefunden“.
      const coin = coins.find((c) => c.id === decodeURIComponent(einzeln[1]))
      return coin ? jsonAntwort(200, { ...coin }) : problemAntwort(404, { title: 'Coin nicht gefunden' })
    }
    if (anfrage.methode === 'POST' && anfrage.pfad === '/api/coins') {
      const daten = anfrage.body as {
        name: string
        herausgeber: string
        auflage: number | null
        beschreibung: string | null
      }
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
    const url = urlVon(input)
    const anfrage: Anfrage = {
      methode: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(),
      pfad: url.pathname,
      query: url.searchParams,
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
    /** Benutzer der Verwaltung (rollen-benutzerverwaltung); Änderungen per PUT wirken hier. */
    benutzer,
    /** Audit-Einträge, neueste zuerst; PUT auf Rolle/Status fügt vorne an. */
    audit,
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
    /** Setzt die Antwort von GET /api/me (null = 401, 'deaktiviert' = 403 benutzer_deaktiviert). */
    setzeMe(neu: Benutzer | null | 'deaktiviert') {
      me = neu
    },
  }
}

export type FakeApi = ReturnType<typeof erstelleFakeApi>
