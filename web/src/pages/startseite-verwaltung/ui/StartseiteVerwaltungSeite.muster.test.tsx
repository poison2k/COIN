import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ME } from '../../../../test/anmeldung'
import { erstelleFakeApi, offeneAntwort, problemAntwort, type FakeApi } from '../../../../test/fakeApi'
import {
  erwarteFeldfehler,
  erwarteKeinenFeldfehler,
  erwarteLaedt,
  erwartePflicht,
  liegtVor,
  zusammenfassung,
  zusammenfassungsLinks,
} from '../../../../test/formular'
import { zeigeMitRouter } from '../../../../test/router'
import { testKonfiguration } from '../../../../test/startseite'
import { StartseiteVerwaltungSeite } from '../index'

// Feature formulare-detailseiten, AK-1, AK-2, AK-4 bis AK-7 und AK-10 (Abschnitt 4.1, 4.2): Formularmuster auf
// „Startseite verwalten“ (features/startseite-konfigurieren). Liegt bei der Seite, weil das Formular nur mit der Seite
// geladen wird (FSD: Tests im Feature dürfen die Seite nicht importieren). Block-Karten je ein Abschnitt; Pflicht:
// Titel bei aktivem Kopfbereich, Infotext bei aktivem Infotext-Block. Zusammenfassung wie bisher ab einem Fehler,
// jetzt oben im Formular. Die Startseite sperrt beim Speichern weiterhin die Felder (Bestand).

const PUT = /^\/api\/startseite\/konfiguration$/

let api: FakeApi

function zeige(kopfAktiv = true) {
  const konfiguration = testKonfiguration()
  ;(konfiguration as unknown as { kopf: { aktiv: boolean } }).kopf.aktiv = kopfAktiv
  api = erstelleFakeApi([], { me: ME.admin, startseite: { konfiguration } })
  vi.stubGlobal('fetch', api.fetch)
  const user = userEvent.setup({ applyAccept: false })
  zeigeMitRouter(() => <StartseiteVerwaltungSeite onGeaendert={vi.fn()} />)
  return user
}

async function geladen(): Promise<void> {
  await screen.findByRole('switch', { name: 'Kopfbereich anzeigen' })
}

const titel = () => screen.getByRole('textbox', { name: /^Titel/ })
const infotext = () => screen.getByRole('textbox', { name: /^Infotext/ })
const speichernKnopf = () => screen.getByRole('button', { name: 'Speichern' })

describe('Abschnitte (AK-1)', () => {
  it('stellt Titel und Untertitel in den Abschnitt „Kopfbereich“', async () => {
    zeige()
    await geladen()

    const gruppe = screen.getByRole('group', { name: 'Kopfbereich' })
    expect(gruppe).toContainElement(titel())
    expect(gruppe).toContainElement(screen.getByRole('textbox', { name: /^Untertitel/ }))
  })

  it('stellt den Infotext in den Abschnitt „Infotext“', async () => {
    zeige()
    await geladen()

    expect(screen.getByRole('group', { name: 'Infotext' })).toContainElement(infotext())
  })
})

describe('Pflicht (AK-2)', () => {
  it('kennzeichnet den Titel bei aktivem Kopfbereich als Pflicht', async () => {
    zeige(true)
    await geladen()

    erwartePflicht(titel())
  })

  it('kennzeichnet den Infotext bei aktivem Infotext-Block als Pflicht', async () => {
    zeige()
    await geladen()

    erwartePflicht(infotext())
  })
})

describe('Validierung beim Verlassen (AK-4, AK-5)', () => {
  it('zeigt beim Verlassen ohne Änderung keinen Fehler', async () => {
    const user = zeige()
    await geladen()

    await user.click(titel())
    await user.tab()

    erwarteKeinenFeldfehler(titel())
  })

  it('zeigt nach Leeren und Verlassen des Titels die bestehende Meldung', async () => {
    const user = zeige()
    await geladen()

    await user.clear(titel())
    erwarteKeinenFeldfehler(titel())
    await user.tab()

    erwarteFeldfehler(titel(), 'Bitte einen Titel eingeben oder den Kopfbereich ausschalten.')
  })

  it('entfernt den Fehler bei der Eingabe eines gültigen Titels', async () => {
    const user = zeige()
    await geladen()
    await user.clear(titel())
    await user.tab()

    await user.type(titel(), 'C.O.I.N.')

    erwarteKeinenFeldfehler(titel())
  })
})

describe('Zusammenfassung oben (AK-7, Startseite ab einem Fehler)', () => {
  it('zeigt die Zusammenfassung schon bei einem Fehler', async () => {
    const user = zeige()
    await geladen()
    await user.clear(infotext())

    await user.click(speichernKnopf())

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    expect(zusammenfassungsLinks()).toHaveLength(1)
  })

  it('stellt die Zusammenfassung vor den ersten Abschnitt', async () => {
    const user = zeige()
    await geladen()
    await user.clear(infotext())

    await user.click(speichernKnopf())

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    const erster = within(titel().closest('form') as HTMLElement).getAllByRole('group')[0]
    expect(liegtVor(zusammenfassung() as HTMLElement, erster)).toBe(true)
  })

  it('stellt die Zusammenfassung vor das erste Feld', async () => {
    const user = zeige()
    await geladen()
    await user.clear(infotext())

    await user.click(speichernKnopf())

    await waitFor(() => expect(zusammenfassung()).toBeDefined())
    expect(liegtVor(zusammenfassung() as HTMLElement, titel())).toBe(true)
  })

  it('fokussiert per Link das Feld', async () => {
    const user = zeige()
    await geladen()
    await user.clear(titel())
    await user.clear(infotext())
    await user.click(speichernKnopf())
    await waitFor(() => expect(zusammenfassung()).toBeDefined())

    const link = within(zusammenfassung() as HTMLElement)
      .getAllByRole('link')
      .find((l) => l.textContent?.includes('Infotext')) as HTMLElement
    await user.click(link)

    expect(infotext()).toHaveFocus()
  })
})

describe('Ladezustand (AK-10)', () => {
  it('zeigt am Speichern-Button den Ladezustand', async () => {
    const user = zeige()
    await geladen()
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    await user.clear(titel())
    await user.type(titel(), 'Neu')

    await user.click(speichernKnopf())

    await waitFor(() => erwarteLaedt(speichernKnopf()))
    offen.aufloesen(problemAntwort(500))
  })

  it('sendet bei Doppelklick genau einen PUT', async () => {
    const user = zeige()
    await geladen()
    const offen = offeneAntwort()
    api.einmal('PUT', PUT, () => offen.promise)
    await user.clear(titel())
    await user.type(titel(), 'Neu')

    await user.dblClick(speichernKnopf())

    expect(api.anfragenMit('PUT', PUT)).toHaveLength(1)
    offen.aufloesen(problemAntwort(500))
  })
})
