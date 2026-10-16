import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VorlagenStatus } from '@/entities/zertifikatsvorlage'
import { beobachteDownloads } from '../../../../test/downloads'
import {
  docxAntwort,
  erstelleFakeApi,
  jsonAntwort,
  offeneAntwort,
  problemAntwort,
  testCoin,
  testDatei,
  testVorlagenStatus,
  testVorlagenVersion,
  type FakeApi,
} from '../../../../test/fakeApi'
import { meldungMit, seitentext } from '../../../../test/hilfen'
import { ZertifikatsvorlageVerwalten } from '../index'

// Feature zertifikatsvorlagen, AK-30, AK-32 und AK-33: Widget „Zertifikatsvorlage“ auf „Coin bearbeiten“. Lädt den
// Status, zeigt ihn als Text, bietet die Downloads (aktuelle, Standard, je Version), die Versionstabelle, den Upload
// und – nur mit eigener aktiver Vorlage – das Zurücksetzen. Statusmeldungen nach Upload und Zurücksetzen.
// Props { coinId }.

const COIN_A = '0199a1b2-0000-7000-8000-0000000000a1'
const COIN_B = '0199a1b2-0000-7000-8000-0000000000a2'
const STATUS = /^\/api\/coins\/[^/]+\/zertifikatsvorlage$/
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOWNLOAD_FEHLER = 'Die Vorlage konnte nicht heruntergeladen werden. Bitte später erneut versuchen.'

const ZWEI_VERSIONEN = testVorlagenStatus(
  [
    testVorlagenVersion({ version: 2, hochgeladenAm: '2026-10-09T09:00:00+00:00' }),
    testVorlagenVersion({ version: 1, hochgeladenAm: '2026-10-08T09:00:00+00:00' }),
  ],
  2,
)

let api: FakeApi

function zeige(status: VorlagenStatus | null = ZWEI_VERSIONEN, coinId = COIN_A) {
  api = erstelleFakeApi([testCoin({ id: COIN_A }), testCoin({ id: COIN_B, name: 'Coin Beta' })], {
    vorlagen: status ? { [COIN_A]: status } : {},
  })
  vi.stubGlobal('fetch', api.fetch)
  const user = userEvent.setup({ applyAccept: false })
  const ansicht = render(<ZertifikatsvorlageVerwalten coinId={coinId} />)
  return { user, ...ansicht }
}

beforeEach(() => {
  beobachteDownloads()
})

async function statusText(text: string) {
  await waitFor(() => expect(seitentext()).toContain(text))
}

