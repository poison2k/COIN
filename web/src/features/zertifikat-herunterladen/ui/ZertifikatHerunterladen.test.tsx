import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ausgabe } from '@/entities/ausgabe'
import { setzeTokenQuelle } from '@/shared/lib/anmeldung'
import { beobachteDownloads } from '../../../../test/downloads'
import {
  docxAntwort,
  erstelleFakeApi,
  keinZugriffAntwort,
  offeneAntwort,
  problemAntwort,
  testAusgabe,
  testCoin,
  zertifikatKonfliktAntwort,
  type FakeApi,
} from '../../../../test/fakeApi'
import { seitentext } from '../../../../test/hilfen'
import { ZertifikatHerunterladen } from '../index'

// Feature zertifikat-erzeugen, AK-24 bis AK-26 und AK-30: Button „Zertifikat herunterladen“ lädt per fetch mit Token,
// ist währenddessen gesperrt und speichert die Datei; bei stornierten Ausgaben vorhanden, aber disabled. Fehler als
// role="alert" beim Button, der Fokus bleibt auf dem Button. Props { coinId, ausgabe, variante, onStorniertErkannt? }.
// „Gesperrt“ heißt `disabled` oder `aria-disabled="true"`: Nach einem 409 kommt die Ausgabe als storniert neu, der Button
// ist dann gesperrt, muss aber fokussierbar bleiben, damit der Fokus nicht auf <body> fällt (AK-26, AK-30).

const COIN_ID = '0199a1b2-0000-7000-8000-0000000000d1'
const AUSGABE_ID = '0199a1b2-0000-7000-8000-0000000000e7'
const PFAD = /^\/api\/coins\/[^/]+\/ausgaben\/[^/]+\/zertifikat$/
const NAME = 'Zertifikat C0042-0012 herunterladen'
const NAME_STORNIERT = 'Zertifikat C0042-0012 herunterladen (nicht möglich, Ausgabe storniert)'

const TEXTE = {
  storniert: 'Diese Ausgabe wurde inzwischen storniert. Ein Zertifikat kann nicht mehr heruntergeladen werden.',
  zuViele: 'Die aktive Vorlage enthält mehr als 200 Platzhalter. Bitte eine angepasste Vorlage hochladen.',
  fehler: 'Das Zertifikat konnte nicht heruntergeladen werden. Bitte später erneut versuchen.',
} as const

const AKTIV = testAusgabe({ id: AUSGABE_ID, exemplarNummer: 12 })
const STORNIERT: Ausgabe = {
  ...AKTIV,
  storno: { am: '2026-10-08T10:00:00+00:00', von: { id: 'x', name: 'Test Admin' }, grund: 'Doppelt' },
}

let api: FakeApi
let onStorniertErkannt: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  api = erstelleFakeApi([testCoin({ id: COIN_ID })], { ausgaben: { [COIN_ID]: [AKTIV] } })
  vi.stubGlobal('fetch', api.fetch)
  setzeTokenQuelle(() => 'token-zertifikat')
  onStorniertErkannt = vi.fn<() => void>()
})

afterEach(() => {
  setzeTokenQuelle(null)
})

function element(ausgabe: Ausgabe, variante: 'zeile' | 'seite') {
  return (
    <ZertifikatHerunterladen
      coinId={COIN_ID}
      ausgabe={ausgabe}
      variante={variante}
      onStorniertErkannt={onStorniertErkannt}
    />
  )
}

function zeige(ausgabe: Ausgabe = AKTIV, variante: 'zeile' | 'seite' = 'zeile') {
  const user = userEvent.setup()
  const { rerender } = render(element(ausgabe, variante))
  return { user, neuMit: (neu: Ausgabe) => rerender(element(neu, variante)) }
}

const knopf = (name: string | RegExp = NAME) => screen.getByRole('button', { name }) as HTMLButtonElement

const gesperrt = (b: HTMLButtonElement) => b.disabled || b.getAttribute('aria-disabled') === 'true'

