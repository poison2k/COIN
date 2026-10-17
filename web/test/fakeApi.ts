import { vi } from 'vitest'
import type { AuditEintrag } from '@/entities/audit'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Benutzer, BenutzerEintrag, Rolle } from '@/entities/benutzer'
import type { Coin } from '@/entities/coin'
import type { VorlagenStatus, VorlagenVersion } from '@/entities/zertifikatsvorlage'

/** Content-Type von DOCX-Downloads (zertifikatsvorlagen, AK-6). */
export const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Synthetische Version einer Zertifikatsvorlage (zertifikatsvorlagen, Abschnitt 5.3; keine echten Personendaten). */
export function testVorlagenVersion(teil: Partial<VorlagenVersion> = {}): VorlagenVersion {
  return {
    version: 1,
    groesseBytes: 48211,
    hochgeladenAm: '2026-10-09T09:00:00.123456+00:00',
    hochgeladenVon: { id: '0199a1b2-0000-7000-8000-00000000a002', name: 'Test Sachbearbeiter' },
    aktiv: true,
    ...teil,
  }
}

/** Vorlagenstatus aus Versionen (neueste zuerst) und aktiver Version (`null` = Standardvorlage). */
export function testVorlagenStatus(
  versionen: VorlagenVersion[] = [],
  aktiveVersion: number | null = null,
): VorlagenStatus {
  return {
    quelle: aktiveVersion === null ? 'standard' : 'eigene',
    aktiveVersion,
    versionen: versionen.map((v) => ({ ...v, aktiv: v.version === aktiveVersion })),
  }
}

/**
 * Antwort mit einem DOCX-Download (Inhalt synthetisch, Header laut AK-6). Der Body ist ein `Uint8Array`, kein `Blob`:
 * Ein jsdom-`Blob` wird von der Node-`Response` nicht erkannt und als Text „[object Blob]“ serialisiert.
 */
export function docxAntwort(dateiname: string, inhalt = 'PK-test-docx'): Response {
  return new Response(new TextEncoder().encode(inhalt), {
    status: 200,
    headers: {
      'Content-Type': DOCX_TYP,
      'Content-Disposition': `attachment; filename="${dateiname}"`,
      'Cache-Control': 'no-store',
    },
  })
}

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

/** Zertifikatsnummer zu einem Exemplar im Format von zertifikat-erzeugen (AK-3), Kennung des Test-Coins C0042. */
export function testZertifikatsnummer(exemplar: number, kennung = 'C0042'): string {
  return `${kennung}-${String(exemplar).padStart(4, '0')}`
}

/**
 * Synthetische Ausgabe (coin-ausgaben, Abschnitt 5.2; keine echten Personendaten). Ohne Angabe aktiv, Exemplar Nr. 1.
 * Seit zertifikat-erzeugen (Abschnitt 5.3) mit `zertifikatsnummer` (aus der Exemplar-Nummer gebildet).
 */
export function testAusgabe(teil: Partial<Ausgabe> = {}): Ausgabe {
  return {
    id: '0199a1b2-0000-7000-8000-00000000e001',
    exemplarNummer: teil.exemplarNummer ?? 1,
    zertifikatsnummer: testZertifikatsnummer(teil.exemplarNummer ?? 1),
    empfaenger: { name: 'Max Beispiel', dienstgrad: 'Hauptmann', dienststelle: 'Beispielbataillon 1' },
    datum: '2026-10-01',
    gelegenheit: 'Truppenbesuch',
    begruendung: 'Herausragende Leistung',
    ausgebendeStelle: 'Kommandeur Beispielbataillon 1',
    erfasstAm: '2026-10-08T09:00:00.123456+00:00',
    erfasstVon: { id: '0199a1b2-0000-7000-8000-00000000a002', name: 'Test Sachbearbeiter' },
    storno: null,
    ...teil,
  }
}