describe('Status', () => {
  it('lädt den Vorlagenstatus genau einmal', async () => {
    zeige()
    await statusText('Aktiv: eigene Vorlage, Version 2')

    expect(api.anfragenMit('GET', STATUS).map((a) => a.pfad)).toEqual([`/api/coins/${COIN_A}/zertifikatsvorlage`])
  })

  it('zeigt „Aktiv: eigene Vorlage, Version 2“ bei eigener Vorlage', async () => {
    zeige()

    await statusText('Aktiv: eigene Vorlage, Version 2')
  })

  it('zeigt „Aktiv: Standardvorlage“ ohne eigene Vorlage', async () => {
    zeige(null)

    await statusText('Aktiv: Standardvorlage')
  })

  it('zeigt ohne Versionen „Es wurde noch keine eigene Vorlage hochgeladen.“ und keine Tabelle', async () => {
    zeige(null)

    await statusText('Es wurde noch keine eigene Vorlage hochgeladen.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('zeigt die Versionen in der Tabelle „Versionen der Zertifikatsvorlage“', async () => {
    zeige()

    const tabelle = await screen.findByRole('table', { name: 'Versionen der Zertifikatsvorlage' })
    expect(within(tabelle).getAllByRole('row')).toHaveLength(3)
  })

  it('bietet je Version „Herunterladen“ mit dem Namen „Version {n} herunterladen“', async () => {
    zeige()

    expect(await screen.findByRole('button', { name: 'Version 2 herunterladen' })).toHaveTextContent('Herunterladen')
    expect(screen.getByRole('button', { name: 'Version 1 herunterladen' })).toBeInTheDocument()
  })

  it('bietet kein „Aktivieren“ (F6)', async () => {
    zeige()
    await statusText('Aktiv: eigene Vorlage, Version 2')

    expect(seitentext()).not.toMatch(/aktivieren/i)
  })

  it('zeigt bei einem Ladefehler einen Alarm', async () => {
    api = erstelleFakeApi([testCoin({ id: COIN_A })])
    api.einmal('GET', STATUS, problemAntwort(500))
    vi.stubGlobal('fetch', api.fetch)
    render(<ZertifikatsvorlageVerwalten coinId={COIN_A} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('verwirft veraltete Antworten nach einem Wechsel des Coins', async () => {
    const veraltet = offeneAntwort()
    const { rerender } = zeige(null)
    await statusText('Aktiv: Standardvorlage')
    // Die Antwort für Coin B kommt erst, nachdem schon wieder Coin A angezeigt wird.
    api.einmal('GET', STATUS, () => veraltet.promise)
    rerender(<ZertifikatsvorlageVerwalten coinId={COIN_B} />)
    await waitFor(() => expect(api.anfragenMit('GET', STATUS).some((a) => a.pfad.includes(COIN_B))).toBe(true))
    rerender(<ZertifikatsvorlageVerwalten coinId={COIN_A} />)
    await statusText('Aktiv: Standardvorlage')

    veraltet.aufloesen(jsonAntwort(200, ZWEI_VERSIONEN))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(seitentext()).toContain('Aktiv: Standardvorlage')
    expect(seitentext()).not.toContain('Version 2')
  })

  it('zeigt keine englischen Texte', async () => {
    zeige()
    await statusText('Aktiv: eigene Vorlage, Version 2')

    expect(seitentext()).not.toMatch(/\b(Download|Upload|Active|Version history|Size|Uploaded|Reset|Template)\b/)
  })
})

describe('Downloads', () => {
  it('bietet „Aktuelle Vorlage herunterladen“ und „Standardvorlage herunterladen“', async () => {
    zeige()

    expect(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standardvorlage herunterladen' })).toBeInTheDocument()
  })

  it('speichert die aktuelle eigene Vorlage als zertifikatsvorlage-{coinId}-v2.docx', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    await user.click(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual([`zertifikatsvorlage-${COIN_A}-v2.docx`]))
    expect(api.anfragenMit('GET', /\/zertifikatsvorlage\/datei$/)).toHaveLength(1)
  })

  it('speichert ohne eigene Vorlage die aktuelle als zertifikatsvorlage-{coinId}-standard.docx', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige(null)

    await user.click(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' }))

    await waitFor(() =>
      expect(downloads.map((d) => d.dateiname)).toEqual([`zertifikatsvorlage-${COIN_A}-standard.docx`]),
    )
  })

  it('speichert die Standardvorlage als zertifikatsvorlage-standard.docx', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    await user.click(await screen.findByRole('button', { name: 'Standardvorlage herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['zertifikatsvorlage-standard.docx']))
  })

  it('speichert eine bestimmte Version als zertifikatsvorlage-{coinId}-v1.docx', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    await user.click(await screen.findByRole('button', { name: 'Version 1 herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual([`zertifikatsvorlage-${COIN_A}-v1.docx`]))
    expect(api.anfragenMit('GET', /\/versionen\/1\/datei$/)).toHaveLength(1)
  })

  it('sendet Downloads mit Token im Header, nie in der URL', async () => {
    const { user } = zeige()

    await user.click(await screen.findByRole('button', { name: 'Version 1 herunterladen' }))

    await waitFor(() => expect(api.anfragenMit('GET', /\/datei$/)).toHaveLength(1))
    expect(api.anfragenMit('GET', /\/datei$/)[0].query.toString()).toBe('')
  })

  it('sperrt den jeweiligen Button während des Downloads', async () => {
    const offen = offeneAntwort()
    const { user } = zeige()
    api.einmal('GET', /\/versionen\/1\/datei$/, () => offen.promise)
    const knopf = (await screen.findByRole('button', { name: 'Version 1 herunterladen' })) as HTMLButtonElement

    await user.click(knopf)

    expect(knopf.disabled || knopf.getAttribute('aria-disabled') === 'true').toBe(true)
    offen.aufloesen(problemAntwort(404))
  })

  it('speichert die aktuelle Vorlage unter dem Dateinamen aus Content-Disposition, auch wenn der Status veraltet ist', async () => {
    // Der Status zeigt Version 2; inzwischen hat jemand anderes Version 3 hochgeladen. Maßgeblich ist die Antwort.
    const { downloads } = beobachteDownloads()
    const { user } = zeige()
    api.einmal('GET', /\/zertifikatsvorlage\/datei$/, docxAntwort(`zertifikatsvorlage-${COIN_A}-v3.docx`, 'PK-v3'))

    await user.click(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual([`zertifikatsvorlage-${COIN_A}-v3.docx`]))
  })

  it('speichert die aktuelle Vorlage nach serverseitigem Zurücksetzen unter dem Standard-Dateinamen aus Content-Disposition', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()
    api.einmal(
      'GET',
      /\/zertifikatsvorlage\/datei$/,
      docxAntwort(`zertifikatsvorlage-${COIN_A}-standard.docx`, 'PK-standard'),
    )

    await user.click(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' }))

    await waitFor(() =>
      expect(downloads.map((d) => d.dateiname)).toEqual([`zertifikatsvorlage-${COIN_A}-standard.docx`]),
    )
  })

  it('speichert ohne Content-Disposition unter dem berechneten Dateinamen', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()
    api.einmal(
      'GET',
      /\/zertifikatsvorlage\/datei$/,
      new Response(new Blob(['PK-ohne-name']), { status: 200, headers: { 'Content-Type': DOCX } }),
    )

    await user.click(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual([`zertifikatsvorlage-${COIN_A}-v2.docx`]))
  })

  it('zeigt bei einem Fehler den Download-Alarm', async () => {
    const { user } = zeige()
    api.einmal('GET', /\/zertifikatsvorlage\/datei$/, problemAntwort(500))

    await user.click(await screen.findByRole('button', { name: 'Aktuelle Vorlage herunterladen' }))

    await waitFor(() => expect(meldungMit(DOWNLOAD_FEHLER)?.getAttribute('role')).toBe('alert'))
  })
})

describe('Upload', () => {
  it('meldet nach dem Upload „Version 3 wurde hochgeladen und ist jetzt aktiv.“ als Status', async () => {
    const { user } = zeige()
    await user.upload(await screen.findByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    await waitFor(() =>
      expect(meldungMit('Version 3 wurde hochgeladen und ist jetzt aktiv.')?.getAttribute('role')).toBe('status'),
    )
  })

  it('aktualisiert Status und Tabelle nach dem Upload', async () => {
    const { user } = zeige()
    await user.upload(await screen.findByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    await statusText('Aktiv: eigene Vorlage, Version 3')
    expect(await screen.findByRole('button', { name: 'Version 3 herunterladen' })).toBeInTheDocument()
  })

  it('zeigt nach dem ersten Upload die Tabelle statt des Leer-Texts', async () => {
    const { user } = zeige(null)
    await user.upload(await screen.findByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    expect(await screen.findByRole('table', { name: 'Versionen der Zertifikatsvorlage' })).toBeInTheDocument()
    expect(seitentext()).not.toContain('Es wurde noch keine eigene Vorlage hochgeladen.')
  })

  it('lässt bei einer Ablehnung die bisherige Vorlage aktiv', async () => {
    const { user } = zeige()
    api.einmal(
      'POST',
      /\/versionen$/,
      problemAntwort(400, {
        errors: { datei: ['Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.'] },
      }),
    )
    await user.upload(await screen.findByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Die Vorlage wurde nicht übernommen:')
    expect(seitentext()).toContain('Aktiv: eigene Vorlage, Version 2')
  })
})

describe('Erfolgsmeldung beim nächsten Upload-Versuch', () => {
  const ERFOLG = 'Version 3 wurde hochgeladen und ist jetzt aktiv.'

  async function ersterUpload(user: ReturnType<typeof userEvent.setup>) {
    await user.upload(await screen.findByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))
    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))
    await waitFor(() => expect(meldungMit(ERFOLG)).toBeTruthy())
  }

  it('entfernt die Erfolgsmeldung, sobald ein neuer Upload startet', async () => {
    const { user } = zeige()
    await ersterUpload(user)
    const offen = offeneAntwort()
    api.einmal('POST', /\/versionen$/, () => offen.promise)
    await user.upload(screen.getByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'zweite.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    await waitFor(() => expect(seitentext()).not.toContain(ERFOLG))
    offen.aufloesen(problemAntwort(500))
  })

  it('zeigt die Erfolgsmeldung nach einer Ablehnung des neuen Uploads nicht mehr', async () => {
    const { user } = zeige()
    await ersterUpload(user)
    api.einmal(
      'POST',
      /\/versionen$/,
      problemAntwort(400, {
        errors: { datei: ['Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.'] },
      }),
    )
    await user.upload(screen.getByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'zweite.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Die Vorlage wurde nicht übernommen:')
    expect(seitentext()).not.toContain(ERFOLG)
  })

  it('entfernt die Meldung „Die Standardvorlage ist jetzt aktiv.“, sobald ein Upload startet', async () => {
    const { user } = zeige()
    await user.click(await screen.findByRole('button', { name: 'Auf Standardvorlage zurücksetzen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Auf Standardvorlage zurücksetzen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))
    await waitFor(() => expect(meldungMit('Die Standardvorlage ist jetzt aktiv.')).toBeTruthy())
    const offen = offeneAntwort()
    api.einmal('POST', /\/versionen$/, () => offen.promise)
    await user.upload(screen.getByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    await waitFor(() => expect(seitentext()).not.toContain('Die Standardvorlage ist jetzt aktiv.'))
    offen.aufloesen(problemAntwort(500))
  })

  it('entfernt die Fehlerliste eines abgelehnten Uploads, sobald der nächste Upload startet', async () => {
    const { user } = zeige()
    api.einmal(
      'POST',
      /\/versionen$/,
      problemAntwort(400, {
        errors: { datei: ['Die Datei enthält Makros. Bitte als Word-Dokument ohne Makros (.docx) speichern.'] },
      }),
    )
    await user.upload(await screen.findByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'urkunde.docx'))
    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Vorlage wurde nicht übernommen:')
    const offen = offeneAntwort()
    api.einmal('POST', /\/versionen$/, () => offen.promise)
    await user.upload(screen.getByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'zweite.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    await waitFor(() => expect(seitentext()).not.toContain('Die Vorlage wurde nicht übernommen:'))
    offen.aufloesen(problemAntwort(500))
  })

  it('zeigt die Erfolgsmeldung nach einem zu großen neuen Upload (413) nicht mehr', async () => {
    const { user } = zeige()
    await ersterUpload(user)
    api.einmal('POST', /\/versionen$/, problemAntwort(413, { title: 'Vorlage zu groß' }))
    await user.upload(screen.getByLabelText('Word-Vorlage (.docx)'), testDatei(DOCX, 2048, 'zweite.docx'))

    await user.click(screen.getByRole('button', { name: 'Vorlage hochladen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Die Vorlage darf höchstens 5 MB groß sein.')
    expect(seitentext()).not.toContain(ERFOLG)
  })
})

describe('Zurücksetzen', () => {
  it('bietet „Auf Standardvorlage zurücksetzen“ nur mit eigener aktiver Vorlage', async () => {
    zeige()

    expect(await screen.findByRole('button', { name: 'Auf Standardvorlage zurücksetzen' })).toBeInTheDocument()
  })

  it('bietet ohne eigene aktive Vorlage kein Zurücksetzen', async () => {
    zeige(testVorlagenStatus([testVorlagenVersion({ version: 1 })], null))
    await statusText('Aktiv: Standardvorlage')

    expect(screen.queryByRole('button', { name: 'Auf Standardvorlage zurücksetzen' })).not.toBeInTheDocument()
  })

  async function zuruecksetzen(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Auf Standardvorlage zurücksetzen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Auf Standardvorlage zurücksetzen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))
  }

  it('meldet „Die Standardvorlage ist jetzt aktiv.“ als Status und setzt den Fokus darauf', async () => {
    const { user } = zeige()

    await zuruecksetzen(user)

    const meldung = await waitFor(() => {
      const el = meldungMit('Die Standardvorlage ist jetzt aktiv.')
      expect(el?.getAttribute('role')).toBe('status')
      return el as HTMLElement
    })
    await waitFor(() => expect(meldung).toHaveFocus())
  })

  it('zeigt danach „Aktiv: Standardvorlage“, behält die Versionen und blendet den Button aus', async () => {
    const { user } = zeige()

    await zuruecksetzen(user)

    await statusText('Aktiv: Standardvorlage')
    expect(screen.getByRole('button', { name: 'Version 2 herunterladen' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Auf Standardvorlage zurücksetzen' })).not.toBeInTheDocument(),
    )
  })
})