describe('Button', () => {
  it('heißt sichtbar „Zertifikat herunterladen“ und nennt im zugänglichen Namen die Nummer', () => {
    zeige()

    expect(knopf()).toHaveTextContent('Zertifikat herunterladen')
  })

  it('sendet vor dem Klick keinen Request', () => {
    zeige()

    expect(api.anfragen).toHaveLength(0)
  })

  it('ist bei einer stornierten Ausgabe vorhanden, aber gesperrt, mit eigenem zugänglichem Namen', () => {
    zeige(STORNIERT)

    expect(gesperrt(knopf(NAME_STORNIERT))).toBe(true)
  })

  it('sendet bei einer stornierten Ausgabe auch nach einem Klick keinen Request', async () => {
    const { user } = zeige(STORNIERT)

    await user.click(knopf(NAME_STORNIERT))

    expect(api.anfragenMit('GET', PFAD)).toHaveLength(0)
  })
})

describe('Download (AK-25)', () => {
  it('lädt GET …/zertifikat mit Bearer-Token und ohne Token in der URL', async () => {
    beobachteDownloads()
    const { user } = zeige()

    await user.click(knopf())

    await waitFor(() => expect(api.anfragenMit('GET', PFAD)).toHaveLength(1))
    const anfrage = api.anfragenMit('GET', PFAD)[0]
    expect(anfrage.pfad).toBe(`/api/coins/${COIN_ID}/ausgaben/${AUSGABE_ID}/zertifikat`)
    expect(anfrage.headers.get('Authorization')).toBe('Bearer token-zertifikat')
    expect(anfrage.query.toString()).toBe('')
  })

  it('speichert die Datei unter dem Namen aus dem Header', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    await user.click(knopf())

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['Zertifikat_C0042-0012.docx']))
    expect(await downloads[0].blob?.text()).toBe('PK-zertifikat-C0042-0012')
  })

  it('verwendet bei ungültigem Header-Namen den Namen aus der Nummer', async () => {
    const { downloads } = beobachteDownloads()
    api.einmal('GET', PFAD, docxAntwort('../boese.exe'))
    const { user } = zeige()

    await user.click(knopf())

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['Zertifikat_C0042-0012.docx']))
  })

  it('startet den Download auch per Tastatur', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige()

    knopf().focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(downloads).toHaveLength(1))
  })

  it('sperrt den Button während des Downloads und sendet nur einen Request', async () => {
    beobachteDownloads()
    const offen = offeneAntwort()
    api.einmal('GET', PFAD, () => offen.promise)
    const { user } = zeige()

    await user.click(knopf())
    await user.click(knopf())

    expect(gesperrt(knopf())).toBe(true)
    expect(api.anfragenMit('GET', PFAD)).toHaveLength(1)
    offen.aufloesen(docxAntwort('Zertifikat_C0042-0012.docx'))
    await waitFor(() => expect(gesperrt(knopf())).toBe(false))
  })
})