/** Antwort 409 beim Erfassen, Stornieren oder Ändern der Auflage (coin-ausgaben, AK-8, AK-12, AK-17). */
export function ausgabeKonfliktAntwort(
  code: 'auflage_unbekannt' | 'exemplar_ausgegeben' | 'kein_exemplar_frei' | 'bereits_storniert' | 'auflage_zu_klein',
  detail = 'Konflikt',
): Response {
  const title = code === 'auflage_zu_klein' ? 'Änderung nicht möglich' : 'Ausgabe nicht möglich'
  return problemAntwort(409, { title, code, detail })
}

/** Antwort 409 beim Zertifikat-Download (zertifikat-erzeugen, Abschnitt 5.2). */
export function zertifikatKonfliktAntwort(
  code: 'ausgabe_storniert' | 'vorlage_zu_viele_platzhalter',
  detail = code === 'ausgabe_storniert'
    ? 'Für eine stornierte Ausgabe kann kein Zertifikat heruntergeladen werden.'
    : 'Die aktive Vorlage enthält mehr als 200 Platzhalter. Bitte eine angepasste Vorlage hochladen.',
): Response {
  return problemAntwort(409, { title: 'Zertifikat nicht möglich', code, detail })
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
 * coin-ausgaben: GET …/exemplare (Kennzahlen aus Auflage und aktiven Ausgaben), GET/POST …/ausgaben,
 * POST …/ausgaben/{id}/storno, PUT …/auflage mit den 409-Fällen aus AK-8, AK-12 und AK-17.
 * zertifikat-erzeugen: GET …/ausgaben/{id} (404 „Ausgabe nicht gefunden“) und GET …/ausgaben/{id}/zertifikat
 * (DOCX `Zertifikat_{Nummer}.docx`, 409 `ausgabe_storniert` bei stornierten Ausgaben).
 * Mit `einmal(...)` lässt sich die nächste passende Antwort überschreiben.
 */
export function erstelleFakeApi(
  startCoins: Coin[] = [],
  optionen: {
    me?: Benutzer | null | 'deaktiviert'
    benutzer?: BenutzerEintrag[]
    audit?: AuditEintrag[]
    /** Ausgaben je Coin-Id, neueste zuerst (coin-ausgaben). */
    ausgaben?: Record<string, Ausgabe[]>
    /** Zertifikatsvorlagen je Coin-Id (zertifikatsvorlagen); ohne Eintrag gilt die Standardvorlage. */
    vorlagen?: Record<string, VorlagenStatus>
  } = {},
) {
  // Elemente kopieren: PUT-Handler ändern Coins in place, Modulkonstanten der Tests dürfen davon unberührt bleiben.
  const coins: Coin[] = startCoins.map((coin) => structuredClone(coin))
  let me: Benutzer | null | 'deaktiviert' = optionen.me ?? null
  const benutzer: BenutzerEintrag[] = [...(optionen.benutzer ?? [])]
  const audit: AuditEintrag[] = [...(optionen.audit ?? [])]
  const ausgaben: Record<string, Ausgabe[]> = Object.fromEntries(
    Object.entries(optionen.ausgaben ?? {}).map(([id, liste]) => [id, [...liste]]),
  )
  const vorlagen: Record<string, VorlagenStatus> = Object.fromEntries(
    Object.entries(optionen.vorlagen ?? {}).map(([id, status]) => [id, structuredClone(status)]),
  )
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
    // zertifikatsvorlagen (Abschnitt 5.1): Standardvorlage, Status, Downloads, Upload, Zurücksetzen.
    if (anfrage.methode === 'GET' && anfrage.pfad === '/api/zertifikatsvorlagen/standard') {
      return docxAntwort('zertifikatsvorlage-standard.docx', 'PK-standard')
    }
    const vorlagePfad =
      /^\/api\/coins\/([^/]+)\/zertifikatsvorlage(\/datei|\/versionen|\/versionen\/(\d+)\/datei|\/zuruecksetzen)?$/.exec(
        anfrage.pfad,
      )
    if (vorlagePfad) {
      const coinId = decodeURIComponent(vorlagePfad[1])
      if (!coins.some((c) => c.id === coinId)) return problemAntwort(404, { title: 'Coin nicht gefunden' })
      const status = (vorlagen[coinId] ??= testVorlagenStatus())
      const teil = vorlagePfad[2] ?? ''
      if (anfrage.methode === 'GET' && teil === '') return jsonAntwort(200, structuredClone(status))
      if (anfrage.methode === 'GET' && teil === '/datei') {
        return status.aktiveVersion === null
          ? docxAntwort(`zertifikatsvorlage-${coinId}-standard.docx`, 'PK-standard')
          : docxAntwort(`zertifikatsvorlage-${coinId}-v${status.aktiveVersion}.docx`, `PK-v${status.aktiveVersion}`)
      }
      if (anfrage.methode === 'GET' && vorlagePfad[3]) {
        const nummer = Number(vorlagePfad[3])
        return status.versionen.some((v) => v.version === nummer)
          ? docxAntwort(`zertifikatsvorlage-${coinId}-v${nummer}.docx`, `PK-v${nummer}`)
          : problemAntwort(404, { title: 'Vorlage nicht gefunden' })
      }
      if (anfrage.methode === 'POST' && teil === '/versionen') {
        const neu = Math.max(0, ...status.versionen.map((v) => v.version)) + 1
        const akteur =
          me && me !== 'deaktiviert' ? { id: me.id, name: me.name } : { id: 'unbekannt', name: 'Unbekannt' }
        const version = testVorlagenVersion({
          version: neu,
          groesseBytes: 40000 + neu,
          hochgeladenAm: `2026-10-09T1${neu % 10}:00:00+00:00`,
          hochgeladenVon: akteur,
        })
        vorlagen[coinId] = testVorlagenStatus([version, ...status.versionen], neu)
        return jsonAntwort(201, structuredClone(vorlagen[coinId]))
      }
      if (anfrage.methode === 'POST' && teil === '/zuruecksetzen') {
        vorlagen[coinId] = testVorlagenStatus(status.versionen, null)
        return jsonAntwort(200, structuredClone(vorlagen[coinId]))
      }
      return problemAntwort(404)
    }
    // zertifikat-erzeugen (Abschnitt 5.1): eine Ausgabe lesen, Zertifikat herunterladen (409 bei Storno).
    const einzelneAusgabe = /^\/api\/coins\/([^/]+)\/ausgaben\/([^/]+)(\/zertifikat)?$/.exec(anfrage.pfad)
    if (anfrage.methode === 'GET' && einzelneAusgabe && decodeURIComponent(einzelneAusgabe[2]) !== 'neu') {
      const coinId = decodeURIComponent(einzelneAusgabe[1])
      const ausgabe = coins.some((c) => c.id === coinId)
        ? (ausgaben[coinId] ?? []).find((a) => a.id === decodeURIComponent(einzelneAusgabe[2]))
        : undefined
      if (!ausgabe) return problemAntwort(404, { title: 'Ausgabe nicht gefunden' })
      if (!einzelneAusgabe[3]) return jsonAntwort(200, structuredClone(ausgabe))
      if (ausgabe.storno) return zertifikatKonfliktAntwort('ausgabe_storniert')
      return docxAntwort(`Zertifikat_${ausgabe.zertifikatsnummer}.docx`, `PK-zertifikat-${ausgabe.zertifikatsnummer}`)
    }
    // coin-ausgaben (Abschnitt 5): Exemplare, Historie, Erfassen, Storno, Auflage ändern.
    const ausgabenPfad = /^\/api\/coins\/([^/]+)\/(exemplare|ausgaben|auflage)$/.exec(anfrage.pfad)
    const stornoPfad = /^\/api\/coins\/([^/]+)\/ausgaben\/([^/]+)\/storno$/.exec(anfrage.pfad)
    const coinPfad = ausgabenPfad ?? stornoPfad
    if (coinPfad) {
      const coinId = decodeURIComponent(coinPfad[1])
      const coin = coins.find((c) => c.id === coinId)
      if (!coin) return problemAntwort(404, { title: stornoPfad ? 'Ausgabe nicht gefunden' : 'Coin nicht gefunden' })
      const liste = (ausgaben[coinId] ??= [])
      const aktiv = (nr: number) => liste.some((a) => a.exemplarNummer === nr && a.storno === null)
      const akteur = me && me !== 'deaktiviert' ? { id: me.id, name: me.name } : { id: 'unbekannt', name: 'Unbekannt' }
      if (stornoPfad) {
        if (anfrage.methode !== 'POST') return problemAntwort(404)
        const ausgabe = liste.find((a) => a.id === decodeURIComponent(stornoPfad[2]))
        if (!ausgabe) return problemAntwort(404, { title: 'Ausgabe nicht gefunden' })
        if (ausgabe.storno) return ausgabeKonfliktAntwort('bereits_storniert', 'Diese Ausgabe ist bereits storniert.')
        const grund = String((anfrage.body as { grund?: string } | null)?.grund ?? '').trim()
        ausgabe.storno = { am: '2026-10-08T10:00:00+00:00', von: akteur, grund }
        return jsonAntwort(200, structuredClone(ausgabe))
      }
      const art = coinPfad[2]
      if (art === 'exemplare' && anfrage.methode === 'GET') {
        const status = anfrage.query.get('status')
        const auflage = coin.auflage ?? 0
        const alle = Array.from({ length: auflage }, (_, i) => ({
          nummer: i + 1,
          status: aktiv(i + 1) ? ('ausgegeben' as const) : ('verfuegbar' as const),
        }))
        const ausgegeben = alle.filter((e) => e.status === 'ausgegeben').length
        const gefiltert = status ? alle.filter((e) => e.status === status) : alle
        return jsonAntwort(200, {
          kennzahlen: { auflage: coin.auflage, ausgegeben, verfuegbar: auflage - ausgegeben },
          ...seiteVon(gefiltert, anfrage.query),
        })
      }
      if (art === 'ausgaben' && anfrage.methode === 'GET') {
        const status = anfrage.query.get('status')
        const gefiltert = liste.filter((a) => !status || (status === 'aktiv') === (a.storno === null))
        return jsonAntwort(200, seiteVon(structuredClone(gefiltert), anfrage.query))
      }
      if (art === 'ausgaben' && anfrage.methode === 'POST') {
        const daten = (anfrage.body ?? {}) as Record<string, unknown>
        if (coin.auflage === null) return ausgabeKonfliktAntwort('auflage_unbekannt')
        let nummer = typeof daten.exemplarNummer === 'number' ? daten.exemplarNummer : null
        if (nummer === null) {
          nummer = Array.from({ length: coin.auflage }, (_, i) => i + 1).find((nr) => !aktiv(nr)) ?? null
          if (nummer === null) return ausgabeKonfliktAntwort('kein_exemplar_frei')
        } else if (nummer < 1 || nummer > coin.auflage) {
          return problemAntwort(400, {
            title: 'Eingaben ungültig',
            errors: { exemplarNummer: [`Exemplar-Nummer muss zwischen 1 und ${coin.auflage} liegen.`] },
          })
        } else if (aktiv(nummer)) {
          return ausgabeKonfliktAntwort('exemplar_ausgegeben', `Exemplar Nr. ${nummer} ist bereits ausgegeben.`)
        }
        zaehler++
        const text = (wert: unknown) => (typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : null)
        const ausgabe: Ausgabe = {
          id: `0199a1b2-0000-7000-8000-${String(zaehler).padStart(12, 'e')}`,
          exemplarNummer: nummer,
          zertifikatsnummer: testZertifikatsnummer(nummer),
          empfaenger: {
            name: text(daten.empfaengerName) ?? '',
            dienstgrad: text(daten.empfaengerDienstgrad),
            dienststelle: text(daten.empfaengerDienststelle),
          },
          datum: String(daten.datum),
          gelegenheit: text(daten.gelegenheit) ?? '',
          begruendung: text(daten.begruendung) ?? '',
          ausgebendeStelle: text(daten.ausgebendeStelle) ?? '',
          erfasstAm: '2026-10-08T09:30:00+00:00',
          erfasstVon: akteur,
          storno: null,
        }
        liste.unshift(ausgabe)
        return jsonAntwort(201, structuredClone(ausgabe))
      }
      if (art === 'auflage' && anfrage.methode === 'PUT') {
        const neu = (anfrage.body as { auflage?: number | null } | null)?.auflage ?? null
        if (neu === null) {
          return problemAntwort(400, { title: 'Eingaben ungültig', errors: { auflage: ['Auflage ist erforderlich.'] } })
        }
        const hoechste = Math.max(0, ...liste.map((a) => a.exemplarNummer))
        if (neu < hoechste) {
          return ausgabeKonfliktAntwort(
            'auflage_zu_klein',
            `Die Auflage kann nicht unter ${hoechste} gesenkt werden, weil Exemplar Nr. ${hoechste} ausgegeben wurde.`,
          )
        }
        coin.auflage = neu
        return jsonAntwort(200, { ...coin })
      }
      return problemAntwort(404)
    }
    const einzeln = /^\/api\/coins\/([^/]+)$/.exec(anfrage.pfad)
    if (anfrage.methode === 'GET' && einzeln) {
      // katalog-seiten (AK-17): GET /api/coins/{id}; unbekannt → 404 „Coin nicht gefunden“.
      const coin = coins.find((c) => c.id === decodeURIComponent(einzeln[1]))
      return coin ? jsonAntwort(200, { ...coin }) : problemAntwort(404, { title: 'Coin nicht gefunden' })
    }
    if (anfrage.methode === 'PUT' && einzeln) {
      // zertifikatsvorlagen (AK-22): Stammdaten ersetzen; Duplikat, Auflage-Regel und auflage: null wie im Backend.
      const coin = coins.find((c) => c.id === decodeURIComponent(einzeln[1]))
      if (!coin) return problemAntwort(404, { title: 'Coin nicht gefunden' })
      const daten = (anfrage.body ?? {}) as Partial<Record<'name' | 'herausgeber' | 'beschreibung', string | null>> & {
        auflage?: number | null
      }
      const name = String(daten.name ?? '').trim()
      const herausgeber = String(daten.herausgeber ?? '').trim()
      const auflage = daten.auflage ?? null
      if (auflage === null && coin.auflage !== null) {
        return problemAntwort(400, { title: 'Eingaben ungültig', errors: { auflage: ['Auflage ist erforderlich.'] } })
      }
      const gleich = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
      if (coins.some((c) => c.id !== coin.id && gleich(c.name, name) && gleich(c.herausgeber, herausgeber))) {
        return problemAntwort(409, {
          title: 'Coin existiert bereits',
          code: 'coin_existiert',
          detail: 'Ein Coin mit diesem Namen und Herausgeber existiert bereits.',
        })
      }
      const hoechste = Math.max(0, ...(ausgaben[coin.id] ?? []).map((a) => a.exemplarNummer))
      if (auflage !== null && auflage < hoechste) {
        return ausgabeKonfliktAntwort(
          'auflage_zu_klein',
          `Die Auflage kann nicht unter ${hoechste} gesenkt werden, weil Exemplar Nr. ${hoechste} ausgegeben wurde.`,
        )
      }
      Object.assign(coin, { name, herausgeber, auflage, beschreibung: daten.beschreibung?.trim() || null })
      return jsonAntwort(200, { ...coin })
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
    /** Ausgaben je Coin-Id, neueste zuerst; POST …/ausgaben fügt vorne an, Storno ändert den Eintrag. */
    ausgaben,
    /** Vorlagenstatus je Coin-Id (zertifikatsvorlagen); Upload und Zurücksetzen wirken hier. */
    vorlagen,
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
