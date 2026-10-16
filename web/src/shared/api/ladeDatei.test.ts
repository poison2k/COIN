import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { docxAntwort, erstelleFakeApi, problemAntwort, type FakeApi } from '../../../test/fakeApi'
import { ladeDatei, setzeBeiDeaktiviert } from './index'

// Feature zertifikatsvorlagen, Abschnitt 7 und AK-30: ladeDatei(url) lädt eine Datei per fetch mit Bearer-Token
// (wie sende) und liefert den Blob; Fehler werden wie bei bildeAb abgebildet. Kein Token in der URL.

const URL_AKTIV = '/api/coins/0199a1b2-0000-7000-8000-0000000000a1/zertifikatsvorlage/datei'

let api: FakeApi

// Rev. 3: ladeDatei liefert { blob, dateiname } (dateiname aus Content-Disposition, filename* vor filename, sonst null).
// Lose typisiert, damit die Tests schon vor der Umstellung von ApiErgebnis<Blob> übersetzt werden.
interface DateiDaten {
  blob?: Blob
  dateiname?: string | null
}

function dateiDaten(ergebnis: Awaited<ReturnType<typeof ladeDatei>>): DateiDaten | null {
  return ergebnis.art === 'ok' ? (ergebnis.daten as unknown as DateiDaten) : null
}

function antwortMit(contentDisposition: string | null): Response {
  const headers = new Headers({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  if (contentDisposition !== null) headers.set('Content-Disposition', contentDisposition)
  return new Response(new Blob(['PK']), { status: 200, headers })
}

beforeEach(() => {
  api = erstelleFakeApi()
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-datei')
})

afterEach(() => {
  setzeTokenQuelle(null)
  setzeBeiDeaktiviert(null)
})

describe('ladeDatei – Erfolg', () => {
  it('liefert bei 200 den Blob', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, docxAntwort('vorlage.docx', 'PK-inhalt'))

    const ergebnis = await ladeDatei(URL_AKTIV)

    expect(ergebnis.art).toBe('ok')
    const blob = dateiDaten(ergebnis)?.blob
    expect(blob).toBeInstanceOf(Blob)
    expect(await blob?.text()).toBe('PK-inhalt')
  })

  it('sendet GET mit Authorization: Bearer', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, docxAntwort('vorlage.docx'))

    await ladeDatei(URL_AKTIV)

    expect(api.anfragen[0].methode).toBe('GET')
    expect(api.anfragen[0].headers.get('Authorization')).toBe('Bearer token-datei')
  })

  it('setzt das Token nie in die URL', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, docxAntwort('vorlage.docx'))

    await ladeDatei(URL_AKTIV)

    expect(api.anfragen[0].pfad).toBe(URL_AKTIV)
    expect(api.anfragen[0].query.toString()).not.toContain('token')
    expect(String(api.fetch.mock.calls[0][0])).not.toContain('token-datei')
  })

  it('sendet keinen Authorization-Header an eine fremde Origin', async () => {
    api.einmal('GET', /.*/, docxAntwort('vorlage.docx'))

    await ladeDatei('https://fremd.example/api/datei')

    expect(api.anfragen[0].headers.has('Authorization')).toBe(false)
  })
})

describe('ladeDatei – Dateiname aus Content-Disposition (Rev. 3)', () => {
  it('liefert den Namen aus filename', async () => {
    api.einmal('GET', /.*/, antwortMit('attachment; filename="zertifikatsvorlage-abc-v3.docx"'))

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.dateiname).toBe('zertifikatsvorlage-abc-v3.docx')
  })

  it('liefert den Namen aus filename ohne Anführungszeichen', async () => {
    api.einmal('GET', /.*/, antwortMit('attachment; filename=zertifikatsvorlage-abc-v3.docx'))

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.dateiname).toBe('zertifikatsvorlage-abc-v3.docx')
  })

  it('bevorzugt filename* vor filename', async () => {
    api.einmal(
      'GET',
      /.*/,
      antwortMit(`attachment; filename="alt.docx"; filename*=UTF-8''zertifikatsvorlage-abc-v4.docx`),
    )

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.dateiname).toBe('zertifikatsvorlage-abc-v4.docx')
  })

  it('dekodiert die Prozentkodierung in filename*', async () => {
    api.einmal('GET', /.*/, antwortMit(`attachment; filename*=UTF-8''zertifikatsvorlage%2Dabc%2Dv5.docx`))

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.dateiname).toBe('zertifikatsvorlage-abc-v5.docx')
  })

  it('liefert null ohne Content-Disposition', async () => {
    api.einmal('GET', /.*/, antwortMit(null))

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.dateiname).toBeNull()
  })

  it('liefert null bei Content-Disposition ohne Dateinamen', async () => {
    api.einmal('GET', /.*/, antwortMit('attachment'))

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.dateiname).toBeNull()
  })

  it('liefert neben dem Dateinamen den Blob', async () => {
    api.einmal('GET', /.*/, antwortMit('attachment; filename="zertifikatsvorlage-abc-v3.docx"'))

    expect(dateiDaten(await ladeDatei(URL_AKTIV))?.blob).toBeInstanceOf(Blob)
  })
})

describe('ladeDatei – Fehler', () => {
  it('bildet 404 auf nichtGefunden ab', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, problemAntwort(404, { title: 'Vorlage nicht gefunden' }))

    expect(await ladeDatei(URL_AKTIV)).toEqual({ art: 'nichtGefunden' })
  })

  it('bildet 403 keine_berechtigung auf keinZugriff ab', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, problemAntwort(403, { code: 'keine_berechtigung' }))

    expect(await ladeDatei(URL_AKTIV)).toEqual({ art: 'keinZugriff', grund: 'keineBerechtigung' })
  })

  it('bildet 403 benutzer_deaktiviert ab und meldet die Deaktivierung', async () => {
    const beiDeaktiviert = vi.fn()
    setzeBeiDeaktiviert(beiDeaktiviert)
    api.einmal('GET', /zertifikatsvorlage\/datei$/, problemAntwort(403, { code: 'benutzer_deaktiviert' }))

    expect(await ladeDatei(URL_AKTIV)).toEqual({ art: 'keinZugriff', grund: 'deaktiviert' })
    expect(beiDeaktiviert).toHaveBeenCalledTimes(1)
  })

  it('bildet 401 auf nichtAngemeldet ab', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, problemAntwort(401))

    expect(await ladeDatei(URL_AKTIV)).toEqual({ art: 'nichtAngemeldet' })
  })

  it('bildet 500 auf fehler ab', async () => {
    api.einmal('GET', /zertifikatsvorlage\/datei$/, problemAntwort(500))

    expect(await ladeDatei(URL_AKTIV)).toEqual({ art: 'fehler' })
  })

  it('bildet einen Netzwerkfehler ohne Ausnahme auf fehler ab', async () => {
    api.netzwerkfehler('GET', /zertifikatsvorlage\/datei$/)

    expect(await ladeDatei(URL_AKTIV)).toEqual({ art: 'fehler' })
  })
})