describe('Fehler (AK-26)', () => {
  it('zeigt bei 409 ausgabe_storniert den Hinweis und meldet onStorniertErkannt', async () => {
    const { downloads } = beobachteDownloads()
    api.einmal('GET', PFAD, zertifikatKonfliktAntwort('ausgabe_storniert'))
    const { user } = zeige()

    await user.click(knopf())

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTE.storniert)
    expect(onStorniertErkannt).toHaveBeenCalledTimes(1)
    expect(downloads).toHaveLength(0)
  })

  it.each(['zeile', 'seite'] as const)(
    'lässt den Fokus nach 409 ausgabe_storniert auf dem dann gesperrten Button (Variante %s)',
    async (variante) => {
      api.einmal('GET', PFAD, zertifikatKonfliktAntwort('ausgabe_storniert'))
      const { user, neuMit } = zeige(AKTIV, variante)
      const button = screen.getByRole('button', { name: /Zertifikat.*herunterladen/ })

      await user.click(button)
      await screen.findByRole('alert')
      // Der Aufrufer lädt nach onStorniertErkannt neu und reicht die Ausgabe storniert herein.
      neuMit(STORNIERT)

      const neu = screen.getByRole('button', { name: /Zertifikat.*herunterladen/ }) as HTMLButtonElement
      expect(gesperrt(neu)).toBe(true)
      expect(neu).toHaveFocus()
      // jsdom verschiebt den Fokus bei nativem `disabled` nicht (Chromium setzt ihn auf <body>); deshalb zusätzlich: gesperrt
      // per aria-disabled, nicht per disabled-Attribut, also weiter fokussierbar.
      expect(neu).toHaveAttribute('aria-disabled', 'true')
      expect(neu).not.toHaveAttribute('disabled')
    },
  )

  it('zeigt nach 409 ausgabe_storniert und Neuladen den Alarm weiter', async () => {
    api.einmal('GET', PFAD, zertifikatKonfliktAntwort('ausgabe_storniert'))
    const { user, neuMit } = zeige()

    await user.click(knopf())
    await screen.findByRole('alert')
    neuMit(STORNIERT)

    expect(screen.getByRole('alert')).toHaveTextContent(TEXTE.storniert)
  })

  it('zeigt bei 409 vorlage_zu_viele_platzhalter den Text aus detail', async () => {
    api.einmal('GET', PFAD, zertifikatKonfliktAntwort('vorlage_zu_viele_platzhalter'))
    const { user } = zeige()

    await user.click(knopf())

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTE.zuViele)
    expect(onStorniertErkannt).not.toHaveBeenCalled()
  })

  it('zeigt bei 500 den allgemeinen Fehlertext', async () => {
    api.einmal('GET', PFAD, problemAntwort(500, { code: 'zertifikat_fehler' }))
    const { user } = zeige()

    await user.click(knopf())

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTE.fehler)
  })

  it('zeigt bei einem Netzwerkfehler den allgemeinen Fehlertext', async () => {
    api.netzwerkfehler('GET', PFAD)
    const { user } = zeige()

    await user.click(knopf())

    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTE.fehler)
  })

  it('zeigt bei 403 einen deutschen Text ohne den allgemeinen Fehlertext', async () => {
    api.einmal('GET', PFAD, keinZugriffAntwort('keine_berechtigung'))
    const { user } = zeige()

    await user.click(knopf())

    const alarm = await screen.findByRole('alert')
    expect(alarm.textContent?.trim()).not.toBe('')
    expect(alarm).not.toHaveTextContent(/Forbidden|Error/)
  })

  it('lässt den Fokus nach einem Fehler auf dem Button', async () => {
    api.einmal('GET', PFAD, problemAntwort(500))
    const { user } = zeige()

    await user.click(knopf())
    await screen.findByRole('alert')

    expect(knopf()).toHaveFocus()
  })

  it('entfernt den Alarm beim nächsten erfolgreichen Download', async () => {
    beobachteDownloads()
    api.einmal('GET', PFAD, problemAntwort(500))
    const { user } = zeige()
    await user.click(knopf())
    await screen.findByRole('alert')

    await user.click(knopf())

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('Variante „seite“ (AK-28)', () => {
  it('zeigt bei stornierter Ausgabe den Hinweis darunter, per aria-describedby verbunden', () => {
    zeige(STORNIERT, 'seite')

    const button = screen.getByRole('button', { name: /Zertifikat.*herunterladen/ }) as HTMLButtonElement
    expect(gesperrt(button)).toBe(true)
    expect(button).toHaveAccessibleDescription('Für stornierte Ausgaben kann kein Zertifikat heruntergeladen werden.')
  })

  it('lädt bei aktiver Ausgabe herunter', async () => {
    const { downloads } = beobachteDownloads()
    const { user } = zeige(AKTIV, 'seite')

    await user.click(screen.getByRole('button', { name: /Zertifikat.*herunterladen/ }))

    await waitFor(() => expect(downloads.map((d) => d.dateiname)).toEqual(['Zertifikat_C0042-0012.docx']))
  })
})

describe('deutsche Texte', () => {
  it('enthält keine englischen Texte, auch nicht in aria-label', () => {
    zeige(STORNIERT)

    const labels = [...document.body.querySelectorAll('[aria-label]')]
      .map((e) => e.getAttribute('aria-label'))
      .join(' ')
    expect(`${seitentext()} ${labels}`).not.toMatch(/\b(Download|Certificate|Cancelled|disabled|Error)\b/)
  })
})
